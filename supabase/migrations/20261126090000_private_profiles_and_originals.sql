-- Buyers can read their own profile. Only photographer profiles appear in the directory.
alter policy profiles_select_public on public.profiles using (
  id = (select auth.uid()) or exists (
    select 1 from public.photographers p where p.user_id = profiles.id
  )
);

-- Limit browser submissions to objects in the submitting photographer's originals folder.
alter policy media_insert_own on public.media with check (
  public.owns_photographer(photographer_id)
  and storage_key ~ ('^' || photographer_id::text || '/originals/[0-9a-f-]{36}$')
);

create or replace function public.set_media_preview_key()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.photographer_id is not null and nullif(btrim(new.preview_key), '') is null then
    new.preview_key := new.photographer_id::text || '/previews/' ||
      split_part(new.storage_key, '/', 3) || '.jpg';
  end if;
  return new;
end;
$$;

-- Previously the original also served as the preview. Retain the original for
-- its owner and purchasers. A legacy preview can be backfilled at this new path.
update public.media
   set preview_key = photographer_id::text || '/previews/legacy-' || id::text || '.jpg'
 where not is_sample and preview_key = storage_key;

alter table public.media add constraint media_preview_is_separate check (preview_key <> storage_key);

create or replace function public.is_approved_media_object(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.media m
     where m.status = 'approved' and m.preview_key = object_name
       and (m.is_sample or split_part(object_name, '/', 1) = m.photographer_id::text)
  ) and not exists (select 1 from public.media m where m.storage_key = object_name);
$$;

create or replace function public.is_purchased_media_object(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.media m join public.payments p on p.media_id = m.id
     where m.storage_key = object_name and split_part(object_name, '/', 1) = m.photographer_id::text
       and p.buyer_id = auth.uid() and p.status = 'paid'
  );
$$;

create or replace function public.get_my_purchase_key(target_media_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.storage_key from public.media m
   where m.id = target_media_id and split_part(m.storage_key, '/', 1) = m.photographer_id::text
     and public.has_paid_for_media(m.id);
$$;

-- Resolve references as the policy owner. Browser roles cannot read storage_key.
create function public.can_delete_own_media_object(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.owns_media_path(object_name) and not exists (
    select 1 from public.media where (storage_key = object_name or preview_key = object_name)
      and status <> 'pending'
  );
$$;
revoke all on function public.can_delete_own_media_object(text) from public, anon;
grant execute on function public.can_delete_own_media_object(text) to authenticated;
alter policy media_objects_delete_own_pending on storage.objects
  using (bucket_id = 'media' and public.can_delete_own_media_object(name));

notify pgrst, 'reload schema';
