-- Employee backoffice access: email on the slot, role pages, sign-up link, and keeping it in sync.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('a0000000-0000-0000-0000-00000000000a', 'owner@t.test', 'authenticated', 'authenticated', now()),
  ('f1000000-0000-0000-0000-000000000001', 'fiki@t.test', 'authenticated', 'authenticated', now()),
  ('f1000000-0000-0000-0000-000000000002', 'kasir@t.test', 'authenticated', 'authenticated', now()),
  ('f1000000-0000-0000-0000-000000000003', 'unconfirmed@t.test', 'authenticated', 'authenticated', null);
insert into public.accounts (id, name, owner_id) values ('a1000000-0000-0000-0000-000000000000', 'Account A', 'a0000000-0000-0000-0000-00000000000a');
insert into public.members (account_id, user_id, role) values ('a1000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'owner');
insert into public.locations (id, account_id, name) values
  ('a1100000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'A1'),
  ('a1100000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'A2');

create function pg_temp.act_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
create function pg_temp.role_id(p_name text) returns uuid language sql as $$
  select id from public.roles where account_id = 'a1000000-0000-0000-0000-000000000000' and name = p_name
$$;
set local role authenticated;

select pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');
select is((select cardinality(backoffice_pages) > 0 from public.roles where id = pg_temp.role_id('Manager')), true, 'new business: Manager has backoffice pages');
select is((select cardinality(backoffice_pages) from public.roles where id = pg_temp.role_id('Cashier')), 0, '…Cashier has none');
select lives_ok($$ select public.save_employee(jsonb_build_object('account_id', 'a1000000-0000-0000-0000-000000000000', 'name', 'Pak Fiki',
  'email', ' Fiki@T.test ', 'role_id', pg_temp.role_id('Manager'), 'location_ids', jsonb_build_array('a1100000-0000-0000-0000-000000000001'))) $$, 'add a manager with an email');
select is((select email from public.employees where name = 'Pak Fiki'), 'fiki@t.test', 'email stored lower-case and trimmed');
select throws_ok($$ select public.save_employee(jsonb_build_object('account_id', 'a1000000-0000-0000-0000-000000000000', 'name', 'Copy',
  'email', 'fiki@t.test', 'role_id', pg_temp.role_id('Cashier'), 'location_ids', jsonb_build_array('a1100000-0000-0000-0000-000000000001'))) $$, '23505', null, 'emails are unique in a business');
select public.save_employee(jsonb_build_object('account_id', 'a1000000-0000-0000-0000-000000000000', 'name', 'Kasir',
  'email', 'kasir@t.test', 'role_id', pg_temp.role_id('Cashier'), 'location_ids', jsonb_build_array('a1100000-0000-0000-0000-000000000001')));

-- signing up
select pg_temp.act_as('f1000000-0000-0000-0000-000000000002');
select is(public.claim_employee_access(), null, 'a cashier (no backoffice pages) is not linked');
select pg_temp.act_as('f1000000-0000-0000-0000-000000000003');
select is(public.claim_employee_access(), null, 'an unconfirmed email is not linked');
select pg_temp.act_as('f1000000-0000-0000-0000-000000000001');
select is(public.claim_employee_access(), 'Account A', 'the manager signs up and is linked to their slot');
select is((select array_agg(l.name order by l.name)::text from public.locations l), '{A1}', '…and sees only the locations they work at');
select is(app.can_manage_location('a1100000-0000-0000-0000-000000000002'), false, '…and cannot manage the other location');

-- owner changes the slot
select pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');
select public.save_employee(jsonb_build_object('account_id', 'a1000000-0000-0000-0000-000000000000', 'id', (select id from public.employees where name = 'Pak Fiki'),
  'name', 'Pak Fiki', 'email', 'fiki@t.test', 'role_id', pg_temp.role_id('Manager'),
  'location_ids', jsonb_build_array('a1100000-0000-0000-0000-000000000001', 'a1100000-0000-0000-0000-000000000002')));
select is((select count(*)::int from public.member_locations where user_id = 'f1000000-0000-0000-0000-000000000001'), 2, 'adding a location gives backoffice access to it');
select public.save_employee(jsonb_build_object('account_id', 'a1000000-0000-0000-0000-000000000000', 'id', (select id from public.employees where name = 'Pak Fiki'),
  'name', 'Pak Fiki', 'email', 'fiki@t.test', 'role_id', pg_temp.role_id('Cashier'), 'location_ids', jsonb_build_array('a1100000-0000-0000-0000-000000000001')));
select is((select count(*)::int from public.members where user_id = 'f1000000-0000-0000-0000-000000000001'), 0, 'a role without backoffice pages removes the backoffice login');

select * from finish();
rollback;
