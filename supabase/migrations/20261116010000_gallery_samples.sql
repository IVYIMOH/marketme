-- Sample previews have attribution, but no seller account or purchasable original.
alter table public.media
  add column is_sample boolean not null default false,
  add column photographer_credit text,
  add column source_url text,
  add column license_name text,
  add column license_url text,
  alter column photographer_id drop not null;

alter table public.media
  add constraint media_seller_required check (is_sample or photographer_id is not null),
  add constraint media_sample_metadata check (
    not is_sample or (
      price_sats = 0
      and preview_key <> storage_key
      and coalesce(length(trim(photographer_credit)), 0) > 0
      and coalesce(length(trim(license_name)), 0) > 0
      and coalesce(source_url ~ '^https://', false)
      and coalesce(license_url ~ '^https://', false)
    )
  );

-- These remain server-managed. Existing client INSERT/UPDATE grants are unchanged.
grant select (is_sample, photographer_credit, source_url, license_name, license_url)
  on public.media to anon, authenticated;

create function public.keep_media_sample_kind()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.is_sample is distinct from old.is_sample then
    raise exception 'The sample flag cannot be changed after creation' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.keep_media_sample_kind() from public, anon, authenticated;
create trigger media_keep_sample_kind
  before update of is_sample on public.media
  for each row execute function public.keep_media_sample_kind();

-- Also protects trusted payment writers if an invoice path misses its own guard.
create function public.reject_sample_payment()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if exists (select 1 from public.media where id = new.media_id and is_sample) then
    raise exception 'Sample images are not for sale' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.reject_sample_payment() from public, anon, authenticated;
create trigger payments_reject_samples
  before insert or update on public.payments
  for each row execute function public.reject_sample_payment();
