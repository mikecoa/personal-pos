-- Security audit fixes (high + medium).
--
-- 1. save_employee: a caller with no membership in the business got v_owner = NULL, and
--    `if not v_owner` skipped every non-owner check, so any signed-in user could add (or take
--    over) a manager slot in another business and claim it. Now: members only, and the owner
--    test is never NULL.
-- 2. Tablet RPCs checked only "owner or admin at this location", so a view-only backoffice role
--    could change prices, categories, quick notes and tables, or register a tablet and download
--    staff PIN lookups. They now need the same per-page change access as the backoffice:
--      items -> library_items, categories -> library_categories, quick notes -> library_quick_notes,
--      tables/floor map -> settings_tables, checkout settings -> settings_checkout,
--      registering a tablet and its catalog (with PIN lookups) -> settings_tablets.

-- Rewrites one function's current definition; fails loudly if the text to replace is missing,
-- so a patch can never silently do nothing.
create or replace function app.patch_function(p_sig text, p_old text, p_new text) returns void
language plpgsql set search_path = '' as $$
declare v_src text;
begin
  select pg_get_functiondef(p_sig::regprocedure) into v_src;
  if position(p_old in v_src) = 0 then
    raise exception 'patch_function: % does not contain %', p_sig, p_old;
  end if;
  execute replace(v_src, p_old, p_new);
end $$;
revoke execute on function app.patch_function(text, text, text) from public, anon, authenticated;

-- 1. save_employee
select app.patch_function('public.save_employee(jsonb)',
  'v_owner    boolean := app.account_role(v_account) = ''owner'';
begin
',
  'v_owner    boolean := coalesce(app.account_role(v_account) = ''owner'', false);
begin
  if app.account_role(v_account) is null then
    raise exception ''not allowed'' using errcode = ''42501'';
  end if;
');

-- Same NULL pattern in the role guard (it already fails closed, but make it explicit).
select app.patch_function('app.employees_role_guard()',
  'app.account_role(new.account_id) = ''owner''',
  'coalesce(app.account_role(new.account_id) = ''owner'', false)');

-- 2. Tablet RPCs: device check with a backoffice page.
create or replace function app.pos_device(p_device uuid, p_page text) returns public.devices
language plpgsql stable security definer set search_path = '' as $$
declare v_dev public.devices;
begin
  select * into v_dev from public.devices where id = p_device and revoked_at is null;
  if v_dev.id is null or not app.can_write(v_dev.location_id, p_page) then
    raise exception 'device not registered or not allowed' using errcode = '42501';
  end if;
  return v_dev;
end $$;

select app.patch_function('public.pos_save_item(uuid, jsonb)',
  'app.pos_device(p_device)', 'app.pos_device(p_device, ''library_items'')');
select app.patch_function('public.pos_save_category(uuid, jsonb)',
  'app.pos_device(p_device)', 'app.pos_device(p_device, ''library_categories'')');
select app.patch_function('public.pos_save_quick_notes(uuid, jsonb)',
  'app.pos_device(p_device)', 'app.pos_device(p_device, ''library_quick_notes'')');

select app.patch_function('public.pos_table_setup(uuid, jsonb)',
  'not app.can_manage_location(v_dev.location_id)', 'not app.can_write(v_dev.location_id, ''settings_tables'')');
select app.patch_function('public.pos_tables_bulk(uuid, jsonb)',
  'not app.can_manage_location(v_dev.location_id)', 'not app.can_write(v_dev.location_id, ''settings_tables'')');
select app.patch_function('public.pos_tables_layout(uuid, jsonb)',
  'not app.can_manage_location(v_dev.location_id)', 'not app.can_write(v_dev.location_id, ''settings_tables'')');
select app.patch_function('public.pos_shift_settings(uuid, jsonb)',
  'not app.can_manage_location(v_dev.location_id)', 'not app.can_write(v_dev.location_id, ''settings_checkout'')');

select app.patch_function('public.register_device(uuid, text)',
  'not app.can_manage_location(p_location)', 'not app.can_write(p_location, ''settings_tablets'')');
select app.patch_function('public.pos_catalog(uuid)',
  'not app.can_manage_location(v_loc)', 'not app.can_write(v_loc, ''settings_tablets'')');
