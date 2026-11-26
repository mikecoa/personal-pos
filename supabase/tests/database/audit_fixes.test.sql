-- Security audit fixes: outsiders can't plant employee slots; view-only backoffice roles can't
-- change things or pull PIN lookups through the tablet RPCs.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

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

-- ── Low fixes ─────────────────────────────────────────────────────────────
reset role;
insert into auth.users (id, email, aud, role) values
  ('f0000000-0000-0000-0000-00000000000f', 'manager@t.test', 'authenticated', 'authenticated');
insert into public.roles (id, account_id, name, backoffice_pages, backoffice_write) values
  ('70000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000000', 'Staff manager', '{dashboard,employees}', '{employees}');
insert into public.employees (id, account_id, role_id, name, email, user_id) values
  ('e1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000003', 'Mira', 'manager@t.test', 'f0000000-0000-0000-0000-00000000000f');
insert into public.employee_locations (account_id, employee_id, location_id) values
  ('a1000000-0000-0000-0000-000000000000', 'e1000000-0000-0000-0000-000000000003', 'a1100000-0000-0000-0000-000000000001');
insert into public.orders (id, account_id, location_id, device_id, number, status, opened_at, completed_at, gross, subtotal, total) values
  ('0d000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'de000000-0000-0000-0000-000000000001',
   'A1-1', 'completed', now() - interval '1 hour', now() - interval '1 hour', 20000, 20000, 20000);
insert into public.order_lines (id, account_id, location_id, order_id, sort_order, item_name, unit_price, qty, line_total) values
  ('11000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', '0d000000-0000-0000-0000-000000000001', 1, 'Kopi', 20000, 1, 20000);
set local role authenticated;

-- View access: Tono's role (POS tablets only) sees no sales and only his own slot.
select pg_temp.act_as('d0000000-0000-0000-0000-00000000000d');
select is((select count(*)::int from public.orders), 0, 'no report page: no sales rows');
select is(public.report_transactions(array['a1100000-0000-0000-0000-000000000001'::uuid], now() - interval '1 day', now()), '[]'::jsonb, 'no report page: empty transactions report');
select is((public.report_sales(array['a1100000-0000-0000-0000-000000000001'::uuid], now() - interval '1 day', now())#>>'{summary,transactions}')::int, 0, 'no report page: empty sales report');
select is((select count(*)::int from public.employees), 1, 'no employee page: sees only their own slot');
-- Vera has the dashboard: sales yes, staff list no.
select pg_temp.act_as('c0000000-0000-0000-0000-00000000000c');
select is((public.report_sales(array['a1100000-0000-0000-0000-000000000001'::uuid], now() - interval '1 day', now())#>>'{summary,transactions}')::int, 1, 'dashboard role still gets the sales summary');
select is((select count(*)::int from public.employees), 1, 'dashboard role: own slot only');
-- Mira has the Employees page: staff at her outlet.
select pg_temp.act_as('f0000000-0000-0000-0000-00000000000f');
select ok((select count(*) from public.employees) >= 3, 'employees page: sees staff at their outlet');

-- Memberships: no direct adds; people can leave.
select pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ insert into public.members (account_id, user_id, role) values ('a1000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000000b', 'admin') $$,
  '42501', null, 'owner cannot add someone else''s login directly');

-- Switching backoffice access back on is owner-only.
select lives_ok($$ update public.employees set is_active = false where id = 'e1000000-0000-0000-0000-000000000001' $$, 'owner switches Vera off');
select pg_temp.act_as('f0000000-0000-0000-0000-00000000000f');
select throws_ok($$ update public.employees set is_active = true where id = 'e1000000-0000-0000-0000-000000000001' $$,
  '42501', 'Only the owner can switch backoffice access back on', 'manager cannot switch a backoffice login back on');

-- Change log covers customers.
select lives_ok($$ insert into public.customers (account_id, location_id, name) values ('a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'Cust') $$, 'manager adds a customer');
reset role;
select is((select count(*)::int from public.audit_log where table_name = 'customers'), 1, 'customer change is in the change log');
set local role authenticated;

-- Refunds: one entry per sale line; the restocked item comes from the sale.
select pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.submit_refund('de000000-0000-0000-0000-000000000001', jsonb_build_object('id', gen_random_uuid(),
  'order_id', '0d000000-0000-0000-0000-000000000001', 'reason', 'x', 'method_name', 'Cash', 'kind', 'cash', 'amount', 1, 'refunded_at', now(),
  'lines', jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'order_line_id', '11000000-0000-0000-0000-000000000001', 'item_name', 'Kopi', 'qty', 1, 'amount', 0),
    jsonb_build_object('id', gen_random_uuid(), 'order_line_id', '11000000-0000-0000-0000-000000000001', 'item_name', 'Kopi', 'qty', 1, 'amount', 0)))) $$,
  '22023', 'each sale line can appear only once in a refund', 'a sale line cannot be refunded twice in one refund');
select lives_ok($$ select public.submit_refund('de000000-0000-0000-0000-000000000001', jsonb_build_object('id', gen_random_uuid(),
  'order_id', '0d000000-0000-0000-0000-000000000001', 'reason', 'x', 'method_name', 'Cash', 'kind', 'cash', 'amount', 1, 'refunded_at', now(),
  'lines', jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'order_line_id', '11000000-0000-0000-0000-000000000001',
    'item_id', gen_random_uuid(), 'item_name', 'Kopi', 'qty', 1, 'amount', 0)))) $$, 'single-line refund saves');
reset role;
select is((select item_id from public.refund_lines where order_line_id = '11000000-0000-0000-0000-000000000001'), null::uuid,
  'refund line takes the item from the sale line, not the request');

select * from finish();
rollback;
