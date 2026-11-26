-- Security audit fixes (low).
--  1. View access per page is now enforced by the database, not only by the website: sales,
--     refunds and shift/cash records need a report (or dashboard) page; the staff list needs an
--     employee page and only shows your own outlets.
--  2. Owners can no longer add another person's login to their business directly; people join
--     only by claiming their employee slot, and can leave a business they don't own.
--  3. Turning a backoffice login back on after the owner switched it off is owner-only.
--  4. The change log also covers per-sales-type prices, modifier links, package choices and customers.
--  5. Refunds: one entry per sale line, and the restocked item comes from the sale itself.
--  6. Non-owners can change at most 20 PINs an hour (stops guessing other staff PINs from the
--     "PIN already used" message).

-- ---------------------------------------------------------------------------------------------
-- 1. View access
-- Can the signed-in person view backoffice page p_page at this location? Mirrors app.can_write.
create or replace function app.can_view(p_location uuid, p_page text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when m.role = 'owner' then true
      when m.role <> 'admin' then false
      when not exists (select 1 from public.member_locations ml where ml.location_id = l.id and ml.user_id = auth.uid()) then false
      when not exists (select 1 from public.employees e where e.account_id = l.account_id and e.user_id = auth.uid()) then true
      else coalesce(p_page = any ((app.my_role(l.account_id)).backoffice_pages), false)
    end
    from public.locations l
    join public.members m on m.account_id = l.account_id and m.user_id = auth.uid()
    where l.id = p_location), false)
$$;

create or replace function app.can_view_any(p_location uuid, p_pages text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from unnest(p_pages) pg where app.can_view(p_location, pg))
$$;

-- The locations in p_locations where any of p_pages may be viewed.
create or replace function app.viewable_locations(p_locations uuid[], p_pages text[]) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(l), '{}') from unnest(p_locations) l where app.can_view_any(l, p_pages)
$$;

-- Report RPCs only cover locations where the matching page may be viewed.
select app.patch_function('public.report_sales(uuid[], timestamptz, timestamptz, text)',
  'any (p_locations)', 'any (app.viewable_locations(p_locations, array[''dashboard'', ''reports_sales'']))');
select app.patch_function('public.report_transactions(uuid[], timestamptz, timestamptz, text, text, int, int)',
  'any (p_locations)', 'any (app.viewable_locations(p_locations, array[''reports_transactions'']))');
select app.patch_function('public.report_shifts(uuid[], timestamptz, timestamptz)',
  'any (p_locations)', 'any (app.viewable_locations(p_locations, array[''reports_shifts'']))');

-- Direct reads of the sales tables: any report page (the shift report counts sales per shift);
-- open bills' tables are also read by the Tables settings page.
do $$
declare t text;
begin
  foreach t in array array['orders', 'order_lines', 'order_discounts', 'order_voids', 'payments', 'refunds', 'refund_lines'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.can_view_any(location_id, %L))',
      t || '_select', t, case when t = 'orders'
        then '{dashboard,reports_sales,reports_transactions,reports_shifts,settings_tables}'
        else '{dashboard,reports_sales,reports_transactions,reports_shifts}' end);
  end loop;
  foreach t in array array['shifts', 'cash_movements'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.can_view(location_id, ''reports_shifts''))', t || '_select', t);
  end loop;
end $$;

-- Staff list: owner sees everyone; others see their own slot, plus staff at their outlets when
-- their role can open an employee page.
create or replace function app.can_see_employee(p_employee uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.employees e
    where e.id = p_employee and (
      coalesce(app.account_role(e.account_id) = 'owner', false)
      or e.user_id = auth.uid()
      or (app.account_role(e.account_id) is not null
          and (app.my_role(e.account_id) is null
               or (app.my_role(e.account_id)).backoffice_pages && array['employees', 'employee_pin', 'employee_roles'])
          and exists (select 1 from public.employee_locations el
                      join public.member_locations ml on ml.location_id = el.location_id and ml.user_id = auth.uid()
                      where el.employee_id = e.id))))
$$;
drop policy employees_select on public.employees;
create policy employees_select on public.employees for select to authenticated using (app.can_see_employee(id));
drop policy employee_locations_select on public.employee_locations;
create policy employee_locations_select on public.employee_locations for select to authenticated using (app.can_see_employee(employee_id));

-- ---------------------------------------------------------------------------------------------
-- 2. Memberships: created only by onboarding / claiming an employee slot (definer functions).
drop policy members_insert on public.members;
create policy members_leave on public.members for delete to authenticated
  using (user_id = auth.uid() and role <> 'owner');
drop policy member_locations_write on public.member_locations;
create policy member_locations_write on public.member_locations for all to authenticated
  using (coalesce(app.account_role(account_id) = 'owner', false))
  with check (coalesce(app.account_role(account_id) = 'owner', false)
    and exists (select 1 from public.members m where m.account_id = member_locations.account_id and m.user_id = member_locations.user_id));

