-- The operator processes requests using a trusted admin connection.
create table public.privacy_requests (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('access', 'deletion')),
  requested_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.privacy_requests enable row level security;
revoke all on public.privacy_requests from public, anon, authenticated;
grant insert (kind) on public.privacy_requests to authenticated;
grant select, delete on public.privacy_requests to service_role;
create policy privacy_requests_insert_self on public.privacy_requests
  for insert to authenticated with check (user_id = (select auth.uid()));
notify pgrst, 'reload schema';
