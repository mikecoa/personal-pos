-- Table management: set-up permissions, seating and moving bills, safety on deleted tables.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

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
  ('de000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'T1', 'A1', 'a0000000-0000-0000-0000-00000000000a'),
  ('de000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'T2', 'A2', 'a0000000-0000-0000-0000-00000000000a');
insert into public.table_areas (id, account_id, location_id, name) values
  ('a7000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'Indoor');
insert into public.dining_tables (id, account_id, location_id, area_id, name, seats) values
  ('7b000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001', '1', 4),
  ('7b000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000001', '2', 2),
  ('7b000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000002', null, 'A2-T', 2);
insert into public.dining_tables (account_id, location_id, name, is_active) values
  ('a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'Closed', false);

create function pg_temp.act_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.bill(p_version int, p_table text, p_table_name text, p_guests int default 3) returns jsonb language sql as $$
  select jsonb_build_object('id', '0d000000-0000-0000-0000-000000000001', 'number', 'A1-000001', 'status', 'open', 'version', p_version,
    'opened_at', '2026-11-26T05:00:00Z', 'bill_name', p_table_name, 'table_id', p_table, 'table_name', p_table_name, 'guests', p_guests,
    'customer_name', 'Pak Budi', 'total', 18000, 'lines', '[]'::jsonb);
$$;
-- Bills are checked as stored (report pages read them; a staff login has no report page).
create function pg_temp.orders_as_admin() returns setof public.orders language sql security definer as $$ select * from public.orders where location_id = 'a1100000-0000-0000-0000-000000000001' $$;
grant execute on function pg_temp.orders_as_admin() to authenticated;
set local role authenticated;

-- ── set-up permissions ─────────────────────────────────────────────────
select pg_temp.act_as('c0000000-0000-0000-0000-00000000000c');
select throws_ok($$ insert into public.dining_tables (account_id, location_id, name) values
  ('a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'Staff table') $$, '42501', null, 'staff cannot add tables');
select results_eq($$ select name from public.dining_tables order by name $$, array['1', '2', 'Closed'], 'staff sees only their location''s tables');

-- ── seating and moving ─────────────────────────────────────────────────
select is(public.upsert_order('de000000-0000-0000-0000-000000000001', pg_temp.bill(1, '7b000000-0000-0000-0000-000000000001', '1'))->>'status', 'saved', 'seat a bill at table 1');
select is((select table_id::text || '/' || table_name || '/' || guests || '/' || customer_name from pg_temp.orders_as_admin()), '7b000000-0000-0000-0000-000000000001/1/3/Pak Budi',
  'bill stores table, guests and customer');
select is(public.pos_open_orders('de000000-0000-0000-0000-000000000002')#>>'{0,table_name}', '1', 'the other tablet sees the bill at table 1');

select is(public.upsert_order('de000000-0000-0000-0000-000000000002', pg_temp.bill(2, '7b000000-0000-0000-0000-000000000002', '2', 4))->>'status', 'saved', 'tablet 2 moves the bill to table 2');
select is((select table_name || '/' || guests from pg_temp.orders_as_admin()), '2/4', 'bill is now on table 2 with 4 guests');
select is(public.upsert_order('de000000-0000-0000-0000-000000000001', pg_temp.bill(2, '7b000000-0000-0000-0000-000000000001', '1'))->>'status', 'stale',
  'tablet 1''s late move loses to the newer version');

select pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');
select is(public.upsert_order('de000000-0000-0000-0000-000000000001', pg_temp.bill(3, '7b000000-0000-0000-0000-000000000009', 'A2-T'))->>'status', 'saved',
  'a table id from another location does not block the upload');
select is((select coalesce(table_id::text, 'none') from public.orders), 'none', '…but the bill is not linked to the other location''s table');

-- ── deleting a table with a bill on it ─────────────────────────────────
select lives_ok($$ select public.upsert_order('de000000-0000-0000-0000-000000000001', pg_temp.bill(4, '7b000000-0000-0000-0000-000000000002', '2')) $$, 'back on table 2');
delete from public.dining_tables where id = '7b000000-0000-0000-0000-000000000002';
select is((select coalesce(table_id::text, 'none') || '/' || table_name from public.orders), 'none/2', 'deleting the table keeps the bill and its table name');

-- ── editing from the tablet (pos_table_setup) ─────────────────────────
select pg_temp.act_as('c0000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.pos_table_setup('de000000-0000-0000-0000-000000000001', '{"kind":"area","name":"Teras"}') $$, '42501', null,
  'staff sign-in cannot edit tables from a tablet');
select pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');
select is(jsonb_array_length(public.pos_table_setup('de000000-0000-0000-0000-000000000001', '{"kind":"area","name":"Teras"}')->'table_areas'), 2,
  'add an area, get the new floor plan back');
select throws_ok($$ select public.pos_table_setup('de000000-0000-0000-0000-000000000001', '{"kind":"area","name":"teras"}') $$, '23505', null,
  'area names are unique (ignoring case)');
select lives_ok($$ select public.pos_table_setup('de000000-0000-0000-0000-000000000001',
  jsonb_build_object('kind','table','name','T1','seats',2,'shape','round','area_id',(select id from public.table_areas where name = 'Teras'))) $$, 'add a table to the area');
select throws_ok($$ select public.pos_table_setup('de000000-0000-0000-0000-000000000001',
  '{"kind":"table","name":"T2","seats":2,"area_id":"a7000000-0000-0000-0000-000000000099"}') $$, 'P0002', null, 'unknown area is refused');
select lives_ok($$ select public.pos_table_setup('de000000-0000-0000-0000-000000000001',
  '{"kind":"table","op":"save","id":"7b000000-0000-0000-0000-000000000001","name":"1A","seats":6,"area_id":null}') $$, 'rename and resize table 1');
select is((select name || '/' || seats || '/' || coalesce(area_id::text, 'none') from public.dining_tables where id = '7b000000-0000-0000-0000-000000000001'), '1A/6/none', 'table 1 updated');
select is(public.pos_table_setup('de000000-0000-0000-0000-000000000001', '{"kind":"table","op":"delete","id":"7b000000-0000-0000-0000-000000000009"}')->'tables' @> '[{"name":"A2-T"}]', false,
  'another location''s table can''t be deleted or seen (no error, nothing happens)');
select is((select count(*)::int from public.dining_tables where id = '7b000000-0000-0000-0000-000000000009'), 1, '…and it still exists');

-- ── multi-select (pos_tables_bulk) ────────────────────────────────────
select lives_ok($$ select public.pos_table_setup('de000000-0000-0000-0000-000000000001', '{"kind":"table","name":"T2","seats":2}') $$, 'add T2');
select lives_ok($$ select public.pos_tables_bulk('de000000-0000-0000-0000-000000000001', jsonb_build_object('op','update',
  'ids', (select jsonb_agg(id) from public.dining_tables where name in ('T1','T2','A2-T')), 'seats', 8,
  'set_area', true, 'area_id', (select id from public.table_areas where name = 'Indoor'))) $$, 'move T1, T2 to Indoor with 8 seats');
select is((select string_agg(t.name || ':' || t.seats || ':' || coalesce(a.name, '-'), ',' order by t.name) from public.dining_tables t left join public.table_areas a on a.id = t.area_id
  where t.name in ('T1','T2','A2-T')), 'A2-T:2:-,T1:8:Indoor,T2:8:Indoor', 'both updated; the other location''s table untouched');
select public.upsert_order('de000000-0000-0000-0000-000000000001', pg_temp.bill(5, (select id::text from public.dining_tables where name = 'T1'), 'T1'));
select throws_ok($$ select public.pos_tables_bulk('de000000-0000-0000-0000-000000000001', jsonb_build_object('op','delete',
  'ids', (select jsonb_agg(id) from public.dining_tables where name in ('T1','T2')))) $$, '55006', 'Open bill on T1. Move or close it first.',
  'deleting a selection with a busy table is refused');
select is((select count(*)::int from public.dining_tables where name in ('T1','T2')), 2, '…and nothing was deleted');

-- ── floor map (pos_tables_layout) ─────────────────────────────────────
select is(public.pos_tables_layout('de000000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('id', (select id from public.dining_tables where name = 'T1'), 'x', 2, 'y', 1),
  jsonb_build_object('id', '7b000000-0000-0000-0000-000000000009', 'x', 5, 'y', 5)))->'tables' @> '[{"name":"T1","pos_x":2,"pos_y":1}]', true,
  'place T1 on the board; the new plan comes back');
select is((select coalesce(pos_x::text, 'none') from public.dining_tables where id = '7b000000-0000-0000-0000-000000000009'), 'none',
  'another location''s table is not moved');
select is(public.pos_catalog('de000000-0000-0000-0000-000000000001')->'tables' @> '[{"name":"T1","pos_x":2,"pos_y":1}]', true, 'the catalog carries positions');
select lives_ok($$ select public.pos_tables_bulk('de000000-0000-0000-0000-000000000001', jsonb_build_object('op','update',
  'ids', (select jsonb_agg(id) from public.dining_tables where name = 'T1'), 'set_area', true, 'area_id', (select id from public.table_areas where name = 'Teras'))) $$,
  'move T1 to another area');
select is((select coalesce(pos_x::text, 'none') from public.dining_tables where name = 'T1'), 'none', 'changing area clears the board position');

select * from finish();
rollback;
