-- Phase 3: shift uploads, cash movements, sales linked to shifts, refunds.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-00000000000a', 'ownerA@t.test', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-00000000000b', 'ownerB@t.test', 'authenticated', 'authenticated');
insert into public.accounts (id, name, owner_id) values
  ('a1000000-0000-0000-0000-000000000000', 'Account A', 'a0000000-0000-0000-0000-00000000000a'),
  ('b1000000-0000-0000-0000-000000000000', 'Account B', 'b0000000-0000-0000-0000-00000000000b');
insert into public.members (account_id, user_id, role) values
  ('a1000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('b1000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000000b', 'owner');
insert into public.locations (id, account_id, name) values
  ('a1100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'A1'),
  ('a1100000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'A2'),
  ('b1100000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000000', 'B1');
insert into public.devices (id, account_id, location_id, name, receipt_prefix, registered_by) values
  ('de000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'T1', 'A1', 'a0000000-0000-0000-0000-00000000000a'),
  ('de000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000002', 'T2', 'A1', 'a0000000-0000-0000-0000-00000000000a'),
  ('de000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000000', 'b1100000-0000-0000-0000-000000000001', 'TB', 'A1', 'b0000000-0000-0000-0000-00000000000b');
insert into public.items (id, account_id, location_id, name, track_stock, stock) values
  ('1e000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'Water', true, 10);

create function pg_temp.act_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.shift(p_id text, p_version int, p_status text, p_moves jsonb default '[]') returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'status', p_status, 'version', p_version, 'opened_at', '2026-11-23T06:00:00Z', 'starting_cash', 500000,
    'closed_at', case when p_status = 'closed' then '2026-11-23T14:00:00Z' end, 'actual_cash', case when p_status = 'closed' then 540000 end,
    'expected_cash', case when p_status = 'closed' then 541000 end, 'movements', p_moves);
$$;
create function pg_temp.refund(p_id text, p_qty int, p_amount int) returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'order_id', '0d000000-0000-0000-0000-000000000001', 'shift_id', '5f000000-0000-0000-0000-000000000001',
    'reason', 'Spilled', 'method_name', 'Cash', 'kind', 'cash', 'amount', p_amount, 'restock', true, 'refunded_at', '2026-11-23T10:00:00Z',
    'lines', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'order_line_id', '11000000-0000-0000-0000-000000000001',
      'item_id', '1e000000-0000-0000-0000-000000000001', 'item_name', 'Water', 'qty', p_qty, 'amount', p_amount)));
$$;

set local role authenticated;
select pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');

-- ── shifts ─────────────────────────────────────────────────────────────
select is(public.upsert_shift('de000000-0000-0000-0000-000000000001', pg_temp.shift('5f000000-0000-0000-0000-000000000001', 1, 'open'))->>'status', 'saved', 'open shift uploads');
select throws_ok($$ select public.upsert_shift('de000000-0000-0000-0000-000000000001', pg_temp.shift('5f000000-0000-0000-0000-000000000002', 1, 'open')) $$,
  '23505', null, 'a tablet cannot have two open shifts');
select is(public.upsert_shift('de000000-0000-0000-0000-000000000001', pg_temp.shift('5f000000-0000-0000-0000-000000000001', 2, 'open',
  '[{"id":"3c000000-0000-0000-0000-000000000001","kind":"out","amount":20000,"description":"Beli es batu","moved_at":"2026-11-23T08:00:00Z"}]'))->>'status',
  'saved', 'cash movement uploads with the shift');

-- a sale in this shift
select is(public.upsert_order('de000000-0000-0000-0000-000000000001', jsonb_build_object('id', '0d000000-0000-0000-0000-000000000001',
  'number', 'A1-000001', 'status', 'completed', 'version', 1, 'shift_id', '5f000000-0000-0000-0000-000000000001',
  'opened_at', '2026-11-23T09:00:00Z', 'completed_at', '2026-11-23T09:01:00Z', 'total', 24000, 'paid', 24000,
  'lines', jsonb_build_array(jsonb_build_object('id', '11000000-0000-0000-0000-000000000001', 'item_id', '1e000000-0000-0000-0000-000000000001',
    'item_name', 'Water', 'unit_price', 8000, 'qty', 3, 'line_total', 24000)),
  'payments', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'method_name', 'Cash', 'kind', 'cash', 'amount', 24000, 'paid_at', '2026-11-23T09:01:00Z'))))->>'status',
  'saved', 'sale with shift_id uploads');
