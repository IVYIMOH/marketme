// Integration verification: creates one temporary local buyer and deletes it in finally.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { assertLocalTarget, validateTargets, readLocalStatus, loadSamples } from './seed-local-gallery.mjs';

validateTargets([], process.env);
const status = readLocalStatus();
const api = assertLocalTarget(status.API_URL).origin;
const samples = loadSamples();
const request = (path, key = status.ANON_KEY, options = {}) => fetch(`${api}${path}`, {
  ...options, redirect: 'error', signal: AbortSignal.timeout(20_000),
  headers: { apikey: status.ANON_KEY, Authorization: `Bearer ${key}`, ...options.headers },
});
const jsonRequest = (path, key, body, method = 'POST') => request(path, key, {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const requireJson = async (response, expected, label) => {
  assert.equal(response.status, expected, label);
  return response.json();
};

let buyerId;
try {
  const publicProfiles = await requireJson(await request('/rest/v1/profiles?select=id,display_name,created_at'), 200, 'Public profile columns');
  assert.ok(Array.isArray(publicProfiles));
  const denied = await request('/rest/v1/profiles?select=role');
  assert.equal(denied.status, 401, 'Anonymous role read denied');
  assert.equal((await denied.json()).code, '42501');
  const publicRows = await requireJson(await request('/rest/v1/media?is_sample=eq.true&select=id,is_sample,photographer_credit,source_url,license_name,license_url,preview_key'), 200, 'Public samples');
  assert.equal(publicRows.length, 10);

  for (const sample of samples) {
    const row = publicRows.find((r) => r.id === sample.row.id);
    assert.ok(row?.is_sample && row.photographer_credit && row.source_url && row.license_name && row.license_url);
    const signed = await requireJson(await jsonRequest(`/storage/v1/object/sign/media/${row.preview_key}`, status.ANON_KEY, { expiresIn: 60 }), 200, 'Anonymous preview signing');
    const signedUrl = new URL(`${api}/storage/v1${signed.signedURL}`);
    assert.equal(signedUrl.origin, api);
    const preview = await fetch(signedUrl, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
    assert.equal(preview.status, 200);
    assert.equal(createHash('sha256').update(Buffer.from(await preview.arrayBuffer())).digest('hex'), sample.entry.sha256, 'Served preview checksum');
    const original = await jsonRequest(`/storage/v1/object/sign/media/${sample.row.storage_key}`, status.ANON_KEY, { expiresIn: 60 });
    assert.equal(original.ok, false, 'No sample original can be signed');
    const publicObject = await request(`/storage/v1/object/public/media/${row.preview_key}`);
    assert.equal(publicObject.ok, false, 'Bucket stays private');
  }
  console.log('PASS: profile grants, 10 attributed samples, signed preview hashes, private bucket, no originals');

  const email = `gallery-audit-${randomUUID()}@local.test`;
  const password = `Aa1!${randomBytes(30).toString('base64url')}`;
  const buyer = await requireJson(await jsonRequest('/auth/v1/admin/users', status.SERVICE_ROLE_KEY, {
    email, password, email_confirm: true, user_metadata: { display_name: 'Temporary gallery security check' },
  }), 200, 'Create temporary buyer');
  buyerId = buyer.id;
  assert.ok(buyerId);
  const session = await requireJson(await jsonRequest('/auth/v1/token?grant_type=password', status.ANON_KEY, { email, password }), 200, 'Temporary buyer session');
  const token = session.access_token;
  const roleRead = await request('/rest/v1/profiles?select=role', token);
  assert.equal(roleRead.status, 403, 'Authenticated role read denied');
  assert.equal((await roleRead.json()).code, '42501');
  for (const { row } of samples) {
    const invoice = await requireJson(await jsonRequest('/functions/v1/create-invoice', token, { mediaId: row.id, amountSats: 1000 }), 409, 'Sample invoice rejected');
    assert.equal(invoice.error, 'Sample images are not for sale');
  }
  const purchaseKey = await requireJson(await jsonRequest('/rest/v1/rpc/get_my_purchase_key', token, { target_media_id: samples[0].row.id }), 200, 'No purchased original');
  assert.equal(purchaseKey, null);
  const payments = await requireJson(await request(`/rest/v1/payments?buyer_id=eq.${buyerId}&select=id`, status.SERVICE_ROLE_KEY), 200, 'No sample payments');
  assert.deepEqual(payments, []);
  console.log('PASS: authenticated profile restriction, all 10 sample invoices rejected, no purchases or payments');
} finally {
  if (buyerId) {
    const removed = await request(`/auth/v1/admin/users/${buyerId}`, status.SERVICE_ROLE_KEY, { method: 'DELETE' });
    assert.equal(removed.ok, true, `Temporary buyer cleanup failed: ${buyerId}`);
    console.log('PASS: temporary buyer removed');
  }
}
