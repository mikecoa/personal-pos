-- Phase 1: catalog / settings / staff isolation and RPC behaviour.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

-- ── fixtures ───────────────────────────────────────────────────────────
insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-00000000000a', 'ownerA@t.test', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-00000000000b', 'ownerB@t.test', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-00000000000c', 'staffA1@t.test', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-00000000000d', 'adminA2@t.test', 'authenticated', 'authenticated');
insert into public.accounts (id, name, owner_id) values
  ('a1000000-0000-0000-0000-000000000000', 'Account A', 'a0000000-0000-0000-0000-00000000000a'),
  ('b1000000-0000-0000-0000-000000000000', 'Account B', 'b0000000-0000-0000-0000-00000000000b');
insert into public.members (account_id, user_id, role) values
  ('a1000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('a1000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000000c', 'staff'),
  ('a1000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-00000000000d', 'admin'),
  ('b1000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000000b', 'owner');
insert into public.locations (id, account_id, name) values
  ('a1100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'A1'),
  ('a1100000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'A2'),
  ('b1100000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000000', 'B1');
insert into public.member_locations (account_id, user_id, location_id) values
  ('a1000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000000c', 'a1100000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-00000000000d', 'a1100000-0000-0000-0000-000000000002');

-- A1 catalog: category, modifier set, item + variant
insert into public.categories (id, account_id, location_id, name) values
  ('ca000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'Drinks');
insert into public.modifier_sets (id, account_id, location_id, name, min_select, max_select) values
  ('5e000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'Temp', 1, 1);
insert into public.modifier_options (account_id, location_id, modifier_set_id, name) values
  ('a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001', 'Hot'),
  ('a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', '5e000000-0000-0000-0000-000000000001', 'Iced');
insert into public.items (id, account_id, location_id, name) values
  ('1e000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'Tea');
insert into public.item_variants (account_id, location_id, item_id, price) values
  ('a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', '1e000000-0000-0000-0000-000000000001', 8000);
insert into public.employees (id, account_id, role_id, name)
  select 'e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', id, 'Ani'
  from public.roles where account_id = 'a1000000-0000-0000-0000-000000000000' and name = 'Manager';
insert into public.employees (id, account_id, role_id, name)
  select 'e1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', id, 'Budi'
  from public.roles where account_id = 'a1000000-0000-0000-0000-000000000000' and name = 'Cashier';

-- ── defaults from triggers ─────────────────────────────────────────────
select is((select count(*)::int from public.location_settings where location_id = 'a1100000-0000-0000-0000-000000000001'), 1, 'new location gets settings');
select is((select count(*)::int from public.receipt_profiles where location_id = 'a1100000-0000-0000-0000-000000000001'), 1, 'new location gets a receipt profile');
select results_eq($$ select name from public.payment_methods where location_id = 'a1100000-0000-0000-0000-000000000001' order by sort_order $$,
  array['Cash', 'QRIS', 'Card', 'Other'], 'new location gets default payment methods');
select results_eq($$ select name from public.sales_types where location_id = 'a1100000-0000-0000-0000-000000000001' order by sort_order $$,
  array['Dine In', 'Take Away'], 'new location gets default sales types');
select results_eq($$ select name from public.roles where account_id = 'a1000000-0000-0000-0000-000000000000' order by name $$,
  array['Cashier', 'Manager'], 'new account gets default roles');

-- ── structural guards: children cannot cross locations ────────────────
select throws_ok($$ insert into public.item_variants (account_id, location_id, item_id, name, price)
  values ('a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000002', '1e000000-0000-0000-0000-000000000001', 'Cross', 1) $$,
  '23503', null, 'variant cannot attach to an item of another location');
select throws_ok($$ insert into public.item_modifier_sets (account_id, location_id, item_id, modifier_set_id)
  select 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', '1e000000-0000-0000-0000-000000000001', id
  from public.sales_types where location_id = 'a1100000-0000-0000-0000-000000000002' limit 1 $$,
  '23503', null, 'item cannot link a modifier set id from another location');
select throws_ok($$ insert into public.variant_sales_type_prices (account_id, location_id, variant_id, sales_type_id, price)
  select 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', v.id, st.id, 1
  from public.item_variants v, public.sales_types st
  where v.item_id = '1e000000-0000-0000-0000-000000000001' and st.location_id = 'a1100000-0000-0000-0000-000000000002' limit 1 $$,
  '23503', null, 'price override cannot use a sales type of another location');

create function pg_temp.act_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- ── owner A ────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');

create temp table t_ids (k text primary key, v uuid) on commit drop;
grant all on t_ids to authenticated;
insert into t_ids select 'item', public.save_item(jsonb_build_object(
  'location_id', 'a1100000-0000-0000-0000-000000000001', 'name', 'Kopi', 'category_id', 'ca000000-0000-0000-0000-000000000001',
  'variants', jsonb_build_array(jsonb_build_object('name', 'Regular', 'price', 18000), jsonb_build_object('name', 'Large', 'price', 23000)),
  'modifier_set_ids', jsonb_build_array('5e000000-0000-0000-0000-000000000001')));
select is((select count(*)::int from public.item_variants where item_id = (select v from t_ids where k = 'item')), 2, 'save_item creates variants');
select is((select count(*)::int from public.item_modifier_sets where item_id = (select v from t_ids where k = 'item')), 1, 'save_item links modifier sets');

-- Drop "Large" and rename "Regular" to "Large" in the same save.
select lives_ok(format($$ select public.save_item(jsonb_build_object(
  'id', %L, 'location_id', 'a1100000-0000-0000-0000-000000000001', 'name', 'Kopi', 'category_id', 'ca000000-0000-0000-0000-000000000001',
  'variants', jsonb_build_array(jsonb_build_object('id', (select id from public.item_variants where item_id = %L and name = 'Regular'), 'name', 'Large', 'price', 20000)),
  'modifier_set_ids', jsonb_build_array('5e000000-0000-0000-0000-000000000001'))) $$,
  (select v from t_ids where k = 'item'), (select v from t_ids where k = 'item')), 'save_item can reuse the name of a removed variant');
select results_eq(format($$ select name || ':' || price from public.item_variants where item_id = %L $$, (select v from t_ids where k = 'item')),
  array['Large:20000'], 'variants replaced as requested');
select throws_ok($$ select public.save_item(jsonb_build_object('location_id', 'a1100000-0000-0000-0000-000000000001', 'name', 'Empty', 'variants', '[]'::jsonb)) $$,
  '22023', null, 'item without a price is rejected');

select throws_ok('select pin_hash from public.employees', '42501', null, 'pin_hash is not readable');
select lives_ok($$ select public.set_employee_pin('e1000000-0000-0000-0000-000000000001', '1234') $$, 'owner sets a PIN');
select is((select has_pin from public.employees where id = 'e1000000-0000-0000-0000-000000000001'), true, 'has_pin reflects the PIN');
select throws_ok($$ select public.set_employee_pin('e1000000-0000-0000-0000-000000000002', '1234') $$, '23505', null, 'PINs are unique per business');
select throws_ok($$ select public.set_employee_pin('e1000000-0000-0000-0000-000000000002', '12a4') $$, '22023', null, 'PIN must be 4 digits');
select throws_ok($$ select public.save_employee(jsonb_build_object('account_id', 'a1000000-0000-0000-0000-000000000000', 'name', 'Citra',
  'role_id', (select id from public.roles where account_id = 'a1000000-0000-0000-0000-000000000000' and name = 'Cashier'),
  'location_ids', jsonb_build_array('a1100000-0000-0000-0000-000000000001'), 'pin', '1234')) $$, '23505', null, 'save_employee rejects a taken PIN');
select is((select count(*)::int from public.employees where name = 'Citra'), 0, 'rejected save_employee leaves no half-created employee');
select throws_ok($$ select public.save_employee(jsonb_build_object('account_id', 'a1000000-0000-0000-0000-000000000000', 'name', 'Dewi',
  'role_id', (select id from public.roles where account_id = 'a1000000-0000-0000-0000-000000000000' and name = 'Cashier'),
  'location_ids', jsonb_build_array('b1100000-0000-0000-0000-000000000001'))) $$, '42501', null, 'cannot assign an employee to another business''s location');

select is(public.copy_items_to_locations(array['1e000000-0000-0000-0000-000000000001'::uuid, (select v from t_ids where k = 'item')],
  array['a1100000-0000-0000-0000-000000000002'::uuid]), 2, 'owner copies two items to A2');
select is(public.copy_items_to_locations(array[(select v from t_ids where k = 'item')], array['a1100000-0000-0000-0000-000000000002'::uuid]), 1, 'copying again updates instead of duplicating');
select results_eq($$ select i.name || '/' || coalesce(c.name, '-') || '/' || (select count(*) from public.item_variants v where v.item_id = i.id)
  || '/' || coalesce((select string_agg(o.name, ',' order by o.name) from public.item_modifier_sets ims join public.modifier_options o on o.modifier_set_id = ims.modifier_set_id where ims.item_id = i.id), '')
  from public.items i left join public.categories c on c.id = i.category_id
  where i.location_id = 'a1100000-0000-0000-0000-000000000002' order by i.name $$,
  array['Kopi/Drinks/1/Hot,Iced', 'Tea/-/1/'], 'copies bring category, variants and modifier options');

-- ── admin of A2 ────────────────────────────────────────────────────────
select pg_temp.act_as('d0000000-0000-0000-0000-00000000000d');
select results_eq('select location_id from public.location_settings', array['a1100000-0000-0000-0000-000000000002'::uuid], 'admin sees only A2 settings');
select throws_ok($$ select public.copy_items_to_locations(array(select id from public.items where location_id = 'a1100000-0000-0000-0000-000000000002'),
  array['a1100000-0000-0000-0000-000000000001'::uuid]) $$, '42501', null, 'admin cannot copy into an unassigned location');
select throws_ok($$ select public.set_employee_pin('e1000000-0000-0000-0000-000000000002', '9999') $$, '42501', null, 'admin cannot set PINs');
select throws_ok($$ insert into public.roles (account_id, name) values ('a1000000-0000-0000-0000-000000000000', 'Boss') $$, '42501', null, 'admin cannot create roles');

-- ── staff of A1 ────────────────────────────────────────────────────────
select pg_temp.act_as('c0000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.save_item(jsonb_build_object('location_id', 'a1100000-0000-0000-0000-000000000001', 'name', 'Staff item',
  'variants', jsonb_build_array(jsonb_build_object('price', 1)))) $$, '42501', null, 'staff cannot save items');

-- ── owner B ────────────────────────────────────────────────────────────
select pg_temp.act_as('b0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.items), 0, 'owner B sees no items of A');
select is(public.copy_items_to_locations(array['1e000000-0000-0000-0000-000000000001'::uuid], array['b1100000-0000-0000-0000-000000000001'::uuid]),
  0, 'owner B cannot copy A items (they are invisible)');

select * from finish();
rollback;
