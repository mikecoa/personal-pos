-- Backoffice access per page, split into view (backoffice_pages) and change (backoffice_write).
--
-- * A role lists the pages its people can open (read) and, separately, the ones they can change
--   (write; always a subset of read). Exports count as read.
-- * The database enforces write access: every library / location-settings table only accepts
--   changes from the owner or from someone whose role can write that page, at a location they
--   are assigned to (member_locations, from the employee's locations).
-- * Employees and roles can be managed by people whose role has the "employees" / "employee_roles"
--   write access, but only below themselves: roles with fewer permissions than their own (never
--   their own role, or one equal or above), employees with such a role at their own locations, and
--   never their own slot.
-- * Granting backoffice access stays with the owner: others can't change a role's backoffice pages,
--   give an employee a role that has backoffice access, or set an employee's login email.
-- * Every change made by someone other than the owner is written to audit_log (who, when, what:
--   old → new). Only the owner can read it.
-- * Business-wide settings (locations, account, business, backup) stay owner-only.

-- ───────────────────────────────────────────────────────────── role columns
alter table public.roles drop constraint roles_backoffice_pages_check;
alter table public.roles
  add column backoffice_write text[] not null default '{}',
  add constraint roles_backoffice_pages_check check (backoffice_pages <@ array[
    'dashboard','reports_sales','reports_transactions','reports_shifts',
    'library_items','library_categories','library_modifiers','library_sales_types','library_discounts','library_quick_notes',
    'settings_checkout','settings_payments','settings_receipt','settings_tables','settings_tablets',
    'employees','employee_roles','employee_pin']),
  add constraint roles_backoffice_write_check check (backoffice_write <@ backoffice_pages and not ('dashboard' = any (backoffice_write)));

-- Existing roles: everything they could open stays changeable (as before) except the reports,
-- which become view-only (closing / deleting shifts and history was owner-only already).
update public.roles set backoffice_write = array(
  select p from unnest(backoffice_pages) p where p not in ('dashboard', 'reports_sales', 'reports_transactions', 'reports_shifts'));

-- The Manager role: reports to view, the whole library and location settings to change, and
-- employees and roles (below them) to manage.
update public.roles set
  backoffice_pages = array['dashboard','reports_sales','reports_transactions','reports_shifts',
    'library_items','library_categories','library_modifiers','library_sales_types','library_discounts','library_quick_notes',
    'settings_checkout','settings_payments','settings_receipt','settings_tables','settings_tablets','employees','employee_roles'],
  backoffice_write = array['library_items','library_categories','library_modifiers','library_sales_types','library_discounts','library_quick_notes',
    'settings_checkout','settings_payments','settings_receipt','settings_tables','settings_tablets','employees','employee_roles']
where is_system and name = 'Manager';

create or replace function app.init_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.roles (account_id, name, is_system, permissions, backoffice_pages, backoffice_write) values
    (new.id, 'Manager', true, array[
      'charge', 'bill_print', 'open_bills_manage', 'void_items', 'discounts_apply', 'refunds_issue',
      'receipts_resend', 'cash_in_out', 'shift_view_details', 'shift_history_view', 'activity_view',
      'customers_edit', 'items_manage', 'favorites_manage', 'tables_manage', 'shift_settings_manage', 'pin_approve',
      'custom_amount'],
     array['dashboard','reports_sales','reports_transactions','reports_shifts',
       'library_items','library_categories','library_modifiers','library_sales_types','library_discounts','library_quick_notes',
       'settings_checkout','settings_payments','settings_receipt','settings_tables','settings_tablets','employees','employee_roles'],
     array['library_items','library_categories','library_modifiers','library_sales_types','library_discounts','library_quick_notes',
       'settings_checkout','settings_payments','settings_receipt','settings_tables','settings_tablets','employees','employee_roles']),
    (new.id, 'Cashier', true, array[
      'charge', 'bill_print', 'open_bills_manage', 'discounts_apply', 'receipts_resend', 'activity_view'], '{}', '{}');
  return new;
end $$;

-- ───────────────────────────────────────────────────────────── who may do what
-- The signed-in person's role through their employee slot (null for owners and for admins
-- without a slot).
create or replace function app.my_role(p_account uuid) returns public.roles
language sql stable security definer set search_path = '' as $$
  select r.* from public.employees e join public.roles r on r.id = e.role_id
  where e.account_id = p_account and e.user_id = auth.uid() and e.is_active
$$;

