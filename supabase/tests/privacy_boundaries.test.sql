begin;
create extension if not exists pgtap with schema extensions;
select extensions.plan(13);

insert into auth.users(id,email) values
 ('ad100000-0000-4000-8000-000000000001','buyer@example.invalid'),
 ('ad100000-0000-4000-8000-000000000002','photographer@example.invalid');
insert into public.photographers(id,user_id) values
 ('ad100000-0000-4000-8000-000000000003','ad100000-0000-4000-8000-000000000002');
insert into public.media(id,photographer_id,title,category,location,price_sats,status,storage_key) values
 ('ad100000-0000-4000-8000-000000000004','ad100000-0000-4000-8000-000000000003','Fixture','nature','Test',1,'approved',
 'ad100000-0000-4000-8000-000000000003/originals/ad100000-0000-4000-8000-000000000005');

set local role anon;
select extensions.is((select count(id) from public.profiles where id='ad100000-0000-4000-8000-000000000001'),0::bigint,'Buyer profile is private');
select extensions.is((select count(id) from public.profiles where id='ad100000-0000-4000-8000-000000000002'),1::bigint,'Photographer directory is visible');
select extensions.ok(public.is_approved_media_object('ad100000-0000-4000-8000-000000000003/previews/ad100000-0000-4000-8000-000000000005.jpg'),'Approved preview can be signed');
select extensions.ok(not public.is_approved_media_object('ad100000-0000-4000-8000-000000000003/originals/ad100000-0000-4000-8000-000000000005'),'Original cannot be signed as a preview');
select extensions.throws_ok($$insert into public.privacy_requests(kind) values ('access')$$,'42501',null,'Anonymous request is denied');

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'ad100000-0000-4000-8000-000000000001';
select extensions.is((select count(id) from public.profiles where id='ad100000-0000-4000-8000-000000000001'),1::bigint,'Buyer can view own profile');
select extensions.is(public.get_my_purchase_key('ad100000-0000-4000-8000-000000000004'),null::text,'Unpaid buyer cannot retrieve the original key');
select extensions.lives_ok($$insert into public.privacy_requests(kind) values ('access')$$,'Own privacy request is accepted');
select extensions.throws_ok($$insert into public.privacy_requests(kind) values ('access')$$,'23505',null,'Duplicate request is not stored');
select extensions.throws_ok($$select * from public.privacy_requests$$,'42501',null,'Clients cannot list privacy requests');
select extensions.throws_ok($$insert into public.privacy_requests(user_id,kind) values ('ad100000-0000-4000-8000-000000000002','deletion')$$,'42501',null,'Caller cannot file on behalf of another user');

reset role;
insert into public.payments(buyer_id,media_id,amount_sats,payment_request,payment_hash,status,paid_at)
values ('ad100000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000004',1,'test-only','privacy-test-hash','paid',now());
set local role authenticated;
select extensions.is(public.get_my_purchase_key('ad100000-0000-4000-8000-000000000004'),'ad100000-0000-4000-8000-000000000003/originals/ad100000-0000-4000-8000-000000000005','Paid buyer can get their download');
select extensions.ok(public.is_purchased_media_object('ad100000-0000-4000-8000-000000000003/originals/ad100000-0000-4000-8000-000000000005'),'Paid buyer can sign the original');
reset role;
select * from extensions.finish();
rollback;
