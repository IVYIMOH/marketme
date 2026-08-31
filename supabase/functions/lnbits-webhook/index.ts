// lnbits-webhook
//
// Settlement callback. This route is PUBLIC (verify_jwt = false in
// config.toml) because LNbits has no Supabase JWT, so it treats the request
// body as entirely untrusted.
//
// Two facts drive the design, both verified rather than assumed:
//
//  1. LNbits' webhook payload is NOT documented. The docs page for payments
//     describes the optional `webhook` request field and nothing about the
//     callback body. The shape was traced to the implementation instead:
//
//       lnbits/core/services/notifications.py -> dispatch_webhook()
//         r = await client.post(payment.webhook, json=payment.json(), timeout=40)
//
//     `payment.json()` returns a STRING, and httpx's `json=` re-encodes it.
//     The body on the wire is therefore a JSON-encoded string, not an object:
//     `await req.json()` yields a string that must be parsed a second time.
//     parsePayload() below handles both that and a plain object, so a future
//     LNbits fix to dispatch_webhook does not break this handler.
//
//  2. Because the field names are undocumented and could drift between
//     versions, the payload is used ONLY as a hint about WHICH invoice to
//     look at. Whether it is actually settled is decided by LNbits'
//     documented status endpoint, GET /api/v1/payments/{checking_id}, read
//     through our own stored checking_id. Nothing is marked paid on the
//     strength of the payload.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { getPaymentStatus, isSettled, LnbitsError } from '../_shared/lnbits.ts';

/** Unwraps LNbits' double-encoded body; tolerates a plain object too. */
function parsePayload(raw: string): Record<string, unknown> | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function firstString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  // Defence in depth: if a webhook secret is configured, require it. This is
  // not the security boundary — the LNbits re-check below is — but it keeps
  // casual unauthenticated traffic out.
  const expectedSecret = Deno.env.get('LNBITS_WEBHOOK_SECRET');
  if (expectedSecret) {
    const provided = new URL(req.url).searchParams.get('s');
    if (provided !== expectedSecret) {
      console.warn('webhook rejected: bad or missing shared secret');
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 500 });
  }

  const raw = await req.text();
  const payload = parsePayload(raw);
  if (!payload) {
    console.warn('webhook body was not parseable JSON:', raw.slice(0, 300));
    return new Response(JSON.stringify({ error: 'Unparseable body' }), { status: 400 });
  }

  // Hint only. Both names are real fields on the LNbits Payment model and are
  // the two identifiers we store, so either can locate our row.
  const hashHint = firstString(payload, ['payment_hash', 'paymentHash']);
  const checkingHint = firstString(payload, ['checking_id', 'checkingId']);
  if (!hashHint && !checkingHint) {
    console.warn('webhook payload carried no payment_hash or checking_id; keys:',
      Object.keys(payload).join(', '));
    return new Response(JSON.stringify({ error: 'No invoice identifier in payload' }), { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Match a REAL pending row before trusting anything ------------------
  let query = admin
    .from('payments')
    .select('id, buyer_id, media_id, amount_sats, status, provider_invoice_id, payment_hash');
  query = hashHint
    ? query.eq('payment_hash', hashHint)
    : query.eq('provider_invoice_id', checkingHint as string);

  const { data: row, error: rowError } = await query.maybeSingle();

  if (rowError) {
    console.error('payments lookup failed:', rowError.message);
    return new Response(JSON.stringify({ error: 'Lookup failed' }), { status: 500 });
  }
  if (!row) {
    // An identifier we never issued. Refuse rather than create anything.
    console.warn('webhook for unknown invoice; hash:', hashHint, 'checking_id:', checkingHint);
    return new Response(JSON.stringify({ error: 'Unknown invoice' }), { status: 404 });
  }
  if (row.status === 'paid') {
    // LNbits retries on non-2xx, so acknowledge idempotently.
    return new Response(JSON.stringify({ ok: true, alreadyPaid: true }), { status: 200 });
  }
  if (row.status !== 'pending') {
    console.warn(`webhook for row ${row.id} in status ${row.status}; refusing to settle`);
    return new Response(JSON.stringify({ error: `Row is ${row.status}` }), { status: 409 });
  }
  if (!row.provider_invoice_id) {
    console.error(`row ${row.id} has no provider_invoice_id; cannot verify settlement`);
    return new Response(JSON.stringify({ error: 'Row not verifiable' }), { status: 500 });
  }

  // ---- Ask LNbits directly. This is the authority. -----------------------
  let status;
  try {
    status = await getPaymentStatus(row.provider_invoice_id);
  } catch (e) {
    const msg = e instanceof LnbitsError ? e.message : String(e);
    console.error('LNbits status lookup failed:', msg);
    // 500 so LNbits retries — a transient provider error must not silently
    // drop a real settlement.
    return new Response(JSON.stringify({ error: 'Could not verify with provider' }), { status: 500 });
  }

  const verdict = isSettled(status, row.amount_sats);
  if (!verdict.settled) {
    console.warn(`refusing to settle row ${row.id}: ${verdict.reason}`);
    return new Response(
      JSON.stringify({ ok: true, settled: false, reason: verdict.reason }),
      { status: 200 },
    );
  }

  // ---- Only now write ----------------------------------------------------
  // Guarded on status='pending' so two concurrent webhooks cannot both settle.
  const { data: updated, error: updateError } = await admin
    .from('payments')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'pending')
    .select('id, status, paid_at')
    .maybeSingle();

  if (updateError) {
    console.error('settlement update failed:', updateError.message);
    return new Response(JSON.stringify({ error: 'Update failed' }), { status: 500 });
  }
  if (!updated) {
    // Another concurrent webhook won the race; that is a success, not a fault.
    return new Response(JSON.stringify({ ok: true, alreadyPaid: true }), { status: 200 });
  }

  console.log(`settled payment ${updated.id} (${verdict.reason})`);
  return new Response(
    JSON.stringify({ ok: true, settled: true, paymentId: updated.id }),
    { status: 200 },
  );
});