-- Can the signed-in person change backoffice page p_page at this location?
-- Owner: always. Admin with an employee slot: when their role can write the page and they are
-- assigned to the location. Admin without a slot (set up before employee access existed): as before.
create or replace function app.can_write(p_location uuid, p_page text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when m.role = 'owner' then true
      when m.role <> 'admin' then false
      when not exists (select 1 from public.member_locations ml where ml.location_id = l.id and ml.user_id = auth.uid()) then false
      when not exists (select 1 from public.employees e where e.account_id = l.account_id and e.user_id = auth.uid()) then true
      else coalesce(p_page = any ((app.my_role(l.account_id)).backoffice_write), false)
    end
    from public.locations l
    join public.members m on m.account_id = l.account_id and m.user_id = auth.uid()
    where l.id = p_location), false)
$$;

-- Same, for business-wide pages (employees, roles).
create or replace function app.can_write_account(p_account uuid, p_page text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when m.role = 'owner' then true
      when m.role <> 'admin' then false
      else coalesce(p_page = any ((app.my_role(p_account)).backoffice_write), false)
    end
    from public.members m where m.account_id = p_account and m.user_id = auth.uid()), false)
$$;

-- Are these permissions strictly below the signed-in person's own role (a subset with at least
-- one thing fewer)? Owners: always.
create or replace function app.perms_below(p_account uuid, p_perms text[], p_pages text[], p_write text[]) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare mine public.roles;
begin
  if app.account_role(p_account) = 'owner' then return true; end if;
  mine := app.my_role(p_account);
  if mine.id is null then return false; end if;
  return coalesce(p_perms, '{}') <@ mine.permissions and coalesce(p_pages, '{}') <@ mine.backoffice_pages
     and coalesce(p_write, '{}') <@ mine.backoffice_write
     and not (coalesce(p_perms, '{}') @> mine.permissions and coalesce(p_pages, '{}') @> mine.backoffice_pages
              and coalesce(p_write, '{}') @> mine.backoffice_write);
end $$;

