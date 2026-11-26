import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const ts = require('typescript');
function loadHelper(name, globals = {}) {
  const source = readFileSync(new URL('../supabase/functions/_shared/' + name + '.ts', import.meta.url), 'utf8');
  const compiled = ts.transpile(source, {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022});
  const sandbox = { exports: {}, Response, Deno: {env: {get: () => undefined}}, ...globals };
  vm.runInNewContext(compiled, sandbox);
  return sandbox.exports;
}

test('only a verified positive payment in the configured amount unit unlocks a file', () => {
  const {isSettled} = loadHelper('lnbits');
  const paid = amount => ({paid:true, details:{amount,status:'success'}});
  assert.equal(isSettled(paid(2500),2500,'sat').settled, true);
  assert.equal(isSettled(paid(2500000),2500,'msat').settled, true);
  for (const amount of [undefined, -2500, 2.5, 2500000]) {
    assert.equal(isSettled(paid(amount),2500,'sat').settled, false);
  }
});

test('provider bodies and credentials are absent from invoice errors', async () => {
  const {createInvoice} = loadHelper('lnbits', {
    Deno: {env: {get: key => key === 'LNBITS_URL' ? 'https://provider.invalid' : 'test-only-value'}},
    fetch: async () => new Response('test-only-value', {status: 403}),
  });
  await assert.rejects(createInvoice({amountSats: 123, memo:'Purchase'}), error =>
    error.status === 403 && !error.message.includes('test-only-value'));
});

test('browser payment responses require an allowed origin and disable caching', () => {
  const {responsesFor} = loadHelper('cors');
  const foreign = responsesFor(new Request('https://example.test',{headers:{Origin:'https://other.test'}}));
  assert.equal(foreign.allowed, false);
  assert.equal(foreign.jsonResponse({}).headers.get('Access-Control-Allow-Origin'),null);
  const local = responsesFor(new Request('http://localhost',{headers:{Origin:'http://localhost:3000'}}));
  assert.equal(local.allowed,true);
  assert.equal(local.jsonResponse({}).headers.get('Cache-Control'),'no-store');
});

test('private webhook refuses anonymous calls, including a legacy secret in the URL', async () => {
  const source = readFileSync(new URL('../supabase/functions/lnbits-webhook/index.ts', import.meta.url), 'utf8');
  const compiled = ts.transpile(source, {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022});
  let handler;
  vm.runInNewContext(compiled, {
    exports: {}, require: () => ({}), Response, Deno: {
      serve: callback => { handler = callback; },
      env: {get: key => key === 'LNBITS_WEBHOOK_SECRET' ? 'local-test-only' : undefined},
    },
  });
  const response = await handler(new Request('http://localhost/webhook?s=local-test-only',{method:'POST'}));
  assert.equal(response.status,403);
});
