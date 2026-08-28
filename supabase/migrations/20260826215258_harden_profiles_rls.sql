-- ============================================================================
-- Hardens authorization on public.profiles.
--
-- Fixes items 1-4 from the review of 20260826133138_remote_schema.sql:
--   1. Privilege escalation: role was self-writable by any signed-in user.
--   2. Duplicate SELECT and UPDATE policies (four policies, two behaviours).
--   3. anon held delete/truncate/update grants the app never uses.
--   4. Default privileges auto-granted anon full access to every future table.
--
-- CONTAINS NO DML. No row in public.profiles is inserted, updated or deleted
-- here, and the role column is not altered, retyped, dropped or recreated.
-- Existing role values are preserved untouched.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1a. Admin predicate.
--
-- SECURITY DEFINER so it reads public.profiles as the table owner and is thus
-- exempt from the profiles RLS policies. A bare subquery over profiles inside
-- a profiles policy would re-enter those same policies and recurse.
--
-- search_path is pinned to '' so a caller cannot shadow `profiles` or the
-- user_role enum with an object in a schema they control; consequently every
-- name below is fully qualified.
-- ----------------------------------------------------------------------------
create or replace function public.is_admin(check_id uuid default auth.uid())
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = check_id
       and p.role = 'admin'::public.user_role
  );
$$;

-- The baseline's ALTER DEFAULT PRIVILEGES (:101-105) grants EXECUTE on every
-- new public function to anon, so revoke explicitly instead of trusting
-- defaults. Section 4 below does not undo that, only the table equivalent.
revoke all    on function public.is_admin(uuid) from public, anon;
grant  execute on function public.is_admin(uuid) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 1b + 2. Replace the four duplicated policies with one of each behaviour.
-- ----------------------------------------------------------------------------
drop policy if exists "Profiles are publicly viewable"           on public.profiles;
drop policy if exists "Public profiles are viewable by everyone"  on public.profiles;
drop policy if exists "Users can update only their own profile"   on public.profiles;
drop policy if exists "Users can update their own profile"        on public.profiles;

-- Unchanged in effect from the baseline: profiles stay world-readable.
-- Narrowed from TO PUBLIC to the two Data API roles that actually reach it.
create policy "profiles_select_public"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

-- WITH CHECK is stated explicitly rather than left to default to USING, so the
-- row a user may modify and the row they may write back are separately
-- auditable. Both clauses pin id to auth.uid(), so a user can neither reach
-- another user's row nor reassign their own row to a different id.
--
-- Note this policy does NOT restrict which columns may change -- policies
-- cannot. Column scoping is enforced by the grants in section 1c.
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using      (auth.uid() = id)
  with check (auth.uid() = id);


-- ----------------------------------------------------------------------------
-- 1c + 3. Column-level privileges.
--
-- This is what actually stops role escalation. Column privileges are checked
-- BEFORE row security, so an UPDATE naming `role` is refused with 42501
-- without any policy being consulted.
-- ----------------------------------------------------------------------------
revoke all on table public.profiles from anon, authenticated;

-- anon: read only.
-- src/main.js calls only supabase.auth.signUp() and signInWithOAuth(); there is
-- no .from() or .rpc() call anywhere in src/. The first profile row is written
-- by the SECURITY DEFINER trigger handle_new_user() on auth.users, never by the
-- browser, so anon needs no INSERT. DELETE and TRUNCATE are dropped outright.
grant select on table public.profiles to anon;

-- authenticated: read, plus self-service on display_name only.
-- id, created_at and role are omitted and are therefore immutable through the
-- Data API. Adding a future self-service column requires extending this grant,
-- which fails closed rather than open.
grant select                on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

-- service_role is the trusted server-side credential and keeps full access;
-- it is the bootstrap path for the first admin (see 1d).
grant select, insert, update, delete on table public.profiles to service_role;


-- ----------------------------------------------------------------------------
-- 1d. The admin-only path for role changes.
--
-- SECURITY DEFINER, so it runs as the table owner and is exempt from both the
-- column grants above and RLS. It therefore guards itself with is_admin()
-- before touching anything.
-- ----------------------------------------------------------------------------
create or replace function public.set_profile_role(
    target_id uuid,
    new_role  public.user_role
  )
  returns public.profiles
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  updated public.profiles;
begin
  if not public.is_admin() then
    raise exception 'permission denied: only an admin may change a profile role'
      using errcode = '42501';
  end if;

  update public.profiles
     set role = new_role
   where id = target_id
  returning * into updated;

  if not found then
    raise exception 'profile % not found', target_id
      using errcode = 'P0002';
  end if;

  return updated;
end;
$$;

revoke all    on function public.set_profile_role(uuid, public.user_role) from public, anon;
grant  execute on function public.set_profile_role(uuid, public.user_role) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 4. Stop auto-granting every future table to the browser-facing roles.
--
-- Reverses baseline :107-109 for anon and authenticated. Matches the current
-- Supabase cloud default, which this project's own supabase/config.toml
-- already documents and expects: auto_expose_new_tables is unset, described
-- there as "new entities are NOT auto-exposed, matching the new cloud
-- default", with the legacy auto-expose behaviour deprecated and the field
-- removed on 2026-10-30.
--
-- Consequence, deliberately: a new table in public is NOT reachable through
-- the Data API until it is granted explicitly. A forgotten
-- `enable row level security` no longer means a world-writable table.
-- service_role's default is left intact.
-- ----------------------------------------------------------------------------
alter default privileges for role postgres in schema public
  revoke all on tables from anon;

alter default privileges for role postgres in schema public
  revoke all on tables from authenticated;
