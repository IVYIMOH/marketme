-- ============================================================================
-- Adds the photographer / media / payments schema, the moderation accessor
-- functions, and the custom access token hook.
--
-- Written to match the already-reviewed contract in frontend/lib/api.ts and
-- frontend/lib/auth.ts exactly. Column names, the photographers.id vs
-- user_id split, and the three-value enums are taken from those files, not
-- invented here.
--
-- ADDITIVE ONLY. This migration does not drop, weaken or replace anything
-- established by 20260826215258_harden_profiles_rls.sql:
--   * profiles column grants (role still not client-writable) untouched
--   * profiles_select_public / profiles_update_own untouched
--   * the postgres default-privilege revokes stay in force, which is why
--     every new table below is granted explicitly
--   * is_admin() and set_profile_role() are reused as-is, not redefined
--
-- The one pre-existing object modified is handle_new_user(), and only to
-- widen the display-name lookup. See section 6 for why.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Enums.
--
-- Values match the string unions in api.ts:24 (level) and api.ts:13 (status).
-- ----------------------------------------------------------------------------
create type public.photographer_level as enum ('field', 'verified', 'master');
create type public.media_status       as enum ('pending', 'approved', 'rejected');

-- Enum types are usable by PUBLIC by default; stated explicitly so a future
-- blanket revoke does not silently break PostgREST's ability to serialise
-- these columns.
grant usage on type public.photographer_level to anon, authenticated, service_role;
grant usage on type public.media_status       to anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 2. photographers.
--
-- api.ts:20-27 declares BOTH `id` and `user_id`, so id is a surrogate key
-- distinct from the auth user. media.photographer_id therefore references
-- photographers.id, not auth.users.id — confirmed by submitMedia() taking
-- photographerId from getMyPhotographerProfile(), which returns the row.
--
-- user_id is UNIQUE: one photographer profile per account.
-- ----------------------------------------------------------------------------
create table public.photographers (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null unique references auth.users(id) on delete cascade,
  bio         text        not null default '',
  level       public.photographer_level not null default 'field',
  verified_at timestamptz,
  created_at  timestamptz not null default timezone('utc', now())
);

alter table public.photographers enable row level security;

create index photographers_user_id_idx on public.photographers (user_id);


-- ----------------------------------------------------------------------------
-- 3. media.
--
-- Column set from api.ts:3-18, plus mime_type which submitMedia() sends at
-- api.ts:89 but the Media interface omits.
--
-- preview_key: submitMedia() never supplies this, yet api.ts:11 types it
-- non-null and getMedia() renders from it. It is therefore derived from
-- storage_key by the trigger in section 5.
--
-- KNOWN GAP, deliberately not papered over: that derivation makes the
-- preview the SAME object as the original until a real downscaling pipeline
-- exists. The storage_key/preview_key privilege split below is still
-- correct and enforced, but it does not yet buy resolution protection.
-- ----------------------------------------------------------------------------
create table public.media (
  id             uuid        primary key default gen_random_uuid(),
  photographer_id uuid       not null references public.photographers(id) on delete cascade,
  title          text        not null check (length(trim(title)) > 0),
  category       text        not null check (length(trim(category)) > 0),
  location       text        not null check (length(trim(location)) > 0),
  lens           text,
  price_sats     bigint      not null check (price_sats >= 0),
  storage_key    text        not null check (length(trim(storage_key)) > 0),
  preview_key    text        not null default '',
  mime_type      text,
  status         public.media_status not null default 'pending',
  reject_reason  text,
  moderated_by   uuid        references auth.users(id) on delete set null,
  moderated_at   timestamptz,
  created_at     timestamptz not null default timezone('utc', now()),

  -- A rejection must carry a reason; an approval must not.
  constraint media_reject_reason_only_when_rejected check (
    (status = 'rejected' and reject_reason is not null)
    or (status <> 'rejected' and reject_reason is null)
  ),
  -- Moderation stamps are set together or not at all.
  constraint media_moderation_stamps_together check (
    (moderated_by is null) = (moderated_at is null)
  )
);

alter table public.media enable row level security;

create index media_status_created_idx  on public.media (status, created_at desc);
create index media_photographer_id_idx on public.media (photographer_id);


-- ----------------------------------------------------------------------------
-- 4. payments.
--
-- NO FRONTEND CONTRACT EXISTS FOR THIS TABLE. api.ts never references it.
-- The shape below is inferred from media.price_sats implying Lightning, and
-- is the least-committal thing that still records a real payment. Treat every
-- column as provisional until the payment flow is actually written.
-- ----------------------------------------------------------------------------
create type public.payment_status as enum ('pending', 'paid', 'expired', 'failed');
grant usage on type public.payment_status to anon, authenticated, service_role;

