-- Employee access (like Moka's Employee Slots / Employee Access).
--
-- An employee can have an email. A role can grant backoffice pages (backoffice_pages). An
-- employee whose role has any backoffice page signs up at the backoffice with that email and is
-- linked to their slot (claim_employee_access); they then get a member row for the business
-- (admin, limited to the employee's locations) and the backoffice shows only the pages their role
-- allows. Changing the role, locations, email or deactivating the employee updates or removes
-- that access straight away. Employees, Locations and account settings stay owner-only.
--
-- Note: database rules (RLS) work per location; the page list is applied by the backoffice.

alter table public.employees
  add column email   text check (email is null or (length(email) <= 120 and email = lower(trim(email)) and email like '%_@_%')),
  add column user_id uuid references auth.users (id) on delete set null;
create unique index employees_email_uq on public.employees (account_id, email) where email is not null;
create unique index employees_user_uq on public.employees (account_id, user_id) where user_id is not null;

alter table public.roles
  add column backoffice_pages text[] not null default '{}'
    check (backoffice_pages <@ array['dashboard','reports_sales','reports_transactions','reports_shifts','library_items','library_categories','library_modifiers','library_sales_types','library_discounts','library_quick_notes','settings_checkout','settings_payments','settings_receipt','settings_tables','settings_tablets']);

-- Bring a linked employee's membership in line with their slot.
create or replace function app.sync_employee_member(p_account uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_emp public.employees; v_pages text[];
begin
  if p_user is null then return; end if;
  if exists (select 1 from public.members where account_id = p_account and user_id = p_user and role = 'owner') then return; end if;
  select * into v_emp from public.employees where account_id = p_account and user_id = p_user;
  select backoffice_pages into v_pages from public.roles where id = v_emp.role_id;
  if v_emp.id is null or not v_emp.is_active or coalesce(cardinality(v_pages), 0) = 0 then
    delete from public.members where account_id = p_account and user_id = p_user and role <> 'owner';
    return;
  end if;
  insert into public.members (account_id, user_id, role, display_name) values (p_account, p_user, 'admin', v_emp.name)
    on conflict (account_id, user_id) do update set role = 'admin', display_name = excluded.display_name;
  delete from public.member_locations where account_id = p_account and user_id = p_user;
  insert into public.member_locations (account_id, user_id, location_id)
    select p_account, p_user, el.location_id from public.employee_locations el where el.employee_id = v_emp.id;
end $$;

create or replace function app.employees_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.user_id is not null and (tg_op = 'DELETE' or old.user_id is distinct from new.user_id) then
    perform app.sync_employee_member(old.account_id, old.user_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then perform app.sync_employee_member(new.account_id, new.user_id); end if;
  return null;
end $$;
create trigger employees_sync after insert or update or delete on public.employees for each row execute function app.employees_sync();

create or replace function app.employee_locations_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_emp public.employees;
begin
  select * into v_emp from public.employees where id = coalesce(new.employee_id, old.employee_id);
  if v_emp.user_id is not null then perform app.sync_employee_member(v_emp.account_id, v_emp.user_id); end if;
  return null;
end $$;
create trigger employee_locations_sync after insert or delete on public.employee_locations for each row execute function app.employee_locations_sync();

create or replace function app.roles_sync() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select account_id, user_id from public.employees where role_id = new.id and user_id is not null loop
    perform app.sync_employee_member(r.account_id, r.user_id);
  end loop;
  return null;
end $$;
create trigger roles_sync after update of backoffice_pages on public.roles for each row execute function app.roles_sync();

-- Called after a staff member signs up or signs in without a business: links them to the employee
-- slot with their (confirmed) email if that slot's role has backoffice access. Returns the business
-- name, or null when there is nothing to link.
create or replace function public.claim_employee_access() returns text
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_email text; v_emp public.employees;
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '42501'; end if;
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then return null; end if;
  if exists (select 1 from public.members where user_id = v_uid) then return null; end if;
  select e.* into v_emp from public.employees e join public.roles r on r.id = e.role_id
    where e.email = v_email and e.user_id is null and e.is_active and cardinality(r.backoffice_pages) > 0
    order by e.created_at limit 1;
  if v_emp.id is null then return null; end if;
  update public.employees set user_id = v_uid where id = v_emp.id;      -- trigger creates the membership
  return (select name from public.accounts where id = v_emp.account_id);
end $$;
revoke execute on function public.claim_employee_access() from public, anon;
grant execute on function public.claim_employee_access() to authenticated;

-- save_employee: also stores the email. Changing the email unlinks the old login.
create or replace function public.save_employee(p jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id       uuid := nullif(p->>'id', '')::uuid;
  v_account  uuid := (p->>'account_id')::uuid;
  v_pin      text := nullif(p->>'pin', '');
  v_email    text := nullif(lower(trim(coalesce(p->>'email', ''))), '');
  v_locs     uuid[] := array(select jsonb_array_elements_text(coalesce(p->'location_ids', '[]'))::uuid);
begin
  if app.account_role(v_account) is distinct from 'owner' then
    raise exception 'not allowed' using errcode = '42501';
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

-- Manager system roles keep full backoffice pages so Moka "Administrator" maps over directly.
update public.roles set backoffice_pages = array['dashboard','reports_sales','reports_transactions','reports_shifts','library_items','library_categories','library_modifiers','library_sales_types','library_discounts','library_quick_notes','settings_checkout','settings_payments','settings_receipt','settings_tables','settings_tablets'] where is_system and name = 'Manager';
