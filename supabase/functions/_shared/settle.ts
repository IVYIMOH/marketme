// Settlement, shared by lnbits-webhook and check-payment.
//
// Both paths MUST apply identical rules, so the decision lives here rather
// than being written twice. Money code should have exactly one place where a
// row becomes 'paid'.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { getPaymentStatus, isSettled, LnbitsError } from './lnbits.ts';

export interface PaymentRow {
  id: string;
  buyer_id: string;
  media_id: string;
  amount_sats: number;
  status: string;
  provider_invoice_id: string | null;
  payment_hash: string;
  expires_at: string | null;
}

export type SettleOutcome =
  | { kind: 'settled'; paymentId: string; reason: string }
  | { kind: 'already_paid'; paymentId: string }
  | { kind: 'not_settled'; paymentId: string; reason: string }
  | { kind: 'expired'; paymentId: string }
  | { kind: 'unverifiable'; paymentId: string; reason: string }
  | { kind: 'wrong_status'; paymentId: string; status: string };

/**
 * Asks LNbits whether this invoice is genuinely settled and, only if so,
 * flips the row to paid.
 *
 * The row must already have been loaded and confirmed to belong to whoever is
 * entitled to it — this function does not do authorisation.
 */
export async function reconcilePayment(
  admin: SupabaseClient,
  row: PaymentRow,
): Promise<SettleOutcome> {
  if (row.status === 'paid') return { kind: 'already_paid', paymentId: row.id };
  if (row.status !== 'pending') {
    return { kind: 'wrong_status', paymentId: row.id, status: row.status };
  }
  if (!row.provider_invoice_id) {
    return {
      kind: 'unverifiable',
      paymentId: row.id,
      reason: 'row has no provider_invoice_id',
    };
  }

  let status;
  try {
    status = await getPaymentStatus(row.provider_invoice_id);
  } catch (e) {
    return {
      kind: 'unverifiable',
      paymentId: row.id,
      reason: e instanceof LnbitsError ? e.message : String(e),
    };
  }

  const verdict = isSettled(status, row.amount_sats);

  if (verdict.settled) {
    // Guarded on status='pending' so two concurrent callers cannot both settle.
    const { data: updated, error } = await admin
      .from('payments')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();

    if (error) {
      return { kind: 'unverifiable', paymentId: row.id, reason: error.message };
    }
    // No row back means another caller won the race — still a success.
    if (!updated) return { kind: 'already_paid', paymentId: row.id };
    return { kind: 'settled', paymentId: row.id, reason: verdict.reason };
  }

  // Not settled. If the invoice has also passed its expiry, retire the row so
  // the buyer is offered a fresh invoice instead of staring at a dead one.
  // Deliberately only ever pending -> expired, never touching a paid row.
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    await admin
      .from('payments')
      .update({ status: 'expired' })
      .eq('id', row.id)
      .eq('status', 'pending');
    return { kind: 'expired', paymentId: row.id };
  }

  return { kind: 'not_settled', paymentId: row.id, reason: verdict.reason };
}
