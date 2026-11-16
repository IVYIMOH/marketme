-- Restore the public profile column restriction reverted on 2026-11-14.
-- Table-wide SELECT overrides column-level restrictions.
revoke select on table public.profiles from anon, authenticated;
revoke select (role) on table public.profiles from anon, authenticated;
grant select (id, display_name, created_at)
  on table public.profiles to anon, authenticated;
