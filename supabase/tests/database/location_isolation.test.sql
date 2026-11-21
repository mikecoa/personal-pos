-- Proves that data is isolated per account and per location at the database level.
-- Self-contained fixtures (does not depend on seed.sql). Runs inside a transaction.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- ── fixtures (as postgres) ─────────────────────────────────────────────
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
insert into public.categories (id, account_id, location_id, name) values
  ('ca000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'A1 drinks'),
  ('ca000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000002', 'A2 drinks'),
  ('cb000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000000', 'b1100000-0000-0000-0000-000000000001', 'B1 drinks');

-- Structural guard: a row cannot pair a location with another account's id.
select throws_ok(
  $$ insert into public.categories (account_id, location_id, name)
     values ('b1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'mismatch') $$,
  '23503', null, 'composite FK rejects location of a different account');

create function pg_temp.act_as(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- ── Owner A ────────────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');

select results_eq('select name from public.locations order by name',
  array['A1', 'A2'], 'owner A sees both own locations and nothing of B');
select results_eq('select count(*)::int from public.categories', array[2], 'owner A sees categories of A1 and A2 only');
select is_empty($$ select 1 from public.accounts where name = 'Account B' $$, 'owner A cannot see account B');
select throws_ok(
  $$ insert into public.categories (account_id, location_id, name)
     values ('b1000000-0000-0000-0000-000000000000', 'b1100000-0000-0000-0000-000000000001', 'intrusion') $$,
  '42501', null, 'owner A cannot write into B1');
select lives_ok(
  $$ insert into public.locations (account_id, name) values ('a1000000-0000-0000-0000-000000000000', 'A3') $$,
  'owner A can add a location');
select throws_ok(
  $$ insert into public.members (account_id, user_id, role)
     values ('a1000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000000b', 'owner') $$,
  '42501', null, 'owner cannot add a second owner');

-- Updates/deletes against other accounts silently affect zero rows.
update public.categories set name = 'hacked' where id = 'cb000000-0000-0000-0000-000000000001';
delete from public.categories where id = 'cb000000-0000-0000-0000-000000000001';

select throws_ok(
  $$ update public.categories set location_id = 'a1100000-0000-0000-0000-000000000002'
     where id = 'ca000000-0000-0000-0000-000000000001' $$,
  'P0001', 'location_id/account_id cannot be changed', 'a row cannot be moved to another location');

-- ── Staff assigned to A1 only ──────────────────────────────────────────
select pg_temp.act_as('c0000000-0000-0000-0000-00000000000c');
select results_eq('select name from public.locations', array['A1'], 'staff sees only assigned location');
select results_eq('select name from public.categories', array['A1 drinks'], 'staff sees only A1 categories');
select throws_ok(
  $$ insert into public.categories (account_id, location_id, name)
     values ('a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'staff write') $$,
  '42501', null, 'staff cannot write catalog');
select throws_ok(
  $$ insert into public.locations (account_id, name) values ('a1000000-0000-0000-0000-000000000000', 'staff loc') $$,
  '42501', null, 'staff cannot create locations');

-- ── Admin assigned to A2 only ──────────────────────────────────────────
select pg_temp.act_as('d0000000-0000-0000-0000-00000000000d');
select results_eq('select name from public.locations', array['A2'], 'admin sees only assigned location');
select lives_ok(
  $$ insert into public.categories (account_id, location_id, name)
     values ('a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000002', 'A2 food') $$,
  'admin can write in assigned location');
select throws_ok(
  $$ insert into public.categories (account_id, location_id, name)
     values ('a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'A1 food') $$,
  '42501', null, 'admin cannot write in a location not assigned');
select throws_ok(
  $$ insert into public.member_locations (account_id, user_id, location_id)
     values ('a1000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-00000000000d', 'a1100000-0000-0000-0000-000000000001') $$,
  '42501', null, 'admin cannot grant itself another location');

-- ── Owner B ────────────────────────────────────────────────────────────
select pg_temp.act_as('b0000000-0000-0000-0000-00000000000b');
select results_eq('select name from public.locations', array['B1'], 'owner B sees only B1');
select results_eq('select name from public.categories', array['B1 drinks'],
  'B1 category untouched by owner A update/delete attempts');

-- ── Anonymous ──────────────────────────────────────────────────────────
set local role anon;
select pg_temp.act_as(null);
select is_empty('select 1 from public.locations', 'anon sees no locations');

-- ── Onboarding RPC ─────────────────────────────────────────────────────
reset role;
insert into auth.users (id, email, aud, role) values
  ('e0000000-0000-0000-0000-00000000000e', 'new@t.test', 'authenticated', 'authenticated');
set local role authenticated;
select pg_temp.act_as('e0000000-0000-0000-0000-00000000000e');
select isnt(public.create_account('New Biz', 'First Shop'), null, 'create_account returns an id');
select results_eq('select name from public.locations', array['First Shop'], 'new owner sees only the new location');
select results_eq($$ select role::text from public.members $$, array['owner'], 'caller became owner');

select * from finish();
rollback;
