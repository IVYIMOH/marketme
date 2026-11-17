-- Photographer onboarding uses the authenticated account and RLS.
-- Company is available through the private profile accessor.
alter table public.photographers add column company text;
alter table public.photographers add constraint photographers_company_valid
  check (company is null or (company ~ '[^[:space:]]' and char_length(company) <= 200));

revoke select on table public.photographers from anon, authenticated;
revoke select (company) on table public.photographers from anon, authenticated;
grant select (id, user_id, bio, level, verified_at, created_at)
  on table public.photographers to anon, authenticated;

revoke insert on table public.photographers from anon, authenticated;
revoke insert (id, user_id, bio, level, verified_at, created_at, company)
  on table public.photographers from anon, authenticated;
grant insert (user_id, company) on table public.photographers to authenticated;
grant update (company) on table public.photographers to authenticated;

create policy "photographers_insert_own"
  on public.photographers for insert to authenticated
  with check ((select auth.uid()) = user_id and company is not null);

create function public.get_my_photographer_profile()
  returns setof public.photographers
  language sql stable security definer set search_path = ''
as $$
  select p.* from public.photographers p where p.user_id = auth.uid();
$$;
revoke all on function public.get_my_photographer_profile() from public, anon, authenticated;
grant execute on function public.get_my_photographer_profile() to authenticated, service_role;

-- Invoker privileges keep both writes inside their existing RLS policies.
-- An existing row is updated on retry; level and verification are untouched.
create function public.complete_photographer_profile(profile_name text, company_name text)
  returns uuid
  language plpgsql security invoker set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  clean_name text := btrim(coalesce(profile_name, ''));
  clean_company text := btrim(coalesce(company_name, ''));
  profile_id uuid;
begin
  if caller_id is null then
    raise exception 'Sign in before completing your profile.' using errcode = '42501';
  end if;
  if clean_name !~ '[^[:space:]]' or char_length(clean_name) > 120 then
    raise exception 'Enter a name between 1 and 120 characters.' using errcode = '22023';
  end if;
  if clean_company !~ '[^[:space:]]' or char_length(clean_company) > 200 then
    raise exception 'Enter a company between 1 and 200 characters.' using errcode = '22023';
  end if;

  update public.profiles set display_name = clean_name where id = caller_id;
  if not found then
    raise exception 'Your account profile was not found.' using errcode = 'P0002';
  end if;

  update public.photographers set company = clean_company
    where user_id = caller_id returning id into profile_id;
  if not found then
    insert into public.photographers (user_id, company)
      values (caller_id, clean_company) returning id into profile_id;
  end if;
  return profile_id;
end;
$$;
revoke all on function public.complete_photographer_profile(text, text) from public, anon, authenticated;
grant execute on function public.complete_photographer_profile(text, text) to authenticated;

notify pgrst, 'reload schema';
