-- Change several tables at once from the tablet (multi-select).
--
-- p: { op: 'update', ids: [...], seats?: int, area_id?: uuid|null, set_area?: bool }
--    { op: 'delete', ids: [...] }
-- All or nothing: if any selected table has an open bill, a delete is refused as a whole.
-- Tables outside the device's location are ignored. Returns the fresh floor plan.

create or replace function public.pos_tables_bulk(p_device uuid, p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dev   public.devices;
  v_ids   uuid[] := array(select jsonb_array_elements_text(coalesce(p->'ids', '[]'))::uuid);
  v_area  uuid := nullif(p->>'area_id', '')::uuid;
  v_busy  text;
begin
  select * into v_dev from public.devices where id = p_device and revoked_at is null;
  if v_dev.id is null or not app.can_manage_location(v_dev.location_id) then
    raise exception 'device not registered or not allowed' using errcode = '42501';
  end if;
  if cardinality(v_ids) = 0 or cardinality(v_ids) > 200 then
    raise exception 'Select 1–200 tables' using errcode = '22023';
  end if;

  if p->>'op' = 'delete' then
    select string_agg(t.name, ', ' order by t.name) into v_busy from public.dining_tables t
    where t.id = any (v_ids) and t.location_id = v_dev.location_id
      and exists (select 1 from public.orders o where o.table_id = t.id and o.status = 'open');
    if v_busy is not null then
      raise exception 'Open bill on %. Move or close it first.', v_busy using errcode = '55006';
    end if;
    delete from public.dining_tables where id = any (v_ids) and location_id = v_dev.location_id;

  elsif p->>'op' = 'update' then
    if p ? 'seats' and coalesce((p->>'seats')::int, 0) not between 1 and 50 then
      raise exception 'Seats must be 1–50' using errcode = '22023';
    end if;
    if coalesce((p->>'set_area')::boolean, false) and v_area is not null
       and not exists (select 1 from public.table_areas where id = v_area and location_id = v_dev.location_id) then
      raise exception 'Area not found' using errcode = 'P0002';
    end if;
    update public.dining_tables set
      seats   = case when p ? 'seats' then (p->>'seats')::int else seats end,
      area_id = case when coalesce((p->>'set_area')::boolean, false) then v_area else area_id end
    where id = any (v_ids) and location_id = v_dev.location_id;
  else
    raise exception 'op must be update or delete' using errcode = '22023';
  end if;

  update public.devices set last_seen_at = now() where id = p_device;
  return app.floor_plan(v_dev.location_id);
end $$;

revoke execute on function public.pos_tables_bulk(uuid, jsonb) from public, anon;
grant execute on function public.pos_tables_bulk(uuid, jsonb) to authenticated;
