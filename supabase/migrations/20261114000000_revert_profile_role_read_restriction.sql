-- Revert 20261113000000 because acceptance check g did not pass:
-- the gallery and dashboard do not render display names.
-- Restore the previous SELECT grants while preserving display-name updates
-- and the separate supabase_auth_admin grant.
revoke select (id, display_name, created_at)
  on table public.profiles from anon, authenticated;
grant select on table public.profiles to anon, authenticated;
