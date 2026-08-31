-- ============================================================================
-- Fixes a constraint bug introduced by 20260831070000_finalize_payments_schema.
--
-- THE BUG: that migration added
--
--   check ( (status = 'paid'  and paid_at is not null)
--        or (status <> 'paid' and paid_at is null) )
--
-- which makes the 'refunded' status unreachable. A refund only happens to a
-- payment that was settled, so the row keeps its paid_at — and a row with
-- status='refunded' and paid_at set satisfies neither branch. Any attempt to
-- record a refund would fail with a check violation.
--
-- Found by reading the constraint against the enum rather than by hitting it:
-- no refund has been attempted yet, and public.payments still holds no rows
-- that would need rewriting.
--
-- THE RULE, stated properly: paid_at is set for exactly the statuses that
-- imply money actually moved — 'paid' and 'refunded' — and null otherwise
-- ('pending', 'expired', 'failed').
-- ============================================================================

alter table public.payments
  drop constraint payments_paid_at_matches_status;

alter table public.payments
  add constraint payments_paid_at_matches_status check (
    (status in ('paid'::public.payment_status, 'refunded'::public.payment_status)
       and paid_at is not null)
    or
    (status not in ('paid'::public.payment_status, 'refunded'::public.payment_status)
       and paid_at is null)
  );

-- The preimage rule needs widening for the same reason: a refunded payment may
-- legitimately still carry the preimage that settled it.
alter table public.payments
  drop constraint payments_preimage_only_when_paid;

alter table public.payments
  add constraint payments_preimage_only_when_settled check (
    preimage is null
    or status in ('paid'::public.payment_status, 'refunded'::public.payment_status)
  );

comment on column public.payments.paid_at is
  'Set for statuses where money moved (paid, refunded); null otherwise.';
