-- Security audit fixes: outsiders can't plant employee slots; view-only backoffice roles can't
-- change things or pull PIN lookups through the tablet RPCs.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-00000000000a', 'owner@t.test', 'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-00000000000b', 'outsider@t.test', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-00000000000c', 'viewer@t.test', 'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-00000000000d', 'tabletadmin@t.test', 'authenticated', 'authenticated');
insert into public.accounts (id, name, owner_id) values ('a1000000-0000-0000-0000-000000000000', 'Account A', 'a0000000-0000-0000-0000-00000000000a');
insert into public.members (account_id, user_id, role) values
  ('a1000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'owner');
insert into public.locations (id, account_id, name) values ('a1100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'A1');
insert into public.roles (id, account_id, name, backoffice_pages, backoffice_write) values
  ('70000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'Viewer', '{dashboard}', '{}'),
  ('70000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'Tablet admin', '{settings_tablets}', '{settings_tablets}');
insert into public.employees (id, account_id, role_id, name, email, user_id) values
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000001', 'Vera', 'viewer@t.test', 'c0000000-0000-0000-0000-00000000000c'),
  ('e1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000002', 'Tono', 'tabletadmin@t.test', 'd0000000-0000-0000-0000-00000000000d');
insert into public.employee_locations (account_id, employee_id, location_id) values
  ('a1000000-0000-0000-0000-000000000000', 'e1000000-0000-0000-0000-000000000001', 'a1100000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000000', 'e1000000-0000-0000-0000-000000000002', 'a1100000-0000-0000-0000-000000000001');
insert into public.devices (id, account_id, location_id, name, receipt_prefix, registered_by) values
  ('de000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'T1', 'A1', 'a0000000-0000-0000-0000-00000000000a');

create function pg_temp.act_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

select is((select role from public.members where user_id = 'c0000000-0000-0000-0000-00000000000c'), 'admin', 'view-only employee is an admin member (setup)');

set local role authenticated;

-- 1. save_employee from someone with no membership in the business
select pg_temp.act_as('b0000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.save_employee(jsonb_build_object('account_id', 'a1000000-0000-0000-0000-000000000000',
  'name', 'Planted', 'email', 'outsider@t.test',
  'role_id', (select id from public.roles where account_id = 'a1000000-0000-0000-0000-000000000000' and name = 'Manager'),
  'location_ids', jsonb_build_array('a1100000-0000-0000-0000-000000000001'))) $$,
  '42501', 'not allowed', 'outsider cannot add an employee slot to another business');
select throws_ok($$ select public.save_employee(jsonb_build_object('id', 'e1000000-0000-0000-0000-000000000001',
  'account_id', 'a1000000-0000-0000-0000-000000000000', 'name', 'Vera', 'email', 'outsider@t.test',
  'role_id', '70000000-0000-0000-0000-000000000001', 'location_ids', jsonb_build_array('a1100000-0000-0000-0000-000000000001'))) $$,
  '42501', 'not allowed', 'outsider cannot take over an existing slot');
select is(public.claim_employee_access(), null, 'outsider has nothing to claim');

select pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.save_employee(jsonb_build_object('account_id', 'a1000000-0000-0000-0000-000000000000',
  'name', 'Kasir', 'role_id', (select id from public.roles where account_id = 'a1000000-0000-0000-0000-000000000000' and name = 'Cashier'),
  'location_ids', jsonb_build_array('a1100000-0000-0000-0000-000000000001'))) $$, 'owner still adds employees');

-- 2. view-only backoffice role vs the tablet RPCs
select pg_temp.act_as('c0000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.register_device('a1100000-0000-0000-0000-000000000001', 'x') $$, '42501', null, 'view-only role cannot register a tablet');
select throws_ok($$ select public.pos_catalog('de000000-0000-0000-0000-000000000001') $$, '42501', null, 'view-only role cannot pull the catalog (PIN lookups)');
select throws_ok($$ select public.pos_save_item('de000000-0000-0000-0000-000000000001', '{}') $$, '42501', null, 'view-only role cannot edit items');
select throws_ok($$ select public.pos_save_category('de000000-0000-0000-0000-000000000001', '{}') $$, '42501', null, 'view-only role cannot edit categories');
select throws_ok($$ select public.pos_save_quick_notes('de000000-0000-0000-0000-000000000001', '[]') $$, '42501', null, 'view-only role cannot replace quick notes');
select throws_ok($$ select public.pos_table_setup('de000000-0000-0000-0000-000000000001', '{}') $$, '42501', null, 'view-only role cannot set up tables');
select throws_ok($$ select public.pos_tables_bulk('de000000-0000-0000-0000-000000000001', '{"op":"delete","ids":[]}') $$, '42501', null, 'view-only role cannot bulk-edit tables');
select throws_ok($$ select public.pos_tables_layout('de000000-0000-0000-0000-000000000001', '{}') $$, '42501', null, 'view-only role cannot move tables');
select throws_ok($$ select public.pos_shift_settings('de000000-0000-0000-0000-000000000001', '{}') $$, '42501', null, 'view-only role cannot change checkout settings');

-- A role that may manage tablets can still register one and sync its catalog.
select pg_temp.act_as('d0000000-0000-0000-0000-00000000000d');
select lives_ok($$ select public.register_device('a1100000-0000-0000-0000-000000000001', 'x') $$, 'tablet manager registers a tablet');
select lives_ok($$ select public.pos_catalog('de000000-0000-0000-0000-000000000001') $$, 'tablet manager gets the catalog');
select throws_ok($$ select public.pos_save_quick_notes('de000000-0000-0000-0000-000000000001', '[]') $$, '42501', null, '...but not library changes without that page');

-- The owner is unaffected.
select pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.pos_catalog('de000000-0000-0000-0000-000000000001') $$, 'owner gets the catalog');
select lives_ok($$ select public.pos_save_quick_notes('de000000-0000-0000-0000-000000000001', '[]') $$, 'owner saves quick notes from a tablet');

select * from finish();
rollback;