-- Is this existing role below the signed-in person (and not their own)?
create or replace function app.role_below(p_role uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare r public.roles; mine public.roles;
begin
  select * into r from public.roles where id = p_role;
  if r.id is null then return false; end if;
  if app.account_role(r.account_id) = 'owner' then return true; end if;
  mine := app.my_role(r.account_id);
  if mine.id is null or mine.id = r.id then return false; end if;
  return app.perms_below(r.account_id, r.permissions, r.backoffice_pages, r.backoffice_write);
end $$;

-- Can the signed-in person manage this employee? Owner: any. Others: needs "employees" write,
-- the employee's role below theirs, every location of the employee one of theirs, and not themselves.
create or replace function app.can_manage_employee(p_employee uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare e public.employees;
begin
  select * into e from public.employees where id = p_employee;
  if e.id is null then return false; end if;
  if app.account_role(e.account_id) = 'owner' then return true; end if;
  if not app.can_write_account(e.account_id, 'employees') then return false; end if;
  if e.user_id = auth.uid() then return false; end if;
  if not app.role_below(e.role_id) then return false; end if;
  return not exists (select 1 from public.employee_locations el where el.employee_id = e.id
    and not exists (select 1 from public.member_locations ml where ml.location_id = el.location_id and ml.user_id = auth.uid()));
end $$;

grant execute on function app.can_write(uuid, text), app.can_write_account(uuid, text), app.role_below(uuid),
  app.can_manage_employee(uuid), app.perms_below(uuid, text[], text[], text[]) to authenticated;

-- ───────────────────────────────────────────────────────────── write rules per table
do $$
declare
  m record;
begin
  for m in select * from (values
    ('items', 'library_items'), ('item_variants', 'library_items'), ('variant_sales_type_prices', 'library_items'),
    ('item_modifier_sets', 'library_items'), ('package_groups', 'library_items'), ('package_options', 'library_items'),
    ('categories', 'library_categories'),
    ('modifier_sets', 'library_modifiers'), ('modifier_options', 'library_modifiers'),
    ('sales_types', 'library_sales_types'),
    ('discounts', 'library_discounts'),
    ('quick_notes', 'library_quick_notes'),
    ('payment_methods', 'settings_payments'),
    ('receipt_profiles', 'settings_receipt'),
    ('table_areas', 'settings_tables'), ('dining_tables', 'settings_tables')
  ) as x(tbl, page) loop
    execute format('drop policy if exists %I on public.%I', m.tbl || '_insert', m.tbl);
    execute format('drop policy if exists %I on public.%I', m.tbl || '_update', m.tbl);
    execute format('drop policy if exists %I on public.%I', m.tbl || '_delete', m.tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (app.can_write(location_id, %L))', m.tbl || '_insert', m.tbl, m.page);
    execute format('create policy %I on public.%I for update to authenticated using (app.can_write(location_id, %L)) with check (app.can_write(location_id, %L))', m.tbl || '_update', m.tbl, m.page, m.page);
    execute format('create policy %I on public.%I for delete to authenticated using (app.can_write(location_id, %L))', m.tbl || '_delete', m.tbl, m.page);
  end loop;
end $$;

-- One receipt profile per location (made with the location): edit only, never added or removed.
drop policy receipt_profiles_insert on public.receipt_profiles;
drop policy receipt_profiles_delete on public.receipt_profiles;

-- location_settings holds Checkout and the Manager PIN approval list: each needs its own page.
drop policy if exists location_settings_update on public.location_settings;
create policy location_settings_update on public.location_settings for update to authenticated
  using (app.can_write(location_id, 'settings_checkout') or app.can_write(location_id, 'employee_pin'))
  with check (app.can_write(location_id, 'settings_checkout') or app.can_write(location_id, 'employee_pin'));
create or replace function app.location_settings_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return new; end if;            -- tablets' own functions and maintenance
  if new.pin_required_actions is distinct from old.pin_required_actions and not app.can_write(new.location_id, 'employee_pin') then
    raise exception 'You can''t change Manager PIN approval' using errcode = '42501';
  end if;
  if (to_jsonb(new) - 'pin_required_actions' - 'updated_at') is distinct from (to_jsonb(old) - 'pin_required_actions' - 'updated_at')
     and not app.can_write(new.location_id, 'settings_checkout') then
    raise exception 'You can''t change Checkout settings' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger location_settings_guard before update on public.location_settings for each row execute function app.location_settings_guard();

-- The receipt page also sets the location's logo; other location details stay owner-only.
drop policy if exists locations_update on public.locations;
create policy locations_update on public.locations for update to authenticated
  using (app.account_role(account_id) = 'owner' or app.can_write(id, 'settings_receipt'))
  with check (app.account_role(account_id) = 'owner' or app.can_write(id, 'settings_receipt'));
create or replace function app.locations_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or app.account_role(new.account_id) = 'owner' then return new; end if;
  if (to_jsonb(new) - 'logo' - 'updated_at') is distinct from (to_jsonb(old) - 'logo' - 'updated_at') then
    raise exception 'Only the owner can change location details' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger locations_guard before update on public.locations for each row execute function app.locations_guard();

-- Employees: owners as before; others may update / delete (on / off, remove) the ones they can manage.
create policy employees_manage_update on public.employees for update to authenticated
  using (app.can_manage_employee(id)) with check (app.role_below(role_id));
create policy employees_manage_delete on public.employees for delete to authenticated
  using (app.can_manage_employee(id));

-- ───────────────────────────────────────────────────────────── functions with their own checks
create or replace function public.revoke_device(p_device uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_loc uuid;
begin
  select location_id into v_loc from public.devices where id = p_device;
  if v_loc is null or not app.can_write(v_loc, 'settings_tablets') then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.devices set revoked_at = now() where id = p_device and revoked_at is null;
end $$;

-- Shifts: closing / deleting needs write access to the Shifts report.
do $$
declare v_src text;
begin
  select pg_get_functiondef('public.close_shift(uuid, bigint)'::regprocedure) into v_src;
  v_src := replace(v_src, 'app.account_role(s.account_id) not in (''owner'', ''admin'')', 'not app.can_write(s.location_id, ''reports_shifts'')');
  execute v_src;
exception when undefined_function then null;
end $$;

-- Employee slots. Owners: as before. Others ("employees" write): only roles below them, only at
-- their own locations, never their own slot; email logins they give out can't exceed their own access.
create or replace function public.save_employee(p jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id       uuid := nullif(p->>'id', '')::uuid;
  v_account  uuid := (p->>'account_id')::uuid;
  v_pin      text := nullif(p->>'pin', '');
  v_email    text := nullif(lower(trim(coalesce(p->>'email', ''))), '');
  v_locs     uuid[] := array(select jsonb_array_elements_text(coalesce(p->'location_ids', '[]'))::uuid);
  v_owner    boolean := app.account_role(v_account) = 'owner';
begin
  if not v_owner then
    if not app.can_write_account(v_account, 'employees') then raise exception 'not allowed' using errcode = '42501'; end if;
    if v_id is not null and not app.can_manage_employee(v_id) then
      raise exception 'You can''t change this employee' using errcode = '42501';
    end if;
    if not app.role_below((p->>'role_id')::uuid) then
      raise exception 'You can only give roles below your own' using errcode = '42501';
    end if;
    if exists (select 1 from unnest(v_locs) l where not exists (
        select 1 from public.member_locations ml where ml.location_id = l and ml.user_id = auth.uid())) then
      raise exception 'You can only choose your own locations' using errcode = '42501';
    end if;
    -- Backoffice access is granted by the owner only.
    if v_email is distinct from (select email from public.employees where id = v_id) then
      raise exception 'Only the owner can set a login email (backoffice access)' using errcode = '42501';
    end if;
    if exists (select 1 from public.roles where id = (p->>'role_id')::uuid and cardinality(backoffice_pages) > 0)
       and (p->>'role_id')::uuid is distinct from (select role_id from public.employees where id = v_id) then
      raise exception 'Only the owner can give a role with backoffice access' using errcode = '42501';
    end if;
  end if;
  if not exists (select 1 from public.roles where id = (p->>'role_id')::uuid and account_id = v_account) then
    raise exception 'role not found' using errcode = '42501';
  end if;
  if coalesce(array_length(v_locs, 1), 0) = 0 then
    raise exception 'choose at least one location' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_locs) l where not exists (
      select 1 from public.locations x where x.id = l and x.account_id = v_account)) then
    raise exception 'location not in this business' using errcode = '42501';
  end if;
  if v_email is not null and exists (select 1 from public.employees where account_id = v_account and email = v_email and id is distinct from v_id) then
    raise exception 'Another employee already uses that email' using errcode = '23505';
  end if;

  if v_id is null then
    insert into public.employees (account_id, role_id, name, phone, email, is_active)
    values (v_account, (p->>'role_id')::uuid, trim(p->>'name'), nullif(trim(p->>'phone'), ''), v_email,
      coalesce((p->>'is_active')::boolean, true))
    returning id into v_id;
  else
    update public.employees set role_id = (p->>'role_id')::uuid, name = trim(p->>'name'),
      phone = nullif(trim(p->>'phone'), ''), is_active = coalesce((p->>'is_active')::boolean, true),
      user_id = case when email is distinct from v_email then null else user_id end,
      email = v_email
    where id = v_id and account_id = v_account;
    if not found then raise exception 'employee not found' using errcode = '42501'; end if;
  end if;

  delete from public.employee_locations where employee_id = v_id;
  insert into public.employee_locations (account_id, employee_id, location_id)
    select v_account, v_id, l from unnest(v_locs) l;

  if v_pin is not null then
    perform public.set_employee_pin(v_id, v_pin);
  elsif coalesce((p->>'clear_pin')::boolean, false) then
    perform public.set_employee_pin(v_id, null);
  end if;
  return v_id;
end $$;

do $$
declare v_src text;
begin
  select pg_get_functiondef('public.set_employee_pin(uuid, text)'::regprocedure) into v_src;
  v_src := replace(v_src, 'app.account_role(v_account) is distinct from ''owner''', 'not app.can_manage_employee(p_employee)');
  execute v_src;
end $$;

-- Roles. p: { id?, account_id, name, permissions, backoffice_pages, backoffice_write }.
-- Owners: any role. Others ("employee_roles" write): only roles below their own, kept below.
create or replace function public.save_role(p jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id      uuid := nullif(p->>'id', '')::uuid;
  v_account uuid := (p->>'account_id')::uuid;
  v_perms   text[] := array(select jsonb_array_elements_text(coalesce(p->'permissions', '[]')));
  v_write   text[] := array(select jsonb_array_elements_text(coalesce(p->'backoffice_write', '[]')));
  v_pages   text[] := array(select distinct x from unnest(array(select jsonb_array_elements_text(coalesce(p->'backoffice_pages', '[]'))) || v_write) x);
  v_old     public.roles;
begin
  if not app.can_write_account(v_account, 'employee_roles') then raise exception 'not allowed' using errcode = '42501'; end if;
  if v_id is not null then
    select * into v_old from public.roles where id = v_id and account_id = v_account;
    if v_old.id is null then raise exception 'role not found' using errcode = 'P0002'; end if;
    if not app.role_below(v_id) then raise exception 'You can only change roles below your own' using errcode = '42501'; end if;
  end if;
  if app.account_role(v_account) is distinct from 'owner' then
    -- Backoffice access is granted by the owner only: keep it as it was (none on new roles).
    v_pages := coalesce(v_old.backoffice_pages, '{}'); v_write := coalesce(v_old.backoffice_write, '{}');
  end if;
  if not app.perms_below(v_account, v_perms, v_pages, v_write) then
    raise exception 'A role you set up must have fewer permissions than your own' using errcode = '42501';
  end if;
  if v_id is null then
    insert into public.roles (account_id, name, permissions, backoffice_pages, backoffice_write)
    values (v_account, trim(p->>'name'), v_perms, v_pages, v_write) returning id into v_id;
  else
    update public.roles set name = trim(p->>'name'), permissions = v_perms, backoffice_pages = v_pages, backoffice_write = v_write
    where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.delete_role(p_role uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare r public.roles;
begin
  select * into r from public.roles where id = p_role;
  if r.id is null then return; end if;
  if r.is_system then raise exception 'Built-in roles can''t be deleted' using errcode = '42501'; end if;
  if not app.can_write_account(r.account_id, 'employee_roles') or not app.role_below(p_role) then
    raise exception 'You can only delete roles below your own' using errcode = '42501';
  end if;
  delete from public.roles where id = p_role;
end $$;

create or replace function public.delete_employee(p_employee uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.can_manage_employee(p_employee) then raise exception 'You can''t remove this employee' using errcode = '42501'; end if;
  delete from public.employees where id = p_employee;
end $$;

revoke execute on function public.save_role(jsonb), public.delete_role(uuid), public.delete_employee(uuid) from public, anon;
grant execute on function public.save_role(jsonb), public.delete_role(uuid), public.delete_employee(uuid) to authenticated;

-- A sync after a role's write list changes (the membership itself only depends on having pages).
drop trigger if exists roles_sync on public.roles;
create trigger roles_sync after update of backoffice_pages, backoffice_write on public.roles for each row execute function app.roles_sync();

-- ───────────────────────────────────────────────────────────── change log
create table public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts (id) on delete cascade,
  location_id  uuid references public.locations (id) on delete set null,
  user_id      uuid,
  actor_name   text not null,
  at           timestamptz not null default now(),
  table_name   text not null,
  op           text not null check (op in ('added', 'changed', 'removed')),
  row_id       uuid,
  row_label    text,
  changes      jsonb not null default '{}'          -- { field: [old, new] }
);
create index audit_log_account_at on public.audit_log (account_id, at desc);
alter table public.audit_log enable row level security;
create policy audit_log_select on public.audit_log for select to authenticated using (app.account_role(account_id) = 'owner');

-- Name of the signed-in person for the log (their employee name, else their login).
create or replace function app.actor_name(p_account uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select name from public.employees where account_id = p_account and user_id = auth.uid()),
    (select nullif(display_name, '') from public.members where account_id = p_account and user_id = auth.uid()),
    (select email from auth.users where id = auth.uid()), 'Someone')
$$;

-- Write one entry, when the signed-in person isn't the owner.
create or replace function app.audit_note(p_account uuid, p_location uuid, p_table text, p_op text, p_row uuid, p_label text, p_changes jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_role app.member_role;
begin
  if auth.uid() is null then return; end if;
  select role into v_role from public.members where account_id = p_account and user_id = auth.uid();
  if v_role is null or v_role = 'owner' then return; end if;
  insert into public.audit_log (account_id, location_id, user_id, actor_name, table_name, op, row_id, row_label, changes)
  values (p_account, p_location, auth.uid(), app.actor_name(p_account), p_table, p_op, p_row, p_label, coalesce(p_changes, '{}'));
end $$;

create or replace function app.audit_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  v_changes jsonb := '{}';
  v_label text;
  k text;
  skip text[] := array['updated_at', 'created_at', 'pin_hash', 'pin_lookup', 'user_id', 'account_id', 'location_id', 'id', 'source_key'];
begin
  if auth.uid() is null then return null; end if;
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if k = any (skip) then continue; end if;
      if (o->k) is distinct from (n->k) then v_changes := v_changes || jsonb_build_object(k, jsonb_build_array(o->k, n->k)); end if;
    end loop;
    if (o->>'pin_hash') is distinct from (n->>'pin_hash') or (o->>'pin_lookup') is distinct from (n->>'pin_lookup') then
      v_changes := v_changes || jsonb_build_object('pin', jsonb_build_array('…', 'changed'));
    end if;
    if v_changes = '{}' then return null; end if;
  elsif tg_op = 'INSERT' then
    for k in select jsonb_object_keys(n) loop
      if k = any (skip) or k in ('sort_order') or (n->k) = 'null'::jsonb then continue; end if;
      v_changes := v_changes || jsonb_build_object(k, jsonb_build_array(null, n->k));
    end loop;
  end if;
  v_label := coalesce(r->>'name', r->>'text', r->>'header_name', r->>'number', r->>'item_name');
  if tg_table_name = 'item_variants' then
    v_label := (select name from public.items where id = (r->>'item_id')::uuid) || coalesce(' – ' || nullif(r->>'name', ''), '');
  elsif tg_table_name in ('location_settings', 'receipt_profiles') then
    v_label := (select name from public.locations where id = (r->>'location_id')::uuid);
  end if;
  perform app.audit_note((r->>'account_id')::uuid, nullif(r->>'location_id', '')::uuid, tg_table_name,
    case tg_op when 'INSERT' then 'added' when 'UPDATE' then 'changed' else 'removed' end,
    nullif(r->>'id', '')::uuid, v_label, v_changes);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['items', 'item_variants', 'categories', 'modifier_sets', 'modifier_options', 'sales_types',
    'discounts', 'quick_notes', 'payment_methods', 'receipt_profiles', 'location_settings', 'table_areas', 'dining_tables',
    'devices', 'employees', 'roles', 'shifts', 'locations'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit_change()', t || '_audit', t);
  end loop;
end $$;

-- Package choices are rewritten on every save, so they get one summary entry instead.
do $$
declare v_src text;
begin
  select pg_get_functiondef('public.save_package(uuid, jsonb)'::regprocedure) into v_src;
  v_src := replace(v_src, '  delete from public.package_groups where item_id = p_item;',
    '  perform app.audit_note(v_item.account_id, v_item.location_id, ''package_groups'', ''changed'', p_item, v_item.name, jsonb_build_object(''choice groups'', jsonb_build_array(null, p)));
  delete from public.package_groups where item_id = p_item;');
  execute v_src;
end $$;

-- Removing shifts / cancelled bills / voids from the history: needs write access to that report.
do $$
declare v_src text;
begin
  select pg_get_functiondef('public.delete_shifts(uuid[])'::regprocedure) into v_src;
  v_src := replace(v_src, 'app.account_role(s.account_id) = ''owner''', 'app.can_write(s.location_id, ''reports_shifts'')');
  execute v_src;
  select pg_get_functiondef('public.delete_transactions(text, uuid[])'::regprocedure) into v_src;
  v_src := replace(v_src, 'app.account_role(o.account_id) = ''owner''', 'app.can_write(o.location_id, ''reports_transactions'')');
  v_src := replace(v_src, 'app.account_role(v.account_id) = ''owner''', 'app.can_write(v.location_id, ''reports_transactions'')');
  execute v_src;
end $$;
-- …and those removals go in the change log too.
create trigger orders_audit after delete on public.orders for each row execute function app.audit_change();
create trigger order_voids_audit after delete on public.order_voids for each row execute function app.audit_change();

-- Preview: the role, if the signed-in person may look at the backoffice as it (owner: any role;
-- others: roles below their own). Null otherwise.
create or replace function public.role_preview(p_role uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'name', r.name, 'backoffice_pages', to_jsonb(r.backoffice_pages))
  from public.roles r
  where r.id = p_role and app.account_role(r.account_id) is not null
    and (app.account_role(r.account_id) = 'owner' or app.role_below(r.id))
$$;
revoke execute on function public.role_preview(uuid) from public, anon;
grant execute on function public.role_preview(uuid) to authenticated;

-- For the Employees pages: which roles and employees the signed-in person may manage.
create or replace function public.manageable(p_account uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'roles', coalesce((select jsonb_agg(r.id) from public.roles r where r.account_id = p_account and app.role_below(r.id)), '[]'),
    'employees', coalesce((select jsonb_agg(e.id) from public.employees e where e.account_id = p_account and app.can_manage_employee(e.id)), '[]'))
  where app.account_role(p_account) is not null
$$;
revoke execute on function public.manageable(uuid) from public, anon;
grant execute on function public.manageable(uuid) to authenticated;