create table public.payments (
  id           uuid        primary key default gen_random_uuid(),
  buyer_id     uuid        not null references auth.users(id) on delete cascade,
  media_id     uuid        not null references public.media(id) on delete restrict,
  amount_sats  bigint      not null check (amount_sats >= 0),
  invoice      text        not null,
  payment_hash text        not null unique,
  preimage     text,
  status       public.payment_status not null default 'pending',
  paid_at      timestamptz,
  created_at   timestamptz not null default timezone('utc', now()),

  constraint payments_preimage_only_when_paid check (
    (status = 'paid' and preimage is not null and paid_at is not null)
    or (status <> 'paid' and preimage is null and paid_at is null)
  )
);

alter table public.payments enable row level security;

create index payments_buyer_id_idx on public.payments (buyer_id);
create index payments_media_id_idx on public.payments (media_id);


-- ----------------------------------------------------------------------------
-- 5. Derive preview_key on insert.
--
-- Kept as a trigger rather than a generated column so that a future real
-- pipeline can overwrite preview_key without fighting an immutable
-- expression.
-- ----------------------------------------------------------------------------
create or replace function public.set_media_preview_key()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.preview_key is null or length(trim(new.preview_key)) = 0 then
    new.preview_key := new.storage_key;
  end if;
  return new;
end;
$$;

revoke all on function public.set_media_preview_key() from public, anon, authenticated;

create trigger media_set_preview_key
  before insert on public.media
  for each row
  execute function public.set_media_preview_key();


-- ----------------------------------------------------------------------------
-- 6. Widen handle_new_user()'s display-name lookup.
--
-- WHY THIS CHANGE: auth.ts:47 sends options.data.display_name, but the
-- original trigger read only raw_user_meta_data->>'full_name'. Every user
-- registering through register() silently got their email prefix as
-- display_name. Fixed here rather than in auth.ts because auth.ts is
-- already-reviewed code and 'full_name' still has to keep working for the
-- Google OAuth path (signInWithGoogle at auth.ts:90).
--
-- Body is otherwise identical to the original: same INSERT, same hardcoded
-- 'buyer' default, still SECURITY DEFINER. search_path is now pinned, which
-- the original lacked.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    'buyer'
  );
  return new;
end;
$$;

-- Re-assert the tightened grants from 20260829090000; CREATE OR REPLACE
-- preserves the existing ACL, but stating it keeps this migration
-- self-contained if replayed against a fresh database.
revoke execute on function public.handle_new_user() from public, anon;


-- ----------------------------------------------------------------------------
-- 7. Ownership predicate.
--
-- SECURITY DEFINER so a media policy can test photographer ownership without
-- re-entering photographers' own RLS. search_path pinned, names qualified,
-- for the same reasons documented on is_admin().
-- ----------------------------------------------------------------------------
create or replace function public.owns_photographer(ph_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
      from public.photographers p
     where p.id = ph_id
       and p.user_id = auth.uid()
  );
$$;

-- Function default privileges still grant EXECUTE to anon (pg_default_acl
-- objtype 'f' was never revoked, only 'r'), so revoke explicitly.
revoke all    on function public.owns_photographer(uuid) from public, anon;
grant  execute on function public.owns_photographer(uuid) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 8. photographers: policies and grants.
--
-- getPhotographers() (api.ts:52) selects '*' unfiltered, so the directory is
-- world-readable. verified_at and level are public signals by design.
-- ----------------------------------------------------------------------------
create policy "photographers_select_public"
  on public.photographers
  for select
  to anon, authenticated
  using (true);

