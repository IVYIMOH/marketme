// LNbits API client.
//
// Every shape below was verified against the current LNbits documentation
// (v1.5.6) rather than written from memory:
//
//   Create invoice  POST /api/v1/payments
//     header  X-Api-Key: <key>
//     body    { out: false, amount: <sats>, memo?, webhook?, expiry?, extra? }
//     201 ->  { payment_hash, payment_request, checking_id }
//     https://docs.lnbits.com/api/core/payments
//
//   Check settlement  GET /api/v1/payments/{checking_id}
//     200 ->  { paid: boolean,
//               details: { checking_id, amount, fee, memo, status, time } }
//     details.status is one of "pending" | "success" | "failed"
//     https://docs.lnbits.com/api/core/payments
//
//   Auth: the invoice (read) key is sufficient to CREATE invoices and to read
//   payment status. The admin key is only needed to SEND payments, which this
//   project never does — so LNBITS_API_KEY should be the invoice key.
//   https://docs.lnbits.com/api/authentication
//
// UNIT CAVEAT, unresolved and deliberately surfaced: the docs state
// details.amount is in satoshis while details.fee is in millisatoshis. Real
// LNbits deployments have historically reported payment amounts in msat. The
// settlement check below therefore accepts a match on EITHER interpretation
// and refuses anything matching neither, so a genuinely wrong amount is still
// rejected without a unit assumption silently failing real payments.

export interface LnbitsInvoice {
  payment_hash: string;
  payment_request: string;
  checking_id: string;
}

export interface LnbitsPaymentStatus {
  paid: boolean;
  details?: {
    checking_id?: string;
    amount?: number;
    fee?: number;
    memo?: string;
    status?: 'pending' | 'success' | 'failed';
    time?: number;
  };
}

export class LnbitsError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

function config(): { base: string; key: string } {
  const base = Deno.env.get('LNBITS_URL');
  const key = Deno.env.get('LNBITS_API_KEY');
  if (!base || !key) {
    // Fail loudly rather than firing a keyless request at LNbits.
    throw new LnbitsError(
      'LNBITS_URL and LNBITS_API_KEY must both be set. Run: supabase secrets set LNBITS_API_KEY=… LNBITS_URL=…',
    );
  }
  return { base: base.replace(/\/+$/, ''), key };
}

export async function createInvoice(input: {
  amountSats: number;
  memo: string;
  webhook?: string;
  expirySeconds?: number;
  extra?: Record<string, unknown>;
}): Promise<LnbitsInvoice> {
  const { base, key } = config();

  const res = await fetch(`${base}/api/v1/payments`, {
    method: 'POST',
    headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      out: false,
      amount: input.amountSats,
      memo: input.memo,
      ...(input.webhook ? { webhook: input.webhook } : {}),
      ...(input.expirySeconds ? { expiry: input.expirySeconds } : {}),
      ...(input.extra ? { extra: input.extra } : {}),
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new LnbitsError(`LNbits invoice creation failed (${res.status}): ${text}`, res.status);
  }

  let body: Partial<LnbitsInvoice>;
  try {
    body = JSON.parse(text);
  } catch {
    throw new LnbitsError(`LNbits returned non-JSON on invoice creation: ${text.slice(0, 300)}`);
  }

  // Do not assume the documented fields are present — a version drift here
  // would otherwise be stored as an empty invoice.
  if (!body.payment_request || !body.payment_hash || !body.checking_id) {
    throw new LnbitsError(
      `LNbits response missing expected fields (payment_request/payment_hash/checking_id). Got: ${
        Object.keys(body).join(', ') || '<empty>'
      }`,
    );
  }

  return {
    payment_hash: body.payment_hash,
    payment_request: body.payment_request,
    checking_id: body.checking_id,
  };
}

export async function getPaymentStatus(checkingId: string): Promise<LnbitsPaymentStatus> {
  const { base, key } = config();

  const res = await fetch(`${base}/api/v1/payments/${encodeURIComponent(checkingId)}`, {
    headers: { 'X-Api-Key': key },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new LnbitsError(`LNbits status lookup failed (${res.status}): ${text}`, res.status);
  }

  try {
    return JSON.parse(text) as LnbitsPaymentStatus;
  } catch {
    throw new LnbitsError(`LNbits returned non-JSON on status lookup: ${text.slice(0, 300)}`);
  }
}

/**
 * True only if LNbits itself reports this invoice settled AND the amount it
 * reports is consistent with what we recorded. See the unit caveat above.
 */
export function isSettled(
  status: LnbitsPaymentStatus,
  expectedSats: number,
): { settled: boolean; reason: string } {
  if (status.paid !== true) {
    return { settled: false, reason: `LNbits reports paid=${status.paid}` };
  }
  if (status.details?.status && status.details.status !== 'success') {
    return { settled: false, reason: `details.status=${status.details.status}` };
  }

  const reported = status.details?.amount;
  if (typeof reported !== 'number') {
    // paid=true with no amount to cross-check: trust paid, but say so.
    return { settled: true, reason: 'paid=true (no details.amount to cross-check)' };
  }

  const asSats = Math.abs(reported) === expectedSats;
  const asMsats = Math.abs(reported) === expectedSats * 1000;
  if (!asSats && !asMsats) {
    return {
      settled: false,
      reason: `amount mismatch: LNbits reported ${reported}, expected ${expectedSats} sat (or ${
        expectedSats * 1000
      } msat)`,
    };
  }

  return { settled: true, reason: `paid=true, amount matched as ${asSats ? 'sat' : 'msat'}` };
}
