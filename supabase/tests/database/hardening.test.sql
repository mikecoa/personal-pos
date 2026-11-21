-- Phase 5: refund-before-sale ordering, device heartbeat and revocation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-00000000000a', 'ownerA@t.test', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-00000000000c', 'staffA1@t.test', 'authenticated', 'authenticated');
insert into public.accounts (id, name, owner_id) values ('a1000000-0000-0000-0000-000000000000', 'Account A', 'a0000000-0000-0000-0000-00000000000a');
insert into public.members (account_id, user_id, role) values
  ('a1000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('a1000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000000c', 'staff');
insert into public.locations (id, account_id, name) values ('a1100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'A1');
insert into public.member_locations (account_id, user_id, location_id) values
  ('a1000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000000c', 'a1100000-0000-0000-0000-000000000001');
insert into public.devices (id, account_id, location_id, name, receipt_prefix, registered_by) values
  ('de000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'T1', 'A1', 'a0000000-0000-0000-0000-00000000000a');

create function pg_temp.act_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;
select pg_temp.act_as('c0000000-0000-0000-0000-00000000000c');

select throws_ok($$ select public.submit_refund('de000000-0000-0000-0000-000000000001', jsonb_build_object('id', gen_random_uuid(),
  'order_id', gen_random_uuid(), 'reason', 'x', 'method_name', 'Cash', 'kind', 'cash', 'amount', 1, 'refunded_at', now())) $$,
  '23503', 'sale not uploaded yet', 'refund before its sale is "missing parent", not a permission error');

select lives_ok($$ select public.device_heartbeat('de000000-0000-0000-0000-000000000001', '{"app_version":"1.0.0","pending":3,"rejected":1,"error":"boom","ok":false}') $$,
  'staff tablet can report its health');
select results_eq($$ select app_version || '/' || pending_count || '/' || rejected_count || '/' || last_error from public.devices $$,
  array['1.0.0/3/1/boom'], 'heartbeat stored');
select throws_ok($$ select public.revoke_device('de000000-0000-0000-0000-000000000001') $$, '42501', null, 'staff cannot revoke tablets');

select pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.revoke_device('de000000-0000-0000-0000-000000000001') $$, 'owner revokes the tablet');
select throws_ok($$ select public.pos_catalog('de000000-0000-0000-0000-000000000001') $$, '42501', 'device not registered or not allowed', 'revoked tablet gets no catalog (no PIN hashes)');
select throws_ok($$ select public.upsert_order('de000000-0000-0000-0000-000000000001', jsonb_build_object('id', gen_random_uuid(), 'number', 'A1-9', 'status', 'open', 'opened_at', now())) $$,
  '42501', 'device not registered or not allowed', 'revoked tablet cannot upload sales');
select throws_ok($$ select public.device_heartbeat('de000000-0000-0000-0000-000000000001', '{}') $$, '42501', null, 'revoked tablet cannot report in');

-- fast PIN lookup
reset role;
insert into public.employees (id, account_id, role_id, name)
  select 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', id, 'Ani' from public.roles where account_id = 'a1000000-0000-0000-0000-000000000000' and name = 'Cashier';
insert into public.employees (id, account_id, role_id, name)
  select 'e1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', id, 'Budi' from public.roles where account_id = 'a1000000-0000-0000-0000-000000000000' and name = 'Cashier';
set local role authenticated;
select pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.set_employee_pin('e1000000-0000-0000-0000-000000000001', '4321') $$, 'set PIN');
select throws_ok($$ select public.set_employee_pin('e1000000-0000-0000-0000-000000000002', '4321') $$, '23505', null, 'duplicate PIN still rejected');
select throws_ok('select pin_lookup from public.employees', '42501', null, 'pin_lookup is not readable through the API');
reset role;
select is((select pin_lookup from public.employees where id = 'e1000000-0000-0000-0000-000000000001'),
  encode(extensions.digest('a1000000-0000-0000-0000-000000000000:4321', 'sha256'), 'hex'), 'lookup = sha256(account:pin), as the tablet computes it');

select * from finish();
rollback;
