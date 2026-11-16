\set ON_ERROR_STOP on
begin;
do $$
declare
  sample_id uuid;
  target_role text;
  target_column text;
begin
  select id into strict sample_id from public.media where is_sample order by id limit 1;
  foreach target_role in array array['anon', 'authenticated'] loop
    if has_column_privilege(target_role, 'public.profiles', 'role', 'select') then
      raise exception 'Profile role became readable by %', target_role;
    end if;
    foreach target_column in array array['id', 'display_name', 'created_at'] loop
      if not has_column_privilege(target_role, 'public.profiles', target_column, 'select') then
        raise exception 'Public profile column missing: %.%', target_role, target_column;
      end if;
    end loop;
    foreach target_column in array array['is_sample', 'photographer_credit', 'source_url', 'license_name', 'license_url'] loop
      if not has_column_privilege(target_role, 'public.media', target_column, 'select')
         or has_column_privilege(target_role, 'public.media', target_column, 'insert')
         or has_column_privilege(target_role, 'public.media', target_column, 'update') then
        raise exception 'Sample column privilege incorrect: %.%', target_role, target_column;
      end if;
    end loop;
  end loop;

  begin
    insert into public.payments (buyer_id, media_id, amount_sats, payment_request, payment_hash)
      values (gen_random_uuid(), sample_id, 1, 'audit-only', 'audit-only');
    raise exception 'Sample payment was accepted';
  exception when check_violation then
    if sqlerrm <> 'Sample images are not for sale' then raise; end if;
  end;
  begin
    update public.media set is_sample = false where id = sample_id;
    raise exception 'Sample flag could be removed';
  exception when check_violation then
    if sqlerrm <> 'The sample flag cannot be changed after creation' then raise; end if;
  end;
  begin
    update public.media set price_sats = 1000 where id = sample_id;
    raise exception 'Sample price could be changed';
  exception when check_violation then null;
  end;
  begin
    update public.media set photographer_credit = null where id = sample_id;
    raise exception 'Sample attribution could be removed';
  exception when check_violation then null;
  end;
  begin
    update public.media set preview_key = storage_key where id = sample_id;
    raise exception 'Sample original could become its preview';
  exception when check_violation then null;
  end;
  begin
    insert into public.media (title, category, location, price_sats, storage_key)
      values ('audit-only', 'audit-only', 'audit-only', 1, 'audit-only');
    raise exception 'Ordinary media accepted without a photographer';
  exception when check_violation then null;
  end;
  raise notice 'PASS: column grants, sample payment rejection, immutable flag, sample constraints, ordinary seller requirement';
end;
$$;
rollback;