select is((select shift_id from public.orders where id = '0d000000-0000-0000-0000-000000000001'), '5f000000-0000-0000-0000-000000000001'::uuid, 'sale is linked to the shift');
select is((select stock from public.items where id = '1e000000-0000-0000-0000-000000000001'), 7, 'sale deducted stock');

-- ── refunds ────────────────────────────────────────────────────────────
select is(public.submit_refund('de000000-0000-0000-0000-000000000001', pg_temp.refund('4f000000-0000-0000-0000-000000000001', 1, 8000))->>'status', 'saved', 'refund of 1 item saved');
select is(public.submit_refund('de000000-0000-0000-0000-000000000001', pg_temp.refund('4f000000-0000-0000-0000-000000000001', 1, 8000))->>'status', 'saved', 'repeated upload is a no-op');
select is((select count(*)::int from public.refunds), 1, 'refund stored once');
select is((select stock from public.items where id = '1e000000-0000-0000-0000-000000000001'), 8, 'refund restocked once');
select throws_ok($$ select public.submit_refund('de000000-0000-0000-0000-000000000001', pg_temp.refund('4f000000-0000-0000-0000-000000000002', 3, 8000)) $$,
  '22023', 'refund quantity exceeds what was sold', 'cannot refund more items than were sold');
select throws_ok($$ select public.submit_refund('de000000-0000-0000-0000-000000000001', pg_temp.refund('4f000000-0000-0000-0000-000000000003', 2, 30000)) $$,
  '22023', 'refund exceeds what was paid', 'cannot refund more money than was paid');
select lives_ok($$ select public.submit_refund('de000000-0000-0000-0000-000000000001', pg_temp.refund('4f000000-0000-0000-0000-000000000004', 2, 16000)) $$,
  'refunding the rest is allowed');
select throws_ok($$ select public.submit_refund('de000000-0000-0000-0000-000000000002', pg_temp.refund('4f000000-0000-0000-0000-000000000005', 1, 1)) $$,
  '42501', null, 'a tablet of another location cannot refund this sale');

-- ── closing ────────────────────────────────────────────────────────────
select is(public.upsert_shift('de000000-0000-0000-0000-000000000001', pg_temp.shift('5f000000-0000-0000-0000-000000000001', 3, 'closed',
  '[{"id":"3c000000-0000-0000-0000-000000000001","kind":"out","amount":20000,"description":"Beli es batu","moved_at":"2026-11-23T08:00:00Z"}]'))->>'status',
  'saved', 'closing the shift is saved');
select is((select count(*)::int from public.cash_movements), 1, 'cash movement stored once');
select is(public.upsert_shift('de000000-0000-0000-0000-000000000001', pg_temp.shift('5f000000-0000-0000-0000-000000000001', 9, 'open'))->>'status',
  'closed', 'a closed shift cannot be reopened');
select is(public.upsert_shift('de000000-0000-0000-0000-000000000001', pg_temp.shift('5f000000-0000-0000-0000-000000000002', 1, 'open'))->>'status',
  'saved', 'a new shift can start after closing');
select throws_ok($$ insert into public.shifts (id, account_id, location_id, device_id, status, opened_at, starting_cash)
  values (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000001', 'open', now(), 0) $$,
  '42501', null, 'clients cannot write shifts directly');

select pg_temp.act_as('b0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.shifts), 0, 'another business sees no shifts');

select * from finish();
rollback;