-- ---------------------------------------------------------------------------------------------
-- 3. Backoffice access (a role with backoffice pages and a login) is given only by the owner:
-- switching to such a role, or switching such a person back on.
create or replace function app.employees_role_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(app.account_role(new.account_id) = 'owner', false) then return new; end if;
  if exists (select 1 from public.roles where id = new.role_id and cardinality(backoffice_pages) > 0) then
    if new.role_id is distinct from old.role_id then
      raise exception 'Only the owner can give a role with backoffice access' using errcode = '42501';
    end if;
    if new.is_active and not old.is_active and (new.email is not null or new.user_id is not null) then
      raise exception 'Only the owner can switch backoffice access back on' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger employees_role_guard on public.employees;
create trigger employees_role_guard before update of role_id, is_active on public.employees
  for each row execute function app.employees_role_guard();

-- ---------------------------------------------------------------------------------------------
-- 4. Change log coverage.
create trigger customers_audit after insert or update or delete on public.customers
  for each row execute function app.audit_change();

-- Package choices: only through save_package (which logs one summary entry), and only with
-- write access to Items.
do $$
declare t text;
begin
  foreach t in array array['package_groups', 'package_options'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
  end loop;
end $$;
select app.patch_function('public.save_package(uuid, jsonb)',
  'not app.can_manage_location(v_item.location_id)', 'not app.can_write(v_item.location_id, ''library_items'')');

-- Per-sales-type prices and modifier links are rewritten on every item save, so save_item logs
-- one entry when they actually changed.
create or replace function app.item_links(p_item uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sales type prices', coalesce((select jsonb_object_agg(coalesce(nullif(v.name, ''), 'default') || ' / ' || st.name, p.price order by v.sort_order, st.name)
       from public.variant_sales_type_prices p join public.item_variants v on v.id = p.variant_id
       join public.sales_types st on st.id = p.sales_type_id where v.item_id = p_item), '{}'),
    'modifier groups', coalesce((select jsonb_agg(ms.name order by ims.sort_order)
       from public.item_modifier_sets ims join public.modifier_sets ms on ms.id = ims.modifier_set_id where ims.item_id = p_item), '[]'))
$$;
select app.patch_function('public.save_item(jsonb)',
  '  v_i         int := 0;
begin
',
  '  v_i         int := 0;
  v_links     jsonb;
begin
  if v_id is not null then v_links := app.item_links(v_id); end if;
');
select app.patch_function('public.save_item(jsonb)',
  '  return v_id;
end',
  '  if v_links is not null then
    declare
      v_new jsonb := app.item_links(v_id);
      v_changes jsonb := ''{}'';
      k text;
    begin
      for k in select jsonb_object_keys(v_new) loop
        if v_new->k is distinct from v_links->k then
          v_changes := v_changes || jsonb_build_object(k, jsonb_build_array(v_links->k, v_new->k));
        end if;
      end loop;
      if v_changes <> ''{}'' then
        perform app.audit_note(v_account, v_location, ''item_links'', ''changed'', v_id, trim(p_item->>''name''), v_changes);
      end if;
    end;
  end if;
  return v_id;
end');

-- ---------------------------------------------------------------------------------------------
-- 5. Refund lines.
select app.patch_function('public.submit_refund(uuid, jsonb)',
  '  for v_line in select * from jsonb_array_elements(coalesce(p->''lines'', ''[]'')) loop',
  '  if exists (select 1 from jsonb_array_elements(coalesce(p->''lines'', ''[]'')) l
             group by l->>''order_line_id'' having count(*) > 1) then
    raise exception ''each sale line can appear only once in a refund'' using errcode = ''22023'';
  end if;
  for v_line in select * from jsonb_array_elements(coalesce(p->''lines'', ''[]'')) loop');
select app.patch_function('public.submit_refund(uuid, jsonb)',
  '(l->>''order_line_id'')::uuid, nullif(l->>''item_id'', '''')::uuid,',
  '(l->>''order_line_id'')::uuid, (select ol.item_id from public.order_lines ol where ol.id = (l->>''order_line_id'')::uuid and ol.order_id = v_order.id),');

-- ---------------------------------------------------------------------------------------------
-- 6. PIN changes by non-owners: at most 20 an hour per person.
select app.patch_function('public.set_employee_pin(uuid, text)',
  '  if p_pin !~ ',
  '  if not coalesce(app.account_role(v_account) = ''owner'', false)
     and (select count(*) from public.audit_log a where a.account_id = v_account and a.user_id = auth.uid()
          and a.table_name = ''employees'' and a.changes ? ''pin'' and a.at > now() - interval ''1 hour'') >= 20 then
    raise exception ''Too many PIN changes. Try again in an hour.'' using errcode = ''P0001'';
  end if;
  if p_pin !~ ');
