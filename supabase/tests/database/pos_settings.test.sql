-- Shift options changed from a tablet.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

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

create function pg_temp.act_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;


select pg_temp.act_as('c0000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.pos_shift_settings('de000000-0000-0000-0000-000000000001', '{"auto_shift_enabled":true}') $$, '42501', null,
  'a staff sign-in cannot change location settings');

select pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');
select is((select 'shift_settings_manage' = any (permissions) from public.roles where name = 'Manager'), true, 'new accounts: Managers can change shift options');
select is(public.pos_shift_settings('de000000-0000-0000-0000-000000000001', '{"auto_shift_enabled":true,"default_starting_cash":1000000}')->>'default_starting_cash', '1000000',
  'turn on automatic shifts with Rp 1.000.000');
select is((select auto_shift_enabled::text || '/' || default_starting_cash from public.location_settings where location_id = 'a1100000-0000-0000-0000-000000000001'), 'true/1000000', 'saved for the tablet''s location');
select is((select auto_shift_enabled::text from public.location_settings where location_id = 'a1100000-0000-0000-0000-000000000002'), 'false', 'other location untouched');
select throws_ok($$ select public.pos_shift_settings('de000000-0000-0000-0000-000000000001', '{"default_starting_cash":-5}') $$, '22023', null, 'negative cash refused');

select * from finish();
rollback;
