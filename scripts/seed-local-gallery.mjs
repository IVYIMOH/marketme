import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const seedRoot = new URL('../supabase/samples/', import.meta.url);
const bucket = 'media';

export function assertLocalTarget(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Refusing seed: invalid local API URL.'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Refusing seed: only plain HTTP loopback API targets are allowed.');
  }
  return url;
}

export function validateTargets(args, env) {
  let target;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') dryRun = true;
    else if (args[i] === '--url' && args[i + 1] && !target) target = assertLocalTarget(args[++i]);
    else throw new Error('Usage: node scripts/seed-local-gallery.mjs [--dry-run] [--url http://127.0.0.1:54321]');
  }
  for (const name of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL']) {
    if (env[name]) assertLocalTarget(env[name]);
  }
  return { target, dryRun };
}

export function sampleId(filename) {
  // UUID v5, DNS namespace. Stable across machines, resets and reruns.
  const namespace = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex');
  const bytes = createHash('sha1').update(namespace).update(`marketme.local/samples/${filename}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 0x50;
  bytes[8] = (bytes[8] & 63) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function loadSamples() {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', seedRoot), 'utf8'));
  if (!Array.isArray(manifest) || manifest.length !== 10) throw new Error('Expected exactly ten sample previews.');
  const names = new Set();
  return manifest.map((entry) => {
    if (!/^[a-z][a-z-]*\.jpg$/.test(entry.filename) || names.has(entry.filename)) throw new Error('Invalid or duplicate sample filename.');
    names.add(entry.filename);
    for (const key of ['title', 'category', 'location', 'photographer_credit', 'license_name']) {
      if (typeof entry[key] !== 'string' || !entry[key].trim()) throw new Error(`Missing sample ${key}.`);
    }
    for (const [key, host] of [['source_url', 'commons.wikimedia.org'], ['license_url', 'creativecommons.org']]) {
      const url = new URL(entry[key]);
      if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password || url.port) throw new Error(`Invalid sample ${key}.`);
    }
    const bytes = readFileSync(new URL(`images/${entry.filename}`, seedRoot));
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash !== entry.sha256) throw new Error(`Preview checksum mismatch: ${entry.filename}`);
    const row = {
      id: sampleId(entry.filename), photographer_id: null, is_sample: true,
      title: entry.title, category: entry.category, location: entry.location,
      lens: null, price_sats: 0, status: 'approved', mime_type: 'image/jpeg',
      preview_key: `samples/previews/${entry.filename}`,
      storage_key: `samples/unavailable-originals/${entry.filename}`,
      photographer_credit: entry.photographer_credit, source_url: entry.source_url,
      license_name: entry.license_name, license_url: entry.license_url,
    };
    return { entry, bytes, row };
  });
}

export function readLocalStatus() {
  try {
    return JSON.parse(execFileSync(`${root}node_modules/.bin/supabase`, ['status', '--output', 'json'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000,
    }));
  } catch {
    throw new Error('Could not read local Supabase status. Start the local project first.');
  }
}

export async function seedLocalGallery(args = process.argv.slice(2), env = process.env, dependencies = {}) {
  // This must happen before invoking the CLI, loading credentials, or making requests.
  const { target, dryRun } = validateTargets(args, env);
  const samples = loadSamples();
  const status = (dependencies.localStatus ?? readLocalStatus)();
  const api = assertLocalTarget(status.API_URL);
  if (target && target.port !== api.port) throw new Error('Requested port does not match this local Supabase project.');
  if (!status.SERVICE_ROLE_KEY) throw new Error('Local Supabase service credential is missing.');
  const fetchLocal = dependencies.fetch ?? fetch;
  const request = async (path, options = {}) => fetchLocal(`${api.origin}${path}`, {
    ...options, redirect: 'error', signal: AbortSignal.timeout(20_000),
    headers: { apikey: status.SERVICE_ROLE_KEY, Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, ...options.headers },
  });
  const checked = async (response, action) => {
    if (!response.ok) throw new Error(`${action} failed (HTTP ${response.status}).`);
    return response;
  };
  const bucketResponse = await checked(await request(`/storage/v1/bucket/${bucket}`), 'Reading media bucket');
  if ((await bucketResponse.json()).public !== false) throw new Error('Refusing seed: media bucket must be private.');

  // Inspect the entire batch before any writes; conflicts never overwrite existing work.
  const plan = [];
  for (const sample of samples) {
    const rows = await (await checked(await request(`/rest/v1/media?id=eq.${sample.row.id}&select=*`), 'Reading sample row')).json();
    const existing = rows[0];
    if (existing && Object.entries(sample.row).some(([key, value]) => existing[key] !== value)) {
      throw new Error(`Existing sample differs from manifest: ${sample.entry.filename}`);
    }
    const object = await request(`/storage/v1/object/authenticated/${bucket}/${sample.row.preview_key}`);
    let missingObject = false;
    if (object.ok) {
      const hash = createHash('sha256').update(Buffer.from(await object.arrayBuffer())).digest('hex');
      if (hash !== sample.entry.sha256) throw new Error(`Existing preview differs: ${sample.entry.filename}`);
    } else {
      const error = await object.json().catch(() => ({}));
      if (error.code !== 'NoSuchKey' && error.error !== 'not_found') throw new Error(`Reading preview failed (HTTP ${object.status}).`);
      missingObject = true;
    }
    plan.push({ ...sample, missingObject, missingRow: !existing });
  }
  const result = {
    samples: samples.length,
    objectsToCreate: plan.filter((s) => s.missingObject).length,
    rowsToCreate: plan.filter((s) => s.missingRow).length,
    dryRun,
  };
  if (!dryRun) {
    // Only previews are uploaded. The reserved original paths intentionally have no objects.
    // A failure is resumable: matching previews are retained and skipped on the next run.
    for (const sample of plan.filter((s) => s.missingObject)) {
      await checked(await request(`/storage/v1/object/${bucket}/${sample.row.preview_key}`, {
        method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }, body: sample.bytes,
      }), `Uploading ${sample.entry.filename}`);
    }
    const rows = plan.filter((s) => s.missingRow).map((s) => s.row);
    if (rows.length) {
      await checked(await request('/rest/v1/media', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(rows),
      }), 'Inserting sample rows');
    }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  seedLocalGallery().then((result) => console.log(JSON.stringify(result))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
