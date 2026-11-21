-- Edit tables and areas from the tablet.
--
-- Online only (the floor plan is shared by every tablet, so it isn't queued offline).
-- The tablet checks the employee's `tables_manage` permission; the server checks the device
-- (registered, not revoked, signed-in user can manage its location) and keeps everything inside
-- the device's location. Returns the fresh floor plan so the tablet updates at once.
--
-- p: { kind: 'area' | 'table', op: 'save' | 'delete', id?, name?, seats?, shape?, area_id? }

-- Managers get the new permission by default (new accounts and existing Manager system roles).
create or replace function app.init_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.roles (account_id, name, is_system, permissions) values
    (new.id, 'Manager', true, array[
      'charge', 'bill_print', 'open_bills_manage', 'void_items', 'discounts_apply', 'refunds_issue',
      'receipts_resend', 'cash_in_out', 'shift_view_details', 'shift_history_view', 'activity_view',
      'customers_edit', 'items_manage', 'favorites_manage', 'tables_manage']),
    (new.id, 'Cashier', true, array[
      'charge', 'bill_print', 'open_bills_manage', 'discounts_apply', 'receipts_resend', 'activity_view']);
  return new;
end $$;

update public.roles set permissions = array_append(permissions, 'tables_manage')
where is_system and name = 'Manager' and not ('tables_manage' = any (permissions));

create or replace function app.floor_plan(p_loc uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'table_areas', coalesce((select jsonb_agg(jsonb_build_object('id', ta.id, 'name', ta.name) order by ta.sort_order, ta.name)
                 from public.table_areas ta where ta.location_id = p_loc and ta.is_active), '[]'),
    'tables', coalesce((select jsonb_agg(jsonb_build_object('id', dt.id, 'name', dt.name, 'area_id', dt.area_id, 'seats', dt.seats, 'shape', dt.shape)
                   order by dt.sort_order, dt.name)
                 from public.dining_tables dt where dt.location_id = p_loc and dt.is_active), '[]'))
$$;

create or replace function public.pos_table_setup(p_device uuid, p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dev   public.devices;
  v_kind  text := p->>'kind';
  v_op    text := coalesce(p->>'op', 'save');
  v_id    uuid := nullif(p->>'id', '')::uuid;
  v_name  text := trim(coalesce(p->>'name', ''));
  v_area  uuid := nullif(p->>'area_id', '')::uuid;
  v_busy  text;
begin
  select * into v_dev from public.devices where id = p_device and revoked_at is null;
  if v_dev.id is null or not app.can_manage_location(v_dev.location_id) then
    raise exception 'device not registered or not allowed' using errcode = '42501';
  end if;

  if v_kind = 'area' then
    if v_op = 'delete' then
      -- Tables in the area stay, without an area.
      delete from public.table_areas where id = v_id and location_id = v_dev.location_id;
    else
      if length(v_name) not between 1 and 40 then raise exception 'Area name must be 1–40 characters' using errcode = '22023'; end if;
      if exists (select 1 from public.table_areas where location_id = v_dev.location_id and lower(name) = lower(v_name) and id is distinct from v_id) then
        raise exception 'There is already an area called %', v_name using errcode = '23505';
      end if;
      if v_id is null then
        insert into public.table_areas (account_id, location_id, name, sort_order)
        values (v_dev.account_id, v_dev.location_id, v_name,
                coalesce((select max(sort_order) + 1 from public.table_areas where location_id = v_dev.location_id), 0));
      else
        update public.table_areas set name = v_name where id = v_id and location_id = v_dev.location_id;
        if not found then raise exception 'Area not found' using errcode = 'P0002'; end if;
      end if;
    end if;

  elsif v_kind = 'table' then
    if v_op = 'delete' then
      select t.name into v_busy from public.dining_tables t
      where t.id = v_id and t.location_id = v_dev.location_id
        and exists (select 1 from public.orders o where o.table_id = t.id and o.status = 'open');
      if v_busy is not null then
        raise exception 'Table % has an open bill. Move or close it first.', v_busy using errcode = '55006';
      end if;
      delete from public.dining_tables where id = v_id and location_id = v_dev.location_id;
    else
      if length(v_name) not between 1 and 20 then raise exception 'Table name must be 1–20 characters' using errcode = '22023'; end if;
      if coalesce((p->>'seats')::int, 0) not between 1 and 50 then raise exception 'Seats must be 1–50' using errcode = '22023'; end if;
      if v_area is not null and not exists (select 1 from public.table_areas where id = v_area and location_id = v_dev.location_id) then
        raise exception 'Area not found' using errcode = 'P0002';
      end if;
      if exists (select 1 from public.dining_tables where location_id = v_dev.location_id and lower(name) = lower(v_name) and id is distinct from v_id) then
        raise exception 'There is already a table called %', v_name using errcode = '23505';
      end if;
      if v_id is null then
        insert into public.dining_tables (account_id, location_id, area_id, name, seats, shape, sort_order)
        values (v_dev.account_id, v_dev.location_id, v_area, v_name, (p->>'seats')::int,
                coalesce(nullif(p->>'shape', ''), 'square')::app.table_shape,
                coalesce((select max(sort_order) + 1 from public.dining_tables where location_id = v_dev.location_id), 0));
      else
        update public.dining_tables
          set name = v_name, seats = (p->>'seats')::int, area_id = v_area,
              shape = coalesce(nullif(p->>'shape', ''), shape::text)::app.table_shape
        where id = v_id and location_id = v_dev.location_id;
        if not found then raise exception 'Table not found' using errcode = 'P0002'; end if;
        -- Open bills keep their table_id; tablets show the table's current name from the floor plan.
      end if;
    end if;
  else
    raise exception 'kind must be area or table' using errcode = '22023';
  end if;

  update public.devices set last_seen_at = now() where id = p_device;
  return app.floor_plan(v_dev.location_id);
end $$;

revoke execute on function public.pos_table_setup(uuid, jsonb) from public, anon;
grant execute on function public.pos_table_setup(uuid, jsonb) to authenticated;
