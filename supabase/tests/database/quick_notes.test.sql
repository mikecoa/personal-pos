-- Quick notes (one-tap note buttons) per location.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

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
insert into public.categories (id, account_id, location_id, name) values
  ('ca000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000001', 'Minuman'),
  ('ca000000-0000-0000-0000-000000000009', 'a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000002', 'Other place');
insert into public.quick_notes (account_id, location_id, text) values
  ('a1000000-0000-0000-0000-000000000000', 'a1100000-0000-0000-0000-000000000002', 'A2 note');
set local role authenticated;
\set dev '''de000000-0000-0000-0000-000000000001'''

select pg_temp.act_as('c0000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.pos_save_quick_notes('de000000-0000-0000-0000-000000000001', '[{"text":"Less sugar"}]') $$, '42501', null, 'staff sign-in cannot edit quick notes');
select is((select count(*)::int from public.quick_notes), 0, 'staff cannot see another location''s notes');

select pg_temp.act_as('a0000000-0000-0000-0000-00000000000a');
select is((select string_agg(x->>'text', ',') from jsonb_array_elements(public.pos_save_quick_notes(:dev,
  '[{"text":"Less sugar","category_ids":["ca000000-0000-0000-0000-000000000001","ca000000-0000-0000-0000-000000000009"]},{"text":"No sugar"},{"text":" Tanpa Sayur "}]')) x),
  'Less sugar,No sugar,Tanpa Sayur', 'save a list in order (trimmed)');
select is((select category_ids::text from public.quick_notes where text = 'Less sugar'), '{ca000000-0000-0000-0000-000000000001}', 'another location''s category is dropped');
select throws_ok($$ select public.pos_save_quick_notes('de000000-0000-0000-0000-000000000001', '[{"text":"No ice"},{"text":"no ice"}]') $$, '23505', null, 'duplicates refused');
select lives_ok($$ select public.pos_save_quick_notes('de000000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('id', (select id from public.quick_notes where text = 'Tanpa Sayur'), 'text', 'Tanpa Sayur'),
  jsonb_build_object('id', (select id from public.quick_notes where text = 'Less sugar'), 'text', 'Sedikit gula'))) $$, 'reorder, rename and drop one');
select is((select string_agg(text || ':' || cardinality(category_ids), ',' order by sort_order) from public.quick_notes where location_id = 'a1100000-0000-0000-0000-000000000001'),
  'Tanpa Sayur:0,Sedikit gula:1', 'order and rename saved; categories kept when not sent; No sugar removed');
select is(public.pos_catalog(:dev)#>>'{quick_notes,0,text}', 'Tanpa Sayur', 'the catalog carries the notes in order');
select is((select count(*)::int from public.quick_notes where location_id = 'a1100000-0000-0000-0000-000000000002'), 1, 'the other location''s notes are untouched');

select * from finish();
rollback;
