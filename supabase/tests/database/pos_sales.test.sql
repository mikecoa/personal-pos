-- Phase 2: devices, catalog snapshot, order upload semantics and isolation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-00000000000a', 'ownerA@t.test', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-00000000000b', 'ownerB@t.test', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-00000000000c', 'staffA1@t.test', 'authenticated', 'authenticated');
insert into public.accounts (id, name, owner_id) values
  ('a1000000-0000-0000-0000-000000000000', 'Account A', 'a0000000-0000-0000-0000-00000000000a'),
  ('b1000000-0000-0000-0000-000000000000', 'Account B', 'b0000000-0000-0000-0000-00000000000b');
insert into public.members (account_id, user_id, role) values
  ('a1000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('a1000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000000c', 'staff'),
  ('b1000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000000b', 'owner');
insert into public.locations (id, account_id, name) values
  ('a1100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'A1'),
  ('a1100000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'A2');
insert into public.member_locations (account_id, user_id, location_id) values
  ('a1000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000000c', 'a1100000-0000-0000-0000-000000000001');
insert into public.items (id, account_id, location_id, name, track_stock, stock) values
  ('1e000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'Water', true, 10);
insert into public.item_variants (id, account_id, location_id, item_id, price) values
  ('7a000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', '1e000000-0000-0000-0000-000000000001', 8000);
insert into public.employees (id, account_id, role_id, name, pin_hash)
  select 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', id, 'Ani', extensions.crypt('1234', extensions.gen_salt('bf', 8))
  from public.roles where account_id = 'a1000000-0000-0000-0000-000000000000' and name = 'Cashier';
insert into public.employee_locations (account_id, employee_id, location_id) values
  ('a1000000-0000-0000-0000-000000000000', 'e1000000-0000-0000-0000-000000000001', 'a1100000-0000-0000-0000-000000000001');

create function pg_temp.act_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
-- A minimal order document: one line of Water x qty.
create function pg_temp.doc(p_version int, p_status text, p_qty int, p_number text default 'A1-000001') returns jsonb language sql as $$
  select jsonb_build_object('id', '0d000000-0000-0000-0000-000000000001', 'number', p_number, 'status', p_status, 'version', p_version,
    'opened_at', '2026-11-22T10:00:00Z', 'completed_at', case when p_status = 'completed' then '2026-11-22T10:05:00Z' end,
    'total', 8000 * p_qty, 'subtotal', 8000 * p_qty, 'gross', 8000 * p_qty,
    'lines', jsonb_build_array(jsonb_build_object('id', '11000000-0000-0000-0000-000000000001', 'item_id', '1e000000-0000-0000-0000-000000000001',
      'variant_id', '7a000000-0000-0000-0000-000000000001', 'item_name', 'Water', 'unit_price', 8000, 'qty', p_qty, 'line_total', 8000 * p_qty)),
    'payments', case when p_status = 'completed' then jsonb_build_array(jsonb_build_object('id', '9a000000-0000-0000-0000-000000000001',
      'method_name', 'Cash', 'kind', 'cash', 'amount', 8000 * p_qty, 'tendered', 50000, 'change_due', 50000 - 8000 * p_qty, 'paid_at', '2026-11-22T10:05:00Z')) else '[]'::jsonb end,
    'voids', case when p_version >= 2 then jsonb_build_array(jsonb_build_object('id', '5d000000-0000-0000-0000-000000000001',
      'item_name', 'Water', 'qty', 1, 'amount', 8000, 'reason', 'Customer changed mind', 'voided_at', '2026-11-22T10:02:00Z')) else '[]'::jsonb end);
$$;
create temp table t (k text primary key, v uuid) on commit drop;
grant all on t to authenticated;

set local role authenticated;

-- ── device registration ────────────────────────────────────────────────
select pg_temp.act_as('c0000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.register_device('a1100000-0000-0000-0000-000000000001', 'Kasir') $$, '42501', null, 'staff cannot register a device');

select pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');
insert into t select 'dev1', (public.register_device('a1100000-0000-0000-0000-000000000001', 'Front tablet')).id;
insert into t select 'dev2', (public.register_device('a1100000-0000-0000-0000-000000000001', 'Back tablet')).id;
insert into t select 'devA2', (public.register_device('a1100000-0000-0000-0000-000000000002', 'A2 tablet')).id;
select results_eq($$ select receipt_prefix from public.devices where location_id = 'a1100000-0000-0000-0000-000000000001' order by created_at, receipt_prefix $$,
  array['A1', 'A2'], 'devices get distinct receipt prefixes per location');

-- ── catalog snapshot ───────────────────────────────────────────────────
select is(jsonb_array_length(public.pos_catalog((select v from t where k = 'dev1'))->'items'), 1, 'catalog has the location''s items');
select is(public.pos_catalog((select v from t where k = 'dev1'))#>>'{employees,0,name}', 'Ani', 'catalog includes employees assigned here');
select ok(extensions.crypt('1234', public.pos_catalog((select v from t where k = 'dev1'))#>>'{employees,0,pin_hash}')
  = public.pos_catalog((select v from t where k = 'dev1'))#>>'{employees,0,pin_hash}', 'PIN hash verifies offline');
select is(jsonb_array_length(public.pos_catalog((select v from t where k = 'devA2'))->'items'), 0, 'A2 catalog has none of A1''s items');

-- ── order upload ───────────────────────────────────────────────────────
select is(public.upsert_order((select v from t where k = 'dev1'), pg_temp.doc(1, 'open', 2))->>'status', 'saved', 'new open bill is saved');
select is(public.upsert_order((select v from t where k = 'dev1'), pg_temp.doc(1, 'open', 5))->>'status', 'stale', 'same version again is stale');
select is((select qty from public.order_lines where order_id = '0d000000-0000-0000-0000-000000000001'), 2, 'stale upload did not change lines');
select is(jsonb_array_length(public.pos_open_orders((select v from t where k = 'dev2'))), 1, 'another tablet sees the open bill');

select is(public.upsert_order((select v from t where k = 'dev2'), pg_temp.doc(2, 'open', 3))->>'status', 'saved', 'newer version from another tablet wins');
select is((select device_id from public.orders where id = '0d000000-0000-0000-0000-000000000001'), (select v from t where k = 'dev1'), 'order keeps its original device');
select is(public.upsert_order((select v from t where k = 'dev1'), pg_temp.doc(3, 'completed', 3))->>'status', 'saved', 'completing the bill is saved');
select is((select stock from public.items where id = '1e000000-0000-0000-0000-000000000001'), 7, 'stock deducted on completion');
select is(public.upsert_order((select v from t where k = 'dev1'), pg_temp.doc(9, 'open', 1))->>'status', 'closed', 'a completed sale cannot be reopened or changed');
select is(public.upsert_order((select v from t where k = 'dev1'), pg_temp.doc(9, 'completed', 3))->>'status', 'closed', 're-uploading a completed sale is a no-op');
select is((select stock from public.items where id = '1e000000-0000-0000-0000-000000000001'), 7, 'stock not deducted twice');
select is((select count(*)::int from public.order_voids where order_id = '0d000000-0000-0000-0000-000000000001'), 1, 'void recorded once despite repeated uploads');
select is(jsonb_array_length(public.pos_open_orders((select v from t where k = 'dev2'))), 0, 'completed bill leaves the open list');

select throws_ok($$ select public.upsert_order((select v from t where k = 'devA2'), pg_temp.doc(10, 'open', 1)) $$, '42501', null,
  'a device of another location cannot touch the order');
select throws_ok($$ insert into public.orders (id, account_id, location_id, device_id, number, status, opened_at) values
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', (select v from t where k = 'dev1'), 'X', 'open', now()) $$,
  '42501', null, 'clients cannot write orders directly');

select pg_temp.act_as('b0000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.upsert_order((select v from t where k = 'dev1'), pg_temp.doc(20, 'open', 1, 'B-1')) $$, '42501', null,
  'another business cannot use this device');

select * from finish();
rollback;
