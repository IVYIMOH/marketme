begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(20);

select extensions.is(public.temporary_admin_email(), 'ivyimoh@gmail.com', 'The requested temporary admin email is configured');

-- Override the address only in this transaction to avoid touching the real account.
create or replace function public.temporary_admin_email()
  returns text language sql immutable set search_path = ''
as $$ select 'admin-allowlist-fixture@local.test'::text $$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('fd280001-0000-4000-8000-000000000001', 'admin-other-fixture@local.test', now(),
   '{"display_name":"Other","role":"admin","app_role":"admin"}'::jsonb),
  ('fd280001-0000-4000-8000-000000000002', 'ADMIN-ALLOWLIST-FIXTURE@local.test', null,
   '{"display_name":"Temporary admin"}'::jsonb);

select extensions.is(
  (select role::text from public.profiles where id = 'fd280001-0000-4000-8000-000000000001'),
  'buyer', 'Other addresses cannot claim admin through user metadata');
select extensions.is(
  (select role::text from public.profiles where id = 'fd280001-0000-4000-8000-000000000002'),
  'buyer', 'The allowlisted address must be verified first');
select extensions.is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'fd280001-0000-4000-8000-000000000002',
    'claims', jsonb_build_object('app_metadata', jsonb_build_object('app_role', 'admin'))
  )) #>> '{claims,app_metadata,app_role}',
  'buyer', 'An unverified account cannot receive an admin claim');

update auth.users set email_confirmed_at = now() where id = 'fd280001-0000-4000-8000-000000000002';
select extensions.is(
  (select role::text from public.profiles where id = 'fd280001-0000-4000-8000-000000000002'),
  'admin', 'Email verification promotes the allowlisted address regardless of casing');
select extensions.is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'fd280001-0000-4000-8000-000000000002',
    'claims', jsonb_build_object('app_metadata', '{}'::jsonb)
  )) #>> '{claims,app_metadata,app_role}',
  'admin', 'The existing token hook issues the admin role');

insert into public.photographers (id, user_id, company) values
  ('fd280001-0000-4000-8000-000000000010', 'fd280001-0000-4000-8000-000000000001', 'Temporary test studio');
insert into public.media (id, photographer_id, title, category, location, price_sats, storage_key, preview_key, mime_type) values
  ('fd280001-0000-4000-8000-000000000011', 'fd280001-0000-4000-8000-000000000010', 'Approval fixture', 'Wildlife', 'Test location', 100, 'admin-test/original-1.jpg', 'admin-test/preview-1.jpg', 'image/jpeg'),
  ('fd280001-0000-4000-8000-000000000012', 'fd280001-0000-4000-8000-000000000010', 'Rejection fixture', 'Wildlife', 'Test location', 100, 'admin-test/original-2.jpg', 'admin-test/preview-2.jpg', 'image/jpeg');

set local role authenticated;
set local request.jwt.claim.sub = 'fd280001-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"fd280001-0000-4000-8000-000000000002","role":"authenticated"}';
select extensions.ok(public.is_admin(), 'The backend recognises the verified account as admin');
select extensions.lives_ok($$select * from public.get_moderation_queue()$$, 'The admin can read pending submissions');
select extensions.is(
  (public.approve_media('fd280001-0000-4000-8000-000000000011')).status::text,
  'approved', 'The admin can approve a submission');
select extensions.is(
  (public.reject_media('fd280001-0000-4000-8000-000000000012', 'Test rejection')).status::text,
  'rejected', 'The admin can reject a submission');
select extensions.is(
  (public.reject_media('fd280001-0000-4000-8000-000000000012', 'Test rejection')).reject_reason,
  'Test rejection', 'Rejection records the reason');

set local request.jwt.claim.sub = 'fd280001-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"fd280001-0000-4000-8000-000000000001","role":"authenticated","app_metadata":{"app_role":"admin"}}';
select extensions.throws_ok($$select * from public.get_moderation_queue()$$, '42501', null, 'Another account cannot read the queue even with a spoofed claim');
select extensions.throws_ok($$select public.approve_media('fd280001-0000-4000-8000-000000000011')$$, '42501', null, 'Another account cannot approve work');
select extensions.throws_ok($$select public.reject_media('fd280001-0000-4000-8000-000000000012', 'Spoofed')$$, '42501', null, 'Another account cannot reject work');
select extensions.throws_ok($$update public.profiles set role = 'admin' where id = 'fd280001-0000-4000-8000-000000000001'$$, '42501', null, 'Clients still cannot promote their own account');
select extensions.throws_ok($$select public.temporary_admin_email()$$, '42501', null, 'Clients cannot invoke the temporary bootstrap configuration');

reset role;
update auth.users set email = 'admin-former-fixture@local.test' where id = 'fd280001-0000-4000-8000-000000000002';
select extensions.is(
  (select role::text from public.profiles where id = 'fd280001-0000-4000-8000-000000000002'),
  'buyer', 'Changing away from the allowlisted address removes the temporary grant');
select extensions.is(
  public.custom_access_token_hook(jsonb_build_object(
    'user_id', 'fd280001-0000-4000-8000-000000000002',
    'claims', jsonb_build_object('app_metadata', jsonb_build_object('app_role', 'admin'))
  )) #>> '{claims,app_metadata,app_role}',
  'buyer', 'New tokens no longer carry admin after the address changes');

insert into auth.users (id, email, email_confirmed_at) values
  ('fd280001-0000-4000-8000-000000000003', 'admin-allowlist-fixture@local.test', now());
select extensions.is(
  (select role::text from public.profiles where id = 'fd280001-0000-4000-8000-000000000003'),
  'admin', 'A verified new account is promoted after its profile is created');

set local role anon;
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{"role":"anon"}';
select extensions.throws_ok($$select * from public.get_moderation_queue()$$, '42501', null, 'Anonymous visitors cannot read the moderation queue');
reset role;
select * from extensions.finish();
rollback;
