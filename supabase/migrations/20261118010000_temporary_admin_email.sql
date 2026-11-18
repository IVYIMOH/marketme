-- Temporary admin bootstrap. The verified email is the single configuration
-- point; the existing role, token hook, and moderation permissions remain authoritative.
create function public.temporary_admin_email()
  returns text
  language sql immutable
  set search_path = ''
as $$ select 'ivyimoh@gmail.com'::text $$;
revoke all on function public.temporary_admin_email() from public, anon, authenticated;

create function public.assign_temporary_admin()
  returns trigger
  language plpgsql security definer
  set search_path = ''
as $$
begin
  if lower(coalesce(new.email, '')) = public.temporary_admin_email()
     and new.email_confirmed_at is not null then
    update public.profiles set role = 'admin'::public.user_role where id = new.id;
  elsif tg_op = 'UPDATE' then
    -- This temporary grant follows the verified email, including email changes.
    if lower(coalesce(old.email, '')) = public.temporary_admin_email() then
      update public.profiles set role = 'buyer'::public.user_role
        where id = new.id and role = 'admin'::public.user_role;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.assign_temporary_admin() from public, anon, authenticated;

-- Run after on_auth_user_created has inserted the account's profile.
create trigger zz_assign_temporary_admin
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.assign_temporary_admin();

-- Give the already registered, verified account access immediately.
update public.profiles p set role = 'admin'::public.user_role
  from auth.users u
  where p.id = u.id
    and lower(u.email) = public.temporary_admin_email()
    and u.email_confirmed_at is not null;
