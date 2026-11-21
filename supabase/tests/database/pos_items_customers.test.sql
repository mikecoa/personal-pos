-- Items, categories and customers managed from a tablet.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-00000000000a', 'ownerA@t.test', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-00000000000c', 'staffA1@t.test', 'authenticated', 'authenticated');
insert into public.accounts (id, name, owner_id) values ('a1000000-0000-0000-0000-000000000000', 'Account A', 'a0000000-0000-0000-0000-00000000000a');
insert into public.members (account_id, user_id, role) values
  ('a1000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'owner'),
  ('a1000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000000c', 'staff');
insert into public.locations (id, account_id, name) values
  ('a1100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'A1'),
  ('a1100000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'A2');
insert into public.member_locations (account_id, user_id, location_id) values
  ('a1000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000000c', 'a1100000-0000-0000-0000-000000000001');
insert into public.devices (id, account_id, location_id, name, receipt_prefix, registered_by) values
  ('de000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'T1', 'A1', 'a0000000-0000-0000-0000-00000000000a');
insert into public.discounts (id, account_id, location_id, name, kind, value, scope) values
  ('d1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'Owner 20%', 'percent', 2000, 'bill'),
  ('d1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000002', 'Other place', 'percent', 1000, 'bill');
insert into public.items (id, account_id, location_id, name) values
  ('17000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000002', 'A2 item');

create function pg_temp.act_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;
\set dev '''de000000-0000-0000-0000-000000000001'''

select pg_temp.act_as('c0000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.pos_save_category('de000000-0000-0000-0000-000000000001', '{"name":"Kopi"}') $$, '42501', null, 'staff sign-in cannot edit the menu');

select pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');
-- categories
select is(public.pos_save_category(:dev, '{"name":"Kopi"}')->'categories'->0->>'name', 'Kopi', 'add a category, catalog comes back');
select throws_ok($$ select public.pos_save_category('de000000-0000-0000-0000-000000000001', '{"name":"kopi"}') $$, '23505', null, 'category names are unique');

-- items
select lives_ok($$ select public.pos_save_item('de000000-0000-0000-0000-000000000001', jsonb_build_object('name', 'Kopi Susu',
  'category_id', (select id from public.categories where name = 'Kopi'),
  'variants', jsonb_build_array(jsonb_build_object('name', 'Panas', 'price', 18000), jsonb_build_object('name', 'Dingin', 'price', 20000)))) $$, 'add an item with two prices');
select is((select string_agg(v.name || ':' || v.price, ',' order by v.sort_order) from public.item_variants v join public.items i on i.id = v.item_id where i.name = 'Kopi Susu'),
  'Panas:18000,Dingin:20000', 'variants saved');
update public.items set description = 'House blend' where name = 'Kopi Susu';
select lives_ok($$ select public.pos_save_item('de000000-0000-0000-0000-000000000001', jsonb_build_object('id', (select id from public.items where name = 'Kopi Susu'),
  'name', 'Kopi Susu Gula Aren', 'category_id', null,
  'variants', (select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'price', price + 2000) order by sort_order) from public.item_variants where item_id = (select id from public.items where name = 'Kopi Susu')))) $$,
  'rename and reprice');
select is((select name || '/' || coalesce(description, '-') || '/' || coalesce(category_id::text, 'none') from public.items where name like 'Kopi Susu%'), 'Kopi Susu Gula Aren/House blend/none',
  'description the tablet does not know is kept');
select throws_ok($$ select public.pos_save_item('de000000-0000-0000-0000-000000000001', '{"name":"Teh","variants":[{"name":"","price":-1}]}') $$, '22023', null, 'negative price refused');
select throws_ok($$ select public.pos_save_item('de000000-0000-0000-0000-000000000001', '{"id":"17000000-0000-0000-0000-000000000009","op":"remove"}') $$, 'P0002', null,
  'cannot touch another location''s item');
select is((public.pos_save_item(:dev, jsonb_build_object('id', (select id from public.items where name like 'Kopi Susu%'), 'op', 'remove'))->'items')::text, '[]',
  'removing takes the item off the tablet menu');
select is((select is_active::text from public.items where name like 'Kopi Susu%'), 'false', '…but keeps it (inactive) for past sales');

-- customers
select is(public.pos_save_customer(:dev, '{"name":"Pak Budi","phone":"0812-3456-7890","discount_id":"d1000000-0000-0000-0000-000000000001"}')#>>'{customer,phone}', '081234567890',
  'add a customer; phone cleaned up');
select throws_ok($$ select public.pos_save_customer('de000000-0000-0000-0000-000000000001', '{"name":"Budi 2","phone":"081234567890"}') $$, '23505', null, 'phone numbers are unique');
select throws_ok($$ select public.pos_save_customer('de000000-0000-0000-0000-000000000001', '{"name":"X","discount_id":"d1000000-0000-0000-0000-000000000002"}') $$, 'P0002', null,
  'another location''s discount is refused');
select is(public.pos_catalog(:dev)#>>'{customers,0,name}', 'Pak Budi', 'the catalog carries customers');

-- bills linked to a customer
select is(public.upsert_order(:dev, jsonb_build_object('id', '0d000000-0000-0000-0000-000000000001', 'number', 'A1-000001', 'status', 'open', 'version', 1,
  'opened_at', '2026-11-30T05:00:00Z', 'customer_id', (select id from public.customers where name = 'Pak Budi'), 'customer_name', 'Pak Budi', 'total', 0, 'lines', '[]'::jsonb))->>'status',
  'saved', 'save a bill for the customer');
select is((select customer_name from public.orders o join public.customers c on c.id = o.customer_id), 'Pak Budi', 'bill linked to the customer');
select public.pos_save_customer(:dev, jsonb_build_object('id', (select id from public.customers where name = 'Pak Budi'), 'op', 'delete'));
select is((select coalesce(customer_id::text, 'none') || '/' || customer_name from public.orders), 'none/Pak Budi', 'deleting the customer keeps the bill and its name');

select * from finish();
rollback;
