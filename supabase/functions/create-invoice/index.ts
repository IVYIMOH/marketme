// create-invoice
//
// Trusted server path for starting a purchase. The browser sends only a
// mediaId; everything that decides how much money is involved is resolved
// here, server-side.
//
// LNBITS_API_KEY is read from the function environment and never leaves this
// process — it is not returned to the client and not logged.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { responsesFor } from '../_shared/cors.ts';
import { createInvoice } from '../_shared/lnbits.ts';

const INVOICE_EXPIRY_SECONDS = 3600;

Deno.serve(async (req) => {
  const { allowed, corsHeaders, jsonResponse } = responsesFor(req);
  if (!allowed) return jsonResponse({ error: 'Origin not allowed' }, 403);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceKey || !anonKey) {
    console.error('missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY');
    return jsonResponse({ error: 'Server misconfigured' }, 500);
  }

  // ---- 1. Verify the caller's JWT inside the function ---------------------
  // The platform already gates this route on verify_jwt, but the buyer id must
  // come from a verified token rather than from anything the client sent.
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return jsonResponse({ error: 'Missing Authorization bearer token' }, 401);

  const authClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await authClient.auth.getUser(jwt);
  if (userError || !userData?.user) {
    return jsonResponse({ error: 'Invalid or expired session' }, 401);
  }
  const buyerId = userData.user.id;

  // ---- 2. Read the request ------------------------------------------------
  let mediaId: unknown;
  try {
    const body = await req.json();
    mediaId = body?.mediaId;
  } catch {
    return jsonResponse({ error: 'Body must be JSON' }, 400);
  }
  if (typeof mediaId !== 'string' || !/^[0-9a-f-]{36}$/i.test(mediaId)) {
    return jsonResponse({ error: 'mediaId must be a uuid' }, 400);
  }

  // service_role for the trusted reads and the insert. Correct here: this is
  // the server path, and payments has no client INSERT grant by design.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- 3. Resolve the price SERVER-SIDE ----------------------------------
  // Never trust a client-supplied amount. Only approved media is purchasable.
  const { data: media, error: mediaError } = await admin
    .from('media')
    .select('id, price_sats, status, is_sample')
    .eq('id', mediaId)
    .maybeSingle();

  if (mediaError) {
    console.error('Invoice media lookup failed');
    return jsonResponse({ error: 'Could not load that item' }, 500);
  }
  if (!media) return jsonResponse({ error: 'No such item' }, 404);
  if (media.is_sample) {
    return jsonResponse({ error: 'Sample images are not for sale' }, 409);
  }
  if (media.status !== 'approved') {
    return jsonResponse({ error: 'That item is not for sale' }, 409);
  }
  if (typeof media.price_sats !== 'number' || media.price_sats <= 0) {
    return jsonResponse({ error: 'That item has no valid price' }, 409);
  }
  const amountSats = media.price_sats;

  // ---- 4. Already bought? Don't charge twice. ----------------------------
  const { data: paidRow } = await admin
    .from('payments')
    .select('id')
    .eq('buyer_id', buyerId)
    .eq('media_id', mediaId)
    .eq('status', 'paid')
    .maybeSingle();
  if (paidRow) {
    return jsonResponse({ alreadyPaid: true, paymentId: paidRow.id });
  }

  // Reuse a live pending invoice rather than minting a new one on every click.
  const nowIso = new Date().toISOString();
  const { data: reusable } = await admin
    .from('payments')
    .select('id, payment_request, provider_invoice_id, expires_at, amount_sats')
    .eq('buyer_id', buyerId)
    .eq('media_id', mediaId)
    .eq('status', 'pending')
    .eq('amount_sats', amountSats)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (reusable?.payment_request && reusable.provider_invoice_id) {
    return jsonResponse({
      paymentRequest: reusable.payment_request,
      invoiceId: reusable.provider_invoice_id,
      paymentId: reusable.id,
      amountSats: reusable.amount_sats,
      expiresAt: reusable.expires_at,
      reused: true,
    });
  }

  // ---- 5. Create the invoice at LNbits ----------------------------------
  // LNbits supports a callback URL, but cannot attach authorization headers.
  // A trusted relay can attach the webhook secret. Buyer polling also settles invoices.
  const webhookUrl = Deno.env.get('LNBITS_WEBHOOK_URL');

  let invoice;
  try {
    invoice = await createInvoice({
      amountSats,
      memo: 'NatuVara photo purchase',
      webhook: webhookUrl,
      expirySeconds: INVOICE_EXPIRY_SECONDS,
    });
  } catch {
    console.error('Lightning invoice creation failed');
    return jsonResponse({ error: 'Could not reach the Lightning provider' }, 502);
  }

  // ---- 6. Record it -----------------------------------------------------
  const expiresAt = new Date(Date.now() + INVOICE_EXPIRY_SECONDS * 1000).toISOString();
  const { data: inserted, error: insertError } = await admin
    .from('payments')
    .insert({
      buyer_id: buyerId,
      media_id: mediaId,
      amount_sats: amountSats,
      payment_request: invoice.payment_request,
      payment_hash: invoice.payment_hash,
      provider_invoice_id: invoice.checking_id,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (insertError) {
    // The invoice exists at LNbits but we failed to record it. Say so loudly:
    // an unrecorded invoice cannot be settled by the webhook.
    console.error('Payment recording failed after invoice creation');
    return jsonResponse({ error: 'Invoice created but could not be recorded' }, 500);
  }

  return jsonResponse({
    paymentRequest: invoice.payment_request,
    invoiceId: invoice.checking_id,
    paymentId: inserted.id,
    amountSats,
    expiresAt,
  });
});