-- A photographer edits only their own row. level and verified_at are excluded
-- from the column grant below, so they cannot self-promote — the same
-- column-privilege technique that protects profiles.role.
create policy "photographers_update_own"
  on public.photographers
  for update
  to authenticated
  using      (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on table public.photographers from anon, authenticated;
grant select on table public.photographers to anon, authenticated;
grant update (bio) on table public.photographers to authenticated;
grant select, insert, update, delete on table public.photographers to service_role;


-- ----------------------------------------------------------------------------
-- 9. media: policies and grants.
--
-- This is the storage_key firewall. Column privileges are checked before row
-- security, so a client naming storage_key is refused with 42501 regardless
-- of policy — storage_key reaches a photographer only through
-- get_my_submissions(), and an admin only through get_moderation_queue().
-- ----------------------------------------------------------------------------

-- Public gallery: approved rows only. Matches getMedia() (api.ts:35).
create policy "media_select_approved"
  on public.media
  for select
  to anon, authenticated
  using (status = 'approved'::public.media_status);

-- A photographer sees their own rows at any status, so a pending or rejected
-- submission is visible on their dashboard.
create policy "media_select_own"
  on public.media
  for select
  to authenticated
  using (public.owns_photographer(photographer_id));

create policy "media_select_admin"
  on public.media
  for select
  to authenticated
  using (public.is_admin());

-- submitMedia() (api.ts:82) sends photographer_id from the client. WITH CHECK
-- binds it to the caller's own photographer row, so a photographer cannot
-- submit under someone else's identity.
create policy "media_insert_own"
  on public.media
  for insert
  to authenticated
  with check (public.owns_photographer(photographer_id));

-- Edits are allowed only while still pending. Once moderated, the row is
-- frozen to the photographer; USING pins the pre-image status and WITH CHECK
-- stops a photographer flipping their own row back to pending.
create policy "media_update_own_pending"
  on public.media
  for update
  to authenticated
  using      (public.owns_photographer(photographer_id)
              and status = 'pending'::public.media_status)
  with check (public.owns_photographer(photographer_id)
              and status = 'pending'::public.media_status);

revoke all on table public.media from anon, authenticated;

-- Readable columns. storage_key, mime_type, reject_reason, moderated_by and
-- moderated_at are all omitted deliberately and are unreachable through the
-- Data API by any client role.
grant select (
  id, photographer_id, title, category, location, lens,
  price_sats, preview_key, status, created_at
) on table public.media to anon, authenticated;

-- Insertable columns. status is omitted, so a submission cannot arrive
-- pre-approved; it takes the 'pending' default. preview_key is omitted
-- because the trigger derives it.
grant insert (
  photographer_id, title, category, location, lens,
  price_sats, storage_key, mime_type
) on table public.media to authenticated;

-- Editable columns while pending, per the policy above.
grant update (
  title, category, location, lens, price_sats
) on table public.media to authenticated;

grant select, insert, update, delete on table public.media to service_role;


-- ----------------------------------------------------------------------------
-- 10. payments: policies and grants.
--
-- Deliberately restrictive: a buyer may read their own payment rows and
-- nothing else. Invoice creation and settlement both require trusted
-- server-side context (a Lightning node), so there is no client INSERT or
-- UPDATE grant at all. Revisit when the payment flow is written.
-- ----------------------------------------------------------------------------
create policy "payments_select_own"
  on public.payments
  for select
  to authenticated
  using (buyer_id = auth.uid());

create policy "payments_select_admin"
  on public.payments
  for select
  to authenticated
  using (public.is_admin());

revoke all on table public.payments from anon, authenticated;
grant select (
  id, buyer_id, media_id, amount_sats, invoice, status, paid_at, created_at
) on table public.payments to authenticated;
grant select, insert, update, delete on table public.payments to service_role;


-- ----------------------------------------------------------------------------
-- 11. Accessor functions.
--
-- All SECURITY DEFINER so they can return the columns withheld above, and
-- all self-guarding. Each returns SETOF public.media, which is why
-- storage_key and the moderation fields come back through them.
-- ----------------------------------------------------------------------------

-- api.ts:102. The photographer's own submissions, all statuses.
create or replace function public.get_my_submissions()
  returns setof public.media
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select m.*
    from public.media m
    join public.photographers p on p.id = m.photographer_id
   where p.user_id = auth.uid()
   order by m.created_at desc;
$$;

revoke all    on function public.get_my_submissions() from public, anon;
grant  execute on function public.get_my_submissions() to authenticated, service_role;


-- api.ts:110. Admin only. Raises rather than returning empty, so the
-- frontend surfaces a real error instead of an innocuous empty queue.
create or replace function public.get_moderation_queue()
  returns setof public.media
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'permission denied: only an admin may read the moderation queue'
      using errcode = '42501';
  end if;

  return query
    select m.*
      from public.media m
     where m.status = 'pending'::public.media_status
     order by m.created_at asc;
end;
$$;

revoke all    on function public.get_moderation_queue() from public, anon;
grant  execute on function public.get_moderation_queue() to authenticated, service_role;


-- api.ts:116.
create or replace function public.approve_media(target_id uuid)
  returns public.media
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  updated public.media;
begin
  if not public.is_admin() then
    raise exception 'permission denied: only an admin may approve media'
      using errcode = '42501';
  end if;

  update public.media
     set status        = 'approved'::public.media_status,
         reject_reason = null,
         moderated_by  = auth.uid(),
         moderated_at  = timezone('utc', now())
   where id = target_id
  returning * into updated;

  if not found then
    raise exception 'media % not found', target_id using errcode = 'P0002';
  end if;

  return updated;
end;
$$;

revoke all    on function public.approve_media(uuid) from public, anon;
grant  execute on function public.approve_media(uuid) to authenticated, service_role;


-- api.ts:121. `reason` is optional on the client but the table constraint
-- requires one on a rejection, so a null collapses to a stated default
-- rather than failing the insert with a constraint error the UI cannot act on.
create or replace function public.reject_media(target_id uuid, reason text default null)
  returns public.media
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  updated public.media;
begin
  if not public.is_admin() then
    raise exception 'permission denied: only an admin may reject media'
      using errcode = '42501';
  end if;

  update public.media
     set status        = 'rejected'::public.media_status,
         reject_reason = coalesce(nullif(trim(reason), ''), 'No reason given'),
         moderated_by  = auth.uid(),
         moderated_at  = timezone('utc', now())
   where id = target_id
  returning * into updated;

  if not found then
    raise exception 'media % not found', target_id using errcode = 'P0002';
  end if;

  return updated;
end;
$$;

revoke all    on function public.reject_media(uuid, text) from public, anon;
grant  execute on function public.reject_media(uuid, text) to authenticated, service_role;


-- api.ts:129. Admin only; this is the path that sets level, which the
-- column grant in section 8 withholds from the photographer themselves.
create or replace function public.set_photographer_level(
    target_id uuid,
    new_level public.photographer_level
  )
  returns public.photographers
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  updated public.photographers;
begin
  if not public.is_admin() then
    raise exception 'permission denied: only an admin may set a photographer level'
      using errcode = '42501';
  end if;

  update public.photographers
     set level       = new_level,
         verified_at = case
                         when new_level = 'field'::public.photographer_level then null
                         else coalesce(verified_at, timezone('utc', now()))
                       end
   where id = target_id
  returning * into updated;

  if not found then
    raise exception 'photographer % not found', target_id using errcode = 'P0002';
  end if;

  return updated;
end;
$$;

revoke all    on function public.set_photographer_level(uuid, public.photographer_level) from public, anon;
grant  execute on function public.set_photographer_level(uuid, public.photographer_level) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 12. Auto-provision a photographers row when a profile becomes photographer.
--
-- Additive: set_profile_role() is reused untouched, and this fires off the
-- resulting UPDATE instead of being wired into it. ON CONFLICT DO NOTHING
-- makes it idempotent and safe for a demote/re-promote cycle.
-- ----------------------------------------------------------------------------
create or replace function public.ensure_photographer_row()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if new.role = 'photographer'::public.user_role then
    insert into public.photographers (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.ensure_photographer_row() from public, anon, authenticated;

create trigger profiles_ensure_photographer_row
  after insert or update of role on public.profiles
  for each row
  execute function public.ensure_photographer_row();


-- ----------------------------------------------------------------------------
-- 13. Custom access token hook.
--
-- Writes profiles.role into app_metadata.app_role on every issued JWT, which
-- is what auth.ts:28 reads. Deliberately NOT security definer: it runs as
-- supabase_auth_admin, and its read of profiles is authorised by an explicit
-- table grant plus the narrow policy below. That keeps the access path
-- visible in pg_policies instead of hidden inside a definer function.
--
-- Must be registered in supabase/config.toml to fire:
--   [auth.hook.custom_access_token]
--   enabled = true
--   uri = "pg-functions://postgres/public/custom_access_token_hook"
-- ----------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
  returns jsonb
  language plpgsql
  stable
  set search_path = ''
as $$
declare
  found_role public.user_role;
  claims     jsonb;
begin
  select p.role
    into found_role
    from public.profiles p
   where p.id = (event->>'user_id')::uuid;

  claims := event->'claims';

  -- jsonb_set cannot create an intermediate object, so app_metadata must
  -- exist before the nested path is written.
  if claims->'app_metadata' is null or jsonb_typeof(claims->'app_metadata') <> 'object' then
    claims := jsonb_set(claims, '{app_metadata}', '{}'::jsonb);
  end if;

  claims := jsonb_set(
    claims,
    '{app_metadata,app_role}',
    case
      when found_role is null then 'null'::jsonb
      else to_jsonb(found_role::text)
    end
  );

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb)
  from public, anon, authenticated;

-- The hook runs as supabase_auth_admin, which is not covered by
-- profiles_select_public (that policy targets anon and authenticated only).
grant select on table public.profiles to supabase_auth_admin;

create policy "profiles_select_auth_admin"
  on public.profiles
  for select
  to supabase_auth_admin
  using (true);
