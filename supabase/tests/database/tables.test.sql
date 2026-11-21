-- Table management: set-up permissions, seating and moving bills, safety on deleted tables.
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
set local role authenticated;

-- ── set-up permissions ─────────────────────────────────────────────────
select pg_temp.act_as('c0000000-0000-0000-0000-00000000000c');
select throws_ok($$ insert into public.dining_tables (account_id, location_id, name) values
  ('a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'Staff table') $$, '42501', null, 'staff cannot add tables');
select results_eq($$ select name from public.dining_tables order by name $$, array['1', '2', 'Closed'], 'staff sees only their location''s tables');

-- ── seating and moving ─────────────────────────────────────────────────
select is(public.upsert_order('de000000-0000-0000-0000-000000000001', pg_temp.bill(1, '7b000000-0000-0000-0000-000000000001', '1'))->>'status', 'saved', 'seat a bill at table 1');
select is((select table_id::text || '/' || table_name || '/' || guests || '/' || customer_name from public.orders), '7b000000-0000-0000-0000-000000000001/1/3/Pak Budi',
  'bill stores table, guests and customer');
select is(public.pos_open_orders('de000000-0000-0000-0000-000000000002')#>>'{0,table_name}', '1', 'the other tablet sees the bill at table 1');

select is(public.upsert_order('de000000-0000-0000-0000-000000000002', pg_temp.bill(2, '7b000000-0000-0000-0000-000000000002', '2', 4))->>'status', 'saved', 'tablet 2 moves the bill to table 2');
select is((select table_name || '/' || guests from public.orders), '2/4', 'bill is now on table 2 with 4 guests');
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

select * from finish();
rollback;
