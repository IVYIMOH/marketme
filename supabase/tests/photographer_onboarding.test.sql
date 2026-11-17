begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(18);

insert into auth.users (id, email, raw_user_meta_data) values
  ('fd260001-0000-4000-8000-000000000001', 'onboarding-owner@example.invalid',
   '{"display_name":"Owner","role":"admin","app_role":"admin"}'::jsonb),
  ('fd260001-0000-4000-8000-000000000002', 'onboarding-other@example.invalid',
   '{"display_name":"Other"}'::jsonb);
insert into public.photographers (user_id, company) values
  ('fd260001-0000-4000-8000-000000000002', 'Other private company');

select extensions.is(
  (select role::text from public.profiles where id = 'fd260001-0000-4000-8000-000000000001'),
  'buyer', 'User metadata does not grant admin');
select extensions.is(
  (select count(*) from public.photographers where user_id = 'fd260001-0000-4000-8000-000000000001'),
  0::bigint, 'User metadata does not provision a photographer');
select extensions.is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'fd260001-0000-4000-8000-000000000001',
    'claims', jsonb_build_object('app_metadata', jsonb_build_object('app_role', 'admin'))
  )) #>> '{claims,app_metadata,app_role}',
  'buyer', 'JWT hook replaces an admin claim with the stored buyer role');

set local role authenticated;
set local request.jwt.claim.sub = 'fd260001-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"fd260001-0000-4000-8000-000000000001","role":"authenticated"}';
select extensions.lives_ok(
  $$select public.complete_photographer_profile('Owner name', 'Owner company')$$,
  'Authenticated owner can complete a profile through RLS');
select extensions.is(
  (select company from public.get_my_photographer_profile()),
  'Owner company', 'Owner can read company through the accessor');
select extensions.is(
  (select user_id from public.get_my_photographer_profile()),
  'fd260001-0000-4000-8000-000000000001'::uuid, 'Accessor returns the current account');
select extensions.throws_ok(
  $$select company from public.photographers$$,
  '42501', null, 'Direct company reads are denied');
select extensions.is(
  (select count(*) from public.get_my_photographer_profile() where user_id = 'fd260001-0000-4000-8000-000000000002'),
  0::bigint, 'Accessor cannot return another account');
select extensions.throws_ok(
  $$insert into public.photographers (user_id, company)
    values ('fd260001-0000-4000-8000-000000000002', 'Spoofed company')$$,
  '42501', null, 'Insert cannot use another account ID');
select extensions.throws_ok(
  $$insert into public.photographers (user_id, company, level)
    values ('fd260001-0000-4000-8000-000000000001', 'Company', 'verified')$$,
  '42501', null, 'Insert cannot grant verification');
select extensions.throws_ok(
  $$update public.photographers set level = 'master'
    where user_id = 'fd260001-0000-4000-8000-000000000001'$$,
  '42501', null, 'Owner cannot change level');
select extensions.throws_ok(
  $$select role from public.profiles$$,
  '42501', null, 'Profile role remains unreadable to clients');
select extensions.lives_ok(
  $$select public.complete_photographer_profile('Updated owner', 'Updated company')$$,
  'Completion can be retried without creating another row');
select extensions.is(
  (select company from public.get_my_photographer_profile()),
  'Updated company', 'Retry updates the company');

reset role;
set local role anon;
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{"role":"anon"}';
select extensions.throws_ok(
  $$select public.complete_photographer_profile('Anon', 'Company')$$,
  '42501', null, 'Anonymous completion is denied');
select extensions.throws_ok(
  $$select * from public.get_my_photographer_profile()$$,
  '42501', null, 'Anonymous private profile lookup is denied');
select extensions.throws_ok(
  $$select company from public.photographers$$,
  '42501', null, 'Anonymous company reads are denied');
select extensions.lives_ok(
  $$select id, user_id, bio, level, verified_at, created_at from public.photographers$$,
  'Previous public directory columns remain readable');

reset role;
select * from extensions.finish();
rollback;
