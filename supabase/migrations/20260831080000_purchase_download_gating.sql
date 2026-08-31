-- ============================================================================
-- Download gating for purchased work.
--
-- A buyer must be able to fetch the ORIGINAL (storage_key), not the preview,
-- but only after paying. Two things stand in the way, both deliberately:
--   * media.storage_key has no column grant for `authenticated`, so a buyer
--     cannot read the key at all.
--   * storage.objects only permits reading an approved item's preview_key,
--     the photographer's own objects, or anything as admin.
--
-- This migration opens exactly one path: paid buyer -> that item's original.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. Has the caller paid for this item?
--
-- SECURITY DEFINER so it can read both payments and media past the column
-- grants. Guards on auth.uid(), so it can only ever answer for the caller.
-- ----------------------------------------------------------------------------
create or replace function public.has_paid_for_media(target_media_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
      from public.payments p
     where p.media_id = target_media_id
       and p.buyer_id = auth.uid()
       and p.status   = 'paid'::public.payment_status
  );
$$;

revoke all    on function public.has_paid_for_media(uuid) from public, anon;
grant  execute on function public.has_paid_for_media(uuid) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 2. The storage key for something the caller has bought.
--
-- Returns null rather than raising when unpaid: "you have not bought this" is
-- a normal UI state, not an error. Raises only when the item does not exist.
-- ----------------------------------------------------------------------------
create or replace function public.get_my_purchase_key(target_media_id uuid)
  returns text
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  key text;
begin
  if not public.has_paid_for_media(target_media_id) then
    return null;
  end if;

  select m.storage_key
    into key
    from public.media m
   where m.id = target_media_id;

  if not found then
    raise exception 'media % not found', target_media_id using errcode = 'P0002';
  end if;

  return key;
end;
$$;

revoke all    on function public.get_my_purchase_key(uuid) from public, anon;
grant  execute on function public.get_my_purchase_key(uuid) to authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 3. Let a paying buyer read the object itself.
--
-- Without this, get_my_purchase_key() would hand back a key that
-- createSignedUrl() then refuses to sign, since signing requires SELECT on
-- storage.objects.
--
-- Matched on storage_key, so this grants the ORIGINAL — the one case in the
-- schema where a non-owner may read it, and only against a paid row.
-- ----------------------------------------------------------------------------
create or replace function public.is_purchased_media_object(object_name text)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select exists (
    select 1
      from public.media m
      join public.payments p on p.media_id = m.id
     where m.storage_key = object_name
       and p.buyer_id    = auth.uid()
       and p.status      = 'paid'::public.payment_status
  );
$$;

revoke all    on function public.is_purchased_media_object(text) from public, anon;
grant  execute on function public.is_purchased_media_object(text) to authenticated, service_role;

create policy "media_objects_select_purchased"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'media'
    and public.is_purchased_media_object(name)
  );
