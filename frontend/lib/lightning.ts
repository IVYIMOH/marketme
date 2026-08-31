import { supabase } from './supabaseClient';

/**
 * Lightning payment client.
 *
 * Deliberately contains NO LNbits reference of any kind. Invoice creation
 * needs LNBITS_API_KEY, which must never reach the browser, so the only thing
 * this file does is invoke the create-invoice edge function. The amount is not
 * sent — the function resolves price_sats server-side from mediaId.
 */

export interface Invoice {
  paymentRequest: string;
  invoiceId: string;
  paymentId: string;
  amountSats: number;
  expiresAt: string;
  reused?: boolean;
}

export interface AlreadyPaid {
  alreadyPaid: true;
  paymentId: string;
}

export type PaymentRow = {
  id: string;
  media_id: string;
  amount_sats: number;
  payment_request: string;
  provider_invoice_id: string | null;
  payment_hash: string;
  status: 'pending' | 'paid' | 'expired' | 'failed' | 'refunded';
  expires_at: string | null;
  paid_at: string | null;
  created_at: string;
};

export class PaymentError extends Error {}

export async function createInvoice(mediaId: string): Promise<Invoice | AlreadyPaid> {
  const { data, error } = await supabase.functions.invoke('create-invoice', {
    body: { mediaId },
  });

  if (error) {
    // FunctionsHttpError carries the response; surface the server's own
    // message rather than a generic "failed to send request".
    let detail = error.message;
    const res = (error as { context?: Response }).context;
    if (res && typeof res.json === 'function') {
      try {
        const body = await res.json();
        if (body?.error) detail = body.error;
      } catch {
        /* keep the original message */
      }
    }
    throw new PaymentError(detail);
  }

  if (data?.alreadyPaid) return data as AlreadyPaid;
  if (!data?.paymentRequest) throw new PaymentError('No invoice was returned');
  return data as Invoice;
}

/**
 * The buyer's own payment row for one item, newest first.
 *
 * Read directly through RLS: payments_select_own restricts a buyer to
 * buyer_id = auth.uid(), so no endpoint is needed and no other buyer's row is
 * reachable. Settlement is written only server-side, so a 'paid' row here is
 * server-verified evidence, not something the client can fake.
 */
export async function getMyPaymentForMedia(mediaId: string): Promise<PaymentRow | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await supabase
    .from('payments')
    .select(
      'id, media_id, amount_sats, payment_request, provider_invoice_id, payment_hash, status, expires_at, paid_at, created_at'
    )
    .eq('media_id', mediaId)
    .eq('buyer_id', userData.user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new PaymentError(error.message);
  return (data as PaymentRow) ?? null;
}

/** True once a server-verified paid row exists for this buyer + item. */
export async function hasPaidFor(mediaId: string): Promise<boolean> {
  const row = await getMyPaymentForMedia(mediaId);
  return row?.status === 'paid';
}

export type CheckResult = {
  status: 'paid' | 'pending' | 'expired' | 'failed' | 'refunded' | 'unknown';
  paymentId?: string;
  justSettled?: boolean;
  reason?: string;
};

/**
 * Authoritative status check. Asks the server to re-verify this buyer's invoice
 * directly against the Lightning provider, settling the row if it has been paid.
 *
 * This — not the webhook — is what guarantees a real payment is recognised.
 * LNbits' webhook delivery looks to be single-attempt, and a callback can also
 * be lost to a cold start or a network blip, so polling only the payments row
 * could leave a buyer who genuinely paid stuck on 'pending' forever.
 *
 * Calling this cannot manufacture a payment: the server derives the buyer from
 * the JWT, looks up only their own row, and flips it to paid solely on the
 * provider's own report for the matching amount.
 */
export async function checkPayment(args: { mediaId?: string; paymentId?: string }): Promise<CheckResult> {
  const { data, error } = await supabase.functions.invoke('check-payment', { body: args });

  if (error) {
    let detail = error.message;
    const res = (error as { context?: Response }).context;
    if (res && typeof res.json === 'function') {
      try {
        const body = await res.json();
        // A 502 here means "we could not verify", which is NOT "not paid".
        if (body?.status === 'unknown') return { status: 'unknown', reason: body?.error };
        if (body?.error) detail = body.error;
      } catch {
        /* keep the original message */
      }
    }
    throw new PaymentError(detail);
  }

  return data as CheckResult;
}

/**
 * Signed download URL for purchased work.
 *
 * Uses storage_key (the original), not preview_key. The buyer cannot read
 * storage_key from the media table — it has no column grant — so it is fetched
 * through get_my_purchase_key(), which checks for a paid payments row
 * server-side before returning anything.
 */
export async function getDownloadUrl(mediaId: string, expiresIn = 300): Promise<string | null> {
  const { data: key, error } = await supabase.rpc('get_my_purchase_key', { target_media_id: mediaId });
  if (error) throw new PaymentError(error.message);
  if (!key) return null;

  const { data, error: signError } = await supabase.storage
    .from('media')
    .createSignedUrl(key as string, expiresIn, { download: true });
  if (signError) return null;
  return data.signedUrl;
}
