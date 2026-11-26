import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const ts = require('typescript');
const source = ts.transpileModule(readFileSync(new URL('../supabase/functions/create-invoice/index.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function attemptInvoice(isSample, price) {
  let handler;
  let providerCalls = 0;
  const admin = { from: (table) => {
    let columns = [];
    const query = {
      select: (value) => { columns = value.split(',').map(c => c.trim()); return query; },
      eq: () => query, gt: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => {
        const media = { id: 'f4c350af-75ec-4e8d-98da-34edb2ec544f', title: 'Sample', status: 'approved', is_sample: isSample, price_sats: price };
        return { data: table === 'media' ? Object.fromEntries(columns.map(c => [c, media[c]])) : null, error: null };
      },
    };
    return query;
  } };
  vm.runInNewContext(source, {
    exports: {}, Request, Response, console: { error: () => {} },
    Deno: { env: { get: () => 'local-mock' }, serve: fn => { handler = fn; } },
    require: name => {
      if (name.startsWith('npm:')) return {
        createClient: (_url, _key, options) => options ? admin : { auth: { getUser: async () => ({ data: { user: { id: 'test-buyer' } } }) } },
      };
      if (name.endsWith('/cors.ts')) return { responsesFor: () => ({ allowed: true, corsHeaders: {}, jsonResponse: (body, status = 200) => Response.json(body, { status }) }) };
      if (name.endsWith('/lnbits.ts')) return { LnbitsError: Error, createInvoice: async () => { providerCalls++; throw new Error('Mock provider'); } };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const response = await handler(new Request('http://localhost/create-invoice', {
    method: 'POST', headers: { Authorization: 'Bearer mock', 'Content-Type': 'application/json' },
    body: JSON.stringify({ mediaId: 'f4c350af-75ec-4e8d-98da-34edb2ec544f', amountSats: 999 }),
  }));
  return { status: response.status, body: await response.json(), providerCalls };
}

test('sample rejection precedes price checks and provider access', async () => {
  for (const price of [0, 1000]) {
    assert.deepEqual(await attemptInvoice(true, price), {
      status: 409, body: { error: 'Sample images are not for sale' }, providerCalls: 0,
    });
  }
});

test('ordinary approved paid media still reaches the provider', async () => {
  const result = await attemptInvoice(false, 1000);
  assert.equal(result.providerCalls, 1);
  assert.equal(result.status, 502); // The mock provider deliberately fails; no real request occurs.
});
