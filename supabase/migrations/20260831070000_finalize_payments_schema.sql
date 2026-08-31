-- ============================================================================
-- Finalises public.payments for the Lightning flow.
--
-- The table was created provisionally in 20260831040000_initial_schema.sql
-- with no frontend contract to work from. This aligns it with the agreed
-- column list and with the LNbits API shape verified against the current
-- v1.5.6 docs and source (see 20260831070000 notes below).
--
-- Safe to rename in place: verified public.payments holds 0 rows before this
-- migration, so no data is rewritten or lost.
--
-- WHAT CHANGES, and why each one:
--   * invoice            -> payment_request   (agreed name; holds the BOLT11)
--   * + provider_invoice_id                   (LNbits `checking_id`, the value
--                                              its status endpoint is keyed by)
--   * + expires_at                            (LNbits `expiry` is a lifetime in
--                                              seconds, not an absolute time)
--   * payment_status     += 'refunded'
--   * the preimage-on-paid constraint is RELAXED — see section 4, this is the
--     one behavioural change and it is forced by the API.
--
-- WHAT IS KEPT that the agreed list omitted, deliberately:
--   * payment_hash — LNbits returns it on invoice creation and keys
--     mark_webhook_sent() by it. It is how a webhook is matched to a row.
--   * preimage, paid_at — settlement evidence and timestamp.
--   * status 'failed' — dropping an enum value is destructive and the value is
--     genuinely reachable (LNbits details.status returns "failed").
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Rename to the agreed column name.
-- ----------------------------------------------------------------------------
alter table public.payments rename column invoice to payment_request;


-- ----------------------------------------------------------------------------
-- 2. New columns.
--
-- provider_invoice_id is nullable-with-unique rather than not-null: the row is
-- written by the trusted server path immediately after LNbits responds, but a
-- unique index still forbids two rows claiming the same provider invoice.
-- ----------------------------------------------------------------------------
alter table public.payments
  add column provider_invoice_id text,
  add column expires_at         timestamptz;

create unique index payments_provider_invoice_id_key
  on public.payments (provider_invoice_id)
  where provider_invoice_id is not null;

comment on column public.payments.payment_request is
  'BOLT11 invoice string, from LNbits POST /api/v1/payments -> payment_request.';
comment on column public.payments.provider_invoice_id is
  'LNbits checking_id, from POST /api/v1/payments. Key for GET /api/v1/payments/{checking_id}.';
comment on column public.payments.payment_hash is
  'LNbits payment_hash. Used to match an incoming webhook to this row.';
comment on column public.payments.expires_at is
  'Absolute expiry, computed server-side from the LNbits `expiry` lifetime in seconds.';


-- ----------------------------------------------------------------------------
-- 3. Add 'refunded'.
--
-- Postgres permits ALTER TYPE ... ADD VALUE inside a transaction only if the
-- new label is not itself referenced later in that same transaction, so
-- nothing below may name 'refunded'. The constraint in section 4 is written to
-- avoid it.
-- ----------------------------------------------------------------------------
alter type public.payment_status add value if not exists 'refunded';


-- ----------------------------------------------------------------------------
-- 4. Relax the preimage requirement on settlement.
--
-- WHY THIS IS A REAL CHANGE, not tidying: the original constraint demanded
-- preimage IS NOT NULL whenever status = 'paid'. The documented LNbits
-- settlement response (GET /api/v1/payments/{checking_id}) returns only
-- `paid` plus details.{checking_id,amount,fee,memo,status,time} — no preimage.
-- Enforcing preimage on paid would make every genuine settlement fail to
-- record. paid_at is still required, since the server always knows that.
--
-- preimage stays on the table for a funding source that does surface it.
-- ----------------------------------------------------------------------------
alter table public.payments
  drop constraint payments_preimage_only_when_paid;

alter table public.payments
  add constraint payments_paid_at_matches_status check (
    (status = 'paid'::public.payment_status and paid_at is not null)
    or (status <> 'paid'::public.payment_status and paid_at is null)
  );

-- A preimage is settlement evidence, so it may only ever appear on a paid row.
alter table public.payments
  add constraint payments_preimage_only_when_paid check (
    preimage is null or status = 'paid'::public.payment_status
  );


-- ----------------------------------------------------------------------------
-- 5. Lookup index for the webhook's pending-row match.
-- ----------------------------------------------------------------------------
create index payments_status_idx on public.payments (status);


-- ----------------------------------------------------------------------------
-- 6. Client-visible columns.
--
-- Re-granted because the renamed column carries no grant from the old name.
-- Still SELECT-only for authenticated, still no INSERT or UPDATE for any
-- browser role: both writes happen through the service_role edge functions.
--
-- preimage is withheld from clients. payment_hash and provider_invoice_id are
-- exposed so the buyer's own page can poll its own invoice.
-- ----------------------------------------------------------------------------
revoke all on table public.payments from anon, authenticated;

grant select (
  id, buyer_id, media_id, amount_sats, payment_request,
  provider_invoice_id, payment_hash, status, expires_at, paid_at, created_at
) on table public.payments to authenticated;

grant select, insert, update, delete on table public.payments to service_role;
