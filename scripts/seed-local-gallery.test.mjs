import assert from 'node:assert/strict';
import test from 'node:test';
import { seedLocalGallery, loadSamples } from './seed-local-gallery.mjs';

test('remote targets fail before credentials or network access', async () => {
  let accesses = 0;
  const dependencies = {
    localStatus: () => { accesses++; throw new Error('Unexpected credential access'); },
    fetch: () => { accesses++; throw new Error('Unexpected network access'); },
  };
  for (const url of [
    'https://example.supabase.co', 'http://localhost.evil.test:54321',
    'http://127.0.0.1@evil.test', 'http://user:secret@localhost:54321',
    'http://192.168.1.1:54321', 'http://localhost:54321/path',
    'http://localhost:54321/?target=remote', 'https://localhost:54321',
  ]) {
    await assert.rejects(seedLocalGallery(['--url', url], {}, dependencies), /Refusing seed/);
    for (const key of ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'VITE_SUPABASE_URL']) {
      await assert.rejects(seedLocalGallery([], { [key]: url }, dependencies), /Refusing seed/);
    }
  }
  assert.equal(accesses, 0);
});

test('a remote CLI status cannot receive credentials', async () => {
  await assert.rejects(seedLocalGallery([], {}, {
    localStatus: () => ({ API_URL: 'https://example.supabase.co', SERVICE_ROLE_KEY: 'not-a-real-key' }),
    fetch: () => assert.fail('Must not send a request'),
  }), /Refusing seed/);
});

test('prepared previews retain their verified hashes, separate originals and attribution', () => {
  const samples = loadSamples();
  assert.equal(samples.length, 10);
  assert.equal(new Set(samples.map((s) => s.row.id)).size, 10);
  for (const { row } of samples) {
    assert.equal(row.is_sample, true);
    assert.equal(row.price_sats, 0);
    assert.equal(row.photographer_id, null);
    assert.notEqual(row.preview_key, row.storage_key);
    assert.ok(row.photographer_credit && row.source_url && row.license_url);
  }
});
