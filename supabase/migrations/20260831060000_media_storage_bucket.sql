-- ============================================================================
-- Creates the private 'media' storage bucket and the RLS policies that govern
-- it. Additive: nothing in 20260831040000_initial_schema.sql is altered.
--
-- Approach chosen deliberately. supabase/config.toml supports declarative
-- local buckets ([storage.buckets.media], commented at line 121), but that is
-- applied by `supabase start` for LOCAL development only and does not travel
-- to a hosted project. Inserting into storage.buckets from a migration is the
-- portable form: the same file provisions local and production, and the
-- objects policies live beside it under version control.
--
-- storage.objects already has RLS enabled with ZERO policies, verified before
-- writing this, so today no client can read or write any object at all. The
-- broad table grants Supabase ships on storage.objects are therefore inert
-- until the policies below narrow them.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. The bucket.
--
-- public = false is the whole point: a public bucket would serve every object
-- over a guessable unauthenticated URL, which would defeat the storage_key
-- secrecy the media column grants already enforce. Access is by signed URL.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  false,
  10485760,                                          -- 10 MiB per object
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- ----------------------------------------------------------------------------
-- 2. Path-ownership predicate.
--
-- Uploads are written to `<photographer_id>/<uuid>-<filename>`, so the first
-- path segment identifies the owning photographer.
--
-- split_part is used rather than storage.foldername(...)[1] with a ::uuid
-- cast: casting an arbitrary leading segment to uuid raises 22P02 on any
-- malformed path, which would turn a policy evaluation into a hard error.
-- Comparing id::text instead fails closed and silently, which is what a
-- policy predicate should do.
-- ----------------------------------------------------------------------------
create or replace function public.owns_media_path(object_name text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
      from public.photographers p
     where p.user_id = auth.uid()
       and p.id::text = split_part(object_name, '/', 1)
  );
$$;

revoke all    on function public.owns_media_path(text) from public, anon;
grant  execute on function public.owns_media_path(text) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. Approved-object predicate.
--
-- createSignedUrl() requires SELECT on storage.objects (per the storage-js
-- contract), so the public gallery needs a read path for approved work only.
-- Matched on preview_key, never storage_key: if a real downscaling pipeline
-- later makes those two columns differ, this policy keeps exposing only the
-- preview and the original stays unreachable without a further grant.
-- ----------------------------------------------------------------------------
create or replace function public.is_approved_media_object(object_name text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
      from public.media m
     where m.preview_key = object_name
       and m.status = 'approved'::public.media_status
  );
$$;

revoke all    on function public.is_approved_media_object(text) from public;
grant  execute on function public.is_approved_media_object(text) to anon, authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 4. Policies on storage.objects, all scoped to bucket_id = 'media' so no
--    other bucket is affected by anything here.
-- ----------------------------------------------------------------------------

-- A photographer may upload only beneath their own photographer id.
create policy "media_objects_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and public.owns_media_path(name)
  );

-- A photographer may read back their own objects at any moderation status,
-- which is what the dashboard needs.
create policy "media_objects_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'media'
    and public.owns_media_path(name)
  );

-- Anyone may read an object belonging to approved media. This is the gallery's
-- signed-URL path.
create policy "media_objects_select_approved"
  on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'media'
    and public.is_approved_media_object(name)
  );

-- Admins read everything in the bucket, for the moderation queue.
create policy "media_objects_select_admin"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'media'
    and public.is_admin()
  );

-- A photographer may delete their own object only while the corresponding
-- media row is still pending, mirroring media_update_own_pending. No UPDATE
-- policy: replacing an object in place would let approved content be swapped
-- after moderation.
create policy "media_objects_delete_own_pending"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'media'
    and public.owns_media_path(name)
    and exists (
      select 1
        from public.media m
       where m.storage_key = storage.objects.name
         and m.status = 'pending'::public.media_status
    )
  );
