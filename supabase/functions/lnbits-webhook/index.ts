// lnbits-webhook
//
// Settlement callback. This route is PUBLIC (verify_jwt = false in
// config.toml) because LNbits has no Supabase JWT, so it treats the request
// body as entirely untrusted.
//
// Three facts drive the design, each verified rather than assumed:
//
//  1. LNbits' webhook payload is NOT documented. The payments docs describe
//     the optional `webhook` request field and say nothing about the callback
//     body. The shape was traced to the implementation instead:
//
//       lnbits/core/services/notifications.py -> dispatch_webhook()
//         r = await client.post(payment.webhook, json=payment.json(), timeout=40)
//
//     `payment.json()` returns a STRING, and httpx's `json=` re-encodes it.
//     The body on the wire is therefore a JSON-encoded string, not an object:
//     `await req.json()` yields a string needing a second parse. parsePayload()
//     handles both, so a future fix upstream will not break this handler.
//
//  2. Because those field names are undocumented and may drift between
//     versions, the payload is used ONLY as a hint about WHICH invoice to look
//     at. Whether it settled is decided by LNbits' documented status endpoint
//     read through our own stored checking_id. Nothing is marked paid on the
//     strength of the payload.
//
//  3. Delivery appears to be single-attempt: dispatch is guarded by
//     `if payment.webhook and not payment.webhook_status:` and
//     mark_webhook_sent() also runs on the failure paths, so one failed
//     delivery blocks re-dispatch. This function is therefore an ACCELERATOR
//     only — check-payment is the authoritative path that guarantees a real
//     payment is eventually recognised.
//
// The actual settlement decision lives in _shared/settle.ts, shared with
// check-payment so both channels apply identical rules.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { reconcilePayment, type PaymentRow } from '../_shared/settle.ts';

const SELECT =
  'id, buyer_id, media_id, amount_sats, status, provider_invoice_id, payment_hash, expires_at';

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

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
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Defence in depth: if a webhook secret is configured, require it. Not the
  // security boundary — the LNbits re-check is — but it keeps casual
  // unauthenticated traffic out of this public route.
  const expectedSecret = Deno.env.get('LNBITS_WEBHOOK_SECRET');
  if (expectedSecret) {
    if (new URL(req.url).searchParams.get('s') !== expectedSecret) {
      console.warn('webhook rejected: bad or missing shared secret');
      return json({ error: 'Forbidden' }, 403);
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    console.error('missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    return json({ error: 'Server misconfigured' }, 500);
  }

  const raw = await req.text();
  const payload = parsePayload(raw);
  if (!payload) {
    console.warn('webhook body was not parseable JSON:', raw.slice(0, 300));
    return json({ error: 'Unparseable body' }, 400);
  }

  // Hint only. Both names are real fields on the LNbits Payment model and are
  // the two identifiers we store, so either can locate our row.
  const hashHint = firstString(payload, ['payment_hash', 'paymentHash']);
  const checkingHint = firstString(payload, ['checking_id', 'checkingId']);
  if (!hashHint && !checkingHint) {
    console.warn(
      'webhook payload carried no payment_hash or checking_id; keys:',
      Object.keys(payload).join(', '),
    );
    return json({ error: 'No invoice identifier in payload' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Match a REAL row before trusting anything --------------------------
  let query = admin.from('payments').select(SELECT);
  query = hashHint
    ? query.eq('payment_hash', hashHint)
    : query.eq('provider_invoice_id', checkingHint as string);

  const { data: row, error: rowError } = await query.maybeSingle();

  if (rowError) {
    console.error('payments lookup failed:', rowError.message);
    return json({ error: 'Lookup failed' }, 500);
  }
  if (!row) {
    // An identifier we never issued. Refuse rather than create anything.
    console.warn('webhook for unknown invoice; hash:', hashHint, 'checking_id:', checkingHint);
    return json({ error: 'Unknown invoice' }, 404);
  }

  // ---- Hand to the shared decision. LNbits is the authority. --------------
  const outcome = await reconcilePayment(admin, row as PaymentRow);

  switch (outcome.kind) {
    case 'settled':
      console.log(`webhook settled ${outcome.paymentId} (${outcome.reason})`);
      return json({ ok: true, settled: true, paymentId: outcome.paymentId }, 200);
    case 'already_paid':
      return json({ ok: true, alreadyPaid: true }, 200);
    case 'expired':
      return json({ ok: true, settled: false, reason: 'invoice expired' }, 200);
    case 'not_settled':
      console.warn(`refusing to settle ${outcome.paymentId}: ${outcome.reason}`);
      return json({ ok: true, settled: false, reason: outcome.reason }, 200);
    case 'wrong_status':
      console.warn(`webhook for ${outcome.paymentId} in status ${outcome.status}; refusing`);
      return json({ error: `Row is ${outcome.status}` }, 409);
    case 'unverifiable':
      console.error(`webhook could not verify ${outcome.paymentId}: ${outcome.reason}`);
      // check-payment will pick this up when the buyer's page next polls.
      return json({ error: 'Could not verify with provider' }, 500);
  }
});
