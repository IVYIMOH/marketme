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
// LNbits versions differ on the unit used for details.amount. The deployment
// sets LNBITS_AMOUNT_UNIT to "msat" for a provider reporting millisatoshis.

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
}): Promise<LnbitsInvoice> {
  const { base, key } = config();

  const res = await fetch(`${base}/api/v1/payments`, {
    method: 'POST', redirect: 'error',
    headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      out: false,
      amount: input.amountSats,
      memo: input.memo,
      ...(input.webhook ? { webhook: input.webhook } : {}),
      ...(input.expirySeconds ? { expiry: input.expirySeconds } : {}),
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new LnbitsError(`LNbits invoice creation failed (${res.status})`, res.status);
  }

  let body: Partial<LnbitsInvoice>;
  try {
    body = JSON.parse(text);
  } catch {
    throw new LnbitsError('Invalid Lightning invoice response');
  }

  // Do not assume the documented fields are present — a version drift here
  // would otherwise be stored as an empty invoice.
  if (!body.payment_request || !body.payment_hash || !body.checking_id) {
    throw new LnbitsError('Incomplete Lightning invoice response');
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
    redirect: 'error', headers: { 'X-Api-Key': key },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new LnbitsError(`LNbits status lookup failed (${res.status})`, res.status);
  }

  try {
    return JSON.parse(text) as LnbitsPaymentStatus;
  } catch {
    throw new LnbitsError('Invalid Lightning payment response');
  }
}

/**
 * True only if LNbits itself reports this invoice settled AND the amount it
 * reports is consistent with what we recorded. See the unit caveat above.
 */
export function isSettled(
  status: LnbitsPaymentStatus,
  expectedSats: number,
  unit = Deno.env.get('LNBITS_AMOUNT_UNIT') ?? 'sat',
): { settled: boolean; reason: string } {
  if (status.paid !== true) {
    return { settled: false, reason: 'Payment pending' };
  }
  if (status.details?.status && status.details.status !== 'success') {
    return { settled: false, reason: 'Payment has not succeeded' };
  }

  const reported = status.details?.amount;
  const expected = unit === 'sat' ? expectedSats : unit === 'msat' ? expectedSats * 1000 : NaN;
  if (!Number.isSafeInteger(expected) || expected <= 0 || reported !== expected) {
    return { settled: false, reason: 'Payment amount could not be verified' };
  }
  return { settled: true, reason: 'Payment confirmed' };
}
