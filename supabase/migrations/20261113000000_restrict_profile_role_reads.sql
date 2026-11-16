revoke select on table public.profiles from anon, authenticated;
revoke select (role) on table public.profiles from anon, authenticated;
grant select (id, display_name, created_at)
  on table public.profiles to anon, authenticated;
