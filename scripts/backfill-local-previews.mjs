// Rebuild only preview paths reserved by the privacy migration, without replacing originals.
import { createRequire } from 'node:module';
import { assertLocalTarget, readLocalStatus } from './seed-local-gallery.mjs';
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');

async function backfill() {
  const cfg = readLocalStatus();
  const api = assertLocalTarget(cfg.API_URL);
  const admin = createClient(api.origin, cfg.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, init) => fetch(url, { ...init, redirect: 'error' }) },
  });
  const bucket = admin.storage.from('media');
  let cursor, created = 0, existing = 0;
  for (;;) {
    let query = admin.from('media').select('id,photographer_id,preview_key,storage_key')
      .eq('is_sample', false).like('preview_key', '%/previews/legacy-%').order('id').limit(50);
    if (cursor) query = query.gt('id', cursor);
    const { data, error } = await query;
    if (error) throw new Error('Cannot read legacy media.');
    if (!data.length) break;
    for (const row of data) {
      if (!row.storage_key.startsWith(row.photographer_id + '/') ||
          row.preview_key !== `${row.photographer_id}/previews/legacy-${row.id}.jpg`) {
        throw new Error('Unexpected ownership or preview path. Review the legacy row.');
      }
      const original = await bucket.download(row.storage_key);
      if (original.error) throw new Error('A legacy original is unavailable.');
      const preview = await sharp(Buffer.from(await original.data.arrayBuffer()))
        .rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 }).toBuffer();
      const saved = await bucket.upload(row.preview_key, preview, { contentType: 'image/jpeg', upsert: false });
      if (!saved.error) { created++; continue; }
      const prior = await bucket.download(row.preview_key);
      if (prior.error || !Buffer.from(await prior.data.arrayBuffer()).equals(preview)) {
        throw new Error('Could not save or verify a legacy preview.');
      }
      existing++;
    }
    cursor = data.at(-1).id;
  }
  return { created, existing };
}
backfill().then(counts => console.log('Local legacy previews:', counts)).catch(() => {
  console.error('Could not backfill all legacy previews. Check local storage and image formats.');
  process.exitCode = 1;
});
