// check-payment
//
// Authoritative reconciliation. The buyer's page calls this while waiting, and
// it asks LNbits directly whether their invoice settled.
//
// WHY THIS EXISTS: lnbits-webhook cannot be the only settlement channel. Its
// delivery appears to be single-attempt (see the note in that function), and a
// callback can also be lost to a cold start, a network blip, or our own 500.
// Without this path a buyer could pay and never gain access. With it, the
// webhook is only an accelerator — this is the channel that guarantees a real
// payment is eventually recognised.
//
// Safe to expose to buyers: a caller can only ever ask about their OWN row,
// and the row can only flip to paid if LNbits itself reports it settled for
// the matching amount. Polling it cannot manufacture a payment.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { reconcilePayment, type PaymentRow } from '../_shared/settle.ts';

const SELECT =
  'id, buyer_id, media_id, amount_sats, status, provider_invoice_id, payment_hash, expires_at, paid_at';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceKey || !anonKey) {
    console.error('missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY');
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  // ---- Verify the caller, and derive the buyer from the token -------------
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return jsonResponse({ error: 'Missing Authorization bearer token' }, 401);

  const authClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await authClient.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'Invalid or expired session' }, 401);
  }
  const buyerId = userData.user.id;

  let paymentId: unknown;
  let mediaId: unknown;
  try {
    const body = await req.json();
    paymentId = body?.paymentId;
    mediaId = body?.mediaId;
  } catch {
    return jsonResponse({ error: 'Body must be JSON' }, 400);
  }

  const isUuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
  if (!isUuid(paymentId) && !isUuid(mediaId)) {
    return jsonResponse({ error: 'Provide paymentId or mediaId as a uuid' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Load the caller's OWN row. buyer_id comes from the verified token, --
  // ---- so one buyer can never reconcile another's payment. ----------------
  let query = admin.from('payments').select(SELECT).eq('buyer_id', buyerId);
  query = isUuid(paymentId)
    ? query.eq('id', paymentId as string)
    : query.eq('media_id', mediaId as string);

  const { data: row, error: rowError } = await query
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rowError) {
    console.error('payments lookup failed:', rowError.message);
    return jsonResponse({ error: 'Lookup failed' }, 500);
  }
  if (!row) return jsonResponse({ error: 'No payment found for you on that item' }, 404);

  const outcome = await reconcilePayment(admin, row as PaymentRow);

  switch (outcome.kind) {
    case 'settled':
      console.log(`check-payment settled ${outcome.paymentId} (${outcome.reason})`);
      return jsonResponse({ status: 'paid', paymentId: outcome.paymentId, justSettled: true });
    case 'already_paid':
      return jsonResponse({ status: 'paid', paymentId: outcome.paymentId });
    case 'expired':
      return jsonResponse({ status: 'expired', paymentId: outcome.paymentId });
    case 'not_settled':
      return jsonResponse({
        status: 'pending',
        paymentId: outcome.paymentId,
        reason: outcome.reason,
      });
    case 'wrong_status':
      return jsonResponse({ status: outcome.status, paymentId: outcome.paymentId });
    case 'unverifiable':
      // Do not present this as "not paid" — we genuinely do not know.
      console.error(`check-payment could not verify ${outcome.paymentId}: ${outcome.reason}`);
      return jsonResponse(
        { status: 'unknown', paymentId: outcome.paymentId, error: 'Could not verify with provider' },
        502,
      );
  }
});
