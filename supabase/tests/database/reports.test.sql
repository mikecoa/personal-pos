-- Phase 4: report numbers and their isolation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-00000000000a', 'ownerA@t.test', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-00000000000c', 'adminA1@t.test', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-00000000000b', 'ownerB@t.test', 'authenticated', 'authenticated');
insert into public.accounts (id, name, owner_id) values
  ('a1000000-0000-0000-0000-000000000000', 'Account A', 'a0000000-0000-0000-0000-00000000000a'),
  ('b1000000-0000-0000-0000-000000000000', 'Account B', 'b0000000-0000-0000-0000-00000000000b');
insert into public.members (account_id, user_id, role) values
  ('a1000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('a1000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000000c', 'admin'),
  ('b1000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000000b', 'owner');
insert into public.locations (id, account_id, name) values
  ('a1100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'A1'),
  ('a1100000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'A2');
insert into public.member_locations (account_id, user_id, location_id) values
  ('a1000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000000c', 'a1100000-0000-0000-0000-000000000001');
insert into public.devices (id, account_id, location_id, name, receipt_prefix, registered_by) values
  ('de000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'T1', 'A1', 'a0000000-0000-0000-0000-00000000000a'),
  ('de000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000002', 'T2', 'B1', 'a0000000-0000-0000-0000-00000000000a');

-- A1: sale 1 (2 coffees 18k with 10% line discount + 1 water 8k, bill disc 2k, tax 10%) at 09:15 WIB, cash
--     sale 2 (1 water 8k) at 14:30 WIB, QRIS; refund of that water the same day
-- A2: sale 3 (1 cake 30k) at 10:00 WIB, cash
insert into public.orders (id, account_id, location_id, device_id, number, status, opened_at, completed_at, sales_type_name, closed_by_name,
  gross, discount_total, subtotal, tax_total, total) values
  ('0d000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000001',
   'A1-1', 'completed', '2026-11-24T02:10:00Z', '2026-11-24T02:15:00Z', 'Dine In', 'Ani', 44000, 5600, 38400, 3840, 42240),
  ('0d000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000001',
   'A1-2', 'completed', '2026-11-24T07:29:00Z', '2026-11-24T07:30:00Z', 'Take Away', 'Budi', 8000, 0, 8000, 0, 8000),
  ('0d000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000002', 'de000000-0000-0000-0000-000000000002',
   'B1-1', 'completed', '2026-11-24T02:59:00Z', '2026-11-24T03:00:00Z', 'Dine In', 'Citra', 30000, 0, 30000, 0, 30000);
insert into public.orders (id, account_id, location_id, device_id, number, status, opened_at, cancelled_at, cancel_reason, closed_by_name, gross, subtotal, total) values
  ('0d000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000001',
   'A1-3', 'cancelled', '2026-11-24T05:00:00Z', '2026-11-24T05:10:00Z', 'Customer left', 'Ani', 18000, 18000, 18000);
insert into public.order_lines (id, account_id, location_id, order_id, sort_order, item_name, variant_name, category_name, unit_price, modifiers, qty, discount, discount_amount, line_total) values
  ('11000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001', 1, 'Kopi', 'Large', 'Minuman', 18000,
   '[{"set":"Suhu","option":"Dingin","price":0}]', 2, '{"name":"Staff","kind":"percent","value":1000}', 3600, 32400),
  ('11000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001', 2, 'Water', '', 'Minuman', 8000, '[]', 1, null, 0, 8000),
  ('11000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000002', 1, 'Water', '', 'Minuman', 8000, '[]', 1, null, 0, 8000),
  ('11000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000002', '0d000000-0000-0000-0000-000000000003', 1, 'Cake', '', 'Kue', 30000, '[]', 1, null, 0, 30000);
insert into public.order_discounts (id, account_id, location_id, order_id, name, kind, value, amount) values
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001', 'Promo 2rb', 'amount', 2000, 2000);
insert into public.payments (id, account_id, location_id, order_id, method_name, kind, amount, paid_at) values
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001', 'Cash', 'cash', 42240, '2026-11-24T02:15:00Z'),
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000002', 'QRIS', 'qr', 8000, '2026-11-24T07:30:00Z'),
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000002', '0d000000-0000-0000-0000-000000000003', 'Cash', 'cash', 30000, '2026-11-24T03:00:00Z');
insert into public.refunds (id, account_id, location_id, device_id, order_id, reason, method_name, kind, amount, refunded_at) values
  ('4f000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000001',
   '0d000000-0000-0000-0000-000000000002', 'Spilled', 'QRIS', 'qr', 8000, '2026-11-24T08:00:00Z');
insert into public.refund_lines (id, account_id, location_id, refund_id, order_line_id, item_name, qty, amount) values
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', '4f000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000003', 'Water', 1, 8000);

create function pg_temp.act_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.rep(p_locs uuid[]) returns jsonb language sql as $$
  select public.report_sales(p_locs, '2026-11-23T17:00:00Z', '2026-11-24T17:00:00Z')   -- 24 Nov, WIB day
$$;
set local role authenticated;

-- ── owner, one location ────────────────────────────────────────────────
select pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');
select is(pg_temp.rep(array['a1100000-0000-0000-0000-000000000001'::uuid])->'summary',
  '{"transactions":2,"items":4,"gross":52000,"discounts":5600,"refunds":8000,"net":38400,"gratuity":0,"tax":3840,"rounding":0,"collected":42240,"average":25120,"cogs":0}'::jsonb,
  'A1 summary: gross − discounts − refunds = net; collected = totals − refunds');
select is(pg_temp.rep(array['a1100000-0000-0000-0000-000000000001'::uuid])->'by_hour',
  '[{"hour":9,"transactions":1,"net":38400},{"hour":14,"transactions":1,"net":8000}]'::jsonb, 'hours are in WIB');
select is(pg_temp.rep(array['a1100000-0000-0000-0000-000000000001'::uuid])->'payments',
  '[{"method":"Cash","kind":"cash","count":1,"amount":42240,"refunds":0,"net":42240},{"method":"QRIS","kind":"qr","count":1,"amount":8000,"refunds":8000,"net":0}]'::jsonb,
  'payment methods net of refunds');
select is((pg_temp.rep(array['a1100000-0000-0000-0000-000000000001'::uuid])->'items')->1,
  '{"name":"Water","variant":"","category":"Minuman","qty":2,"gross":16000,"discounts":0,"refunded_qty":1,"refunds":8000,"net":8000}'::jsonb,
  'items include refunded quantities');
select is(pg_temp.rep(array['a1100000-0000-0000-0000-000000000001'::uuid])->'discounts',
  '[{"name":"Staff","count":1,"amount":3600},{"name":"Promo 2rb","count":1,"amount":2000}]'::jsonb, 'line and bill discounts listed by name');
select is(pg_temp.rep(array['a1100000-0000-0000-0000-000000000001'::uuid])->'modifiers',
  '[{"set":"Suhu","option":"Dingin","qty":2,"amount":0}]'::jsonb, 'modifiers counted per unit');

-- ── owner, all locations ───────────────────────────────────────────────
select is((pg_temp.rep(array['a1100000-0000-0000-0000-000000000001'::uuid, 'a1100000-0000-0000-0000-000000000002'::uuid])->'summary'->>'gross')::int,
  82000, 'all-locations roll-up adds A2');
select is(jsonb_array_length(public.report_transactions(array['a1100000-0000-0000-0000-000000000001'::uuid, 'a1100000-0000-0000-0000-000000000002'::uuid],
  '2026-11-23T17:00:00Z', '2026-11-24T17:00:00Z')), 3, 'transactions list has the 3 completed sales');
select is(public.report_transactions(array['a1100000-0000-0000-0000-000000000001'::uuid], '2026-11-23T17:00:00Z', '2026-11-24T17:00:00Z', 'cancelled')#>>'{0,reason}',
  'Customer left', 'cancelled bills with reason');
select is(public.report_transactions(array['a1100000-0000-0000-0000-000000000001'::uuid], '2026-11-23T17:00:00Z', '2026-11-24T17:00:00Z', 'refunds')#>>'{0,items}',
  'Water ×1', 'refunds list');
select is(jsonb_array_length(public.report_transactions(array['a1100000-0000-0000-0000-000000000001'::uuid], '2026-11-23T17:00:00Z', '2026-11-24T17:00:00Z', 'completed', 'A1-2')),
  1, 'search by receipt number');

-- ── admin of A1 asks for both locations: only A1 comes back ────────────
select pg_temp.act_as('c0000000-0000-0000-0000-00000000000c');
select is((pg_temp.rep(array['a1100000-0000-0000-0000-000000000001'::uuid, 'a1100000-0000-0000-0000-000000000002'::uuid])->'summary'->>'gross')::int,
  52000, 'admin cannot see A2 numbers even when asking for them');

-- ── another business ───────────────────────────────────────────────────
select pg_temp.act_as('b0000000-0000-0000-0000-00000000000b');
select is((pg_temp.rep(array['a1100000-0000-0000-0000-000000000001'::uuid])->'summary'->>'transactions')::int, 0, 'other business sees nothing');
select is(jsonb_array_length(public.report_transactions(array['a1100000-0000-0000-0000-000000000001'::uuid], '2026-11-23T17:00:00Z', '2026-11-24T17:00:00Z')),
  0, 'other business gets no transactions');

select * from finish();
rollback;
