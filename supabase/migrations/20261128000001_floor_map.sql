-- Floor map: each table can have a place on its area's board (grid cell pos_x, pos_y).
--
-- Cells are whole numbers so tables snap into a tidy grid. A table with no position is placed by
-- the tablet in the first free cell. Moving a table to another area clears its position (the old
-- cell means nothing there). The tablet saves a whole area's layout at once (pos_tables_layout).

alter table public.dining_tables
  add column pos_x smallint check (pos_x between 0 and 49),
  add column pos_y smallint check (pos_y between 0 and 49),
  add constraint dining_tables_pos_both check ((pos_x is null) = (pos_y is null));

create or replace function app.clear_pos_on_area_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.area_id is distinct from old.area_id and new.pos_x is not distinct from old.pos_x and new.pos_y is not distinct from old.pos_y then
    new.pos_x := null; new.pos_y := null;
  end if;
  return new;
end $$;
create trigger dining_tables_clear_pos before update of area_id on public.dining_tables
  for each row execute function app.clear_pos_on_area_change();

create or replace function app.floor_plan(p_loc uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'table_areas', coalesce((select jsonb_agg(jsonb_build_object('id', ta.id, 'name', ta.name) order by ta.sort_order, ta.name)
                 from public.table_areas ta where ta.location_id = p_loc and ta.is_active), '[]'),
    'tables', coalesce((select jsonb_agg(jsonb_build_object('id', dt.id, 'name', dt.name, 'area_id', dt.area_id, 'seats', dt.seats, 'shape', dt.shape,
                   'pos_x', dt.pos_x, 'pos_y', dt.pos_y) order by dt.sort_order, dt.name)
                 from public.dining_tables dt where dt.location_id = p_loc and dt.is_active), '[]'))
$$;

-- p: [{ id, x, y }, …]  (x/y null = let the tablet place it)
create or replace function public.pos_tables_layout(p_device uuid, p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_dev public.devices;
begin
  select * into v_dev from public.devices where id = p_device and revoked_at is null;
  if v_dev.id is null or not app.can_manage_location(v_dev.location_id) then
    raise exception 'device not registered or not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) > 500 then
    raise exception 'layout must be a list of up to 500 tables' using errcode = '22023';
  end if;
  update public.dining_tables t
    set pos_x = nullif(e->>'x', '')::smallint, pos_y = nullif(e->>'y', '')::smallint
  from jsonb_array_elements(p) e
  where t.id = (e->>'id')::uuid and t.location_id = v_dev.location_id;
  update public.devices set last_seen_at = now() where id = p_device;
  return app.floor_plan(v_dev.location_id);
end $$;

revoke execute on function public.pos_tables_layout(uuid, jsonb) from public, anon;
grant execute on function public.pos_tables_layout(uuid, jsonb) to authenticated;

-- pos_catalog: tables now carry pos_x / pos_y.
create or replace function public.pos_catalog(p_device uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_loc  uuid;
  v_doc  jsonb;
begin
  select location_id into v_loc from public.devices where id = p_device and revoked_at is null;
  if v_loc is null or not app.can_manage_location(v_loc) then
    raise exception 'device not registered or not allowed' using errcode = '42501';
  end if;
  update public.devices set last_seen_at = now() where id = p_device;

  select jsonb_build_object(
    'synced_at', now(),
    'location', (select jsonb_build_object('id', l.id, 'account_id', l.account_id, 'name', l.name, 'address', l.address, 'phone', l.phone)
                 from public.locations l where l.id = v_loc),
    'settings', (select to_jsonb(s) - 'account_id' - 'updated_at' from public.location_settings s where s.location_id = v_loc),
    'receipt',  (select to_jsonb(r) - 'account_id' - 'updated_at' from public.receipt_profiles r where r.location_id = v_loc),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'sort_order', c.sort_order) order by c.sort_order, c.name)
                 from public.categories c where c.location_id = v_loc), '[]'),
    'sales_types', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'sort_order', t.sort_order) order by t.sort_order, t.name)
                 from public.sales_types t where t.location_id = v_loc and t.is_active), '[]'),
    'payment_methods', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'kind', m.kind, 'sort_order', m.sort_order) order by m.sort_order, m.name)
                 from public.payment_methods m where m.location_id = v_loc and m.is_active), '[]'),
    'discounts', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'kind', d.kind, 'value', d.value, 'scope', d.scope) order by d.sort_order, d.name)
                 from public.discounts d where d.location_id = v_loc and d.is_active), '[]'),
    'modifier_sets', coalesce((select jsonb_agg(jsonb_build_object('id', ms.id, 'name', ms.name, 'min_select', ms.min_select, 'max_select', ms.max_select,
                   'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'price', o.price) order by o.sort_order)
                                        from public.modifier_options o where o.modifier_set_id = ms.id and o.is_active), '[]')) order by ms.sort_order, ms.name)
                 from public.modifier_sets ms where ms.location_id = v_loc), '[]'),
    'table_areas', coalesce((select jsonb_agg(jsonb_build_object('id', ta.id, 'name', ta.name) order by ta.sort_order, ta.name)
                 from public.table_areas ta where ta.location_id = v_loc and ta.is_active), '[]'),
    'tables', coalesce((select jsonb_agg(jsonb_build_object('id', dt.id, 'name', dt.name, 'area_id', dt.area_id, 'seats', dt.seats, 'shape', dt.shape,
                   'pos_x', dt.pos_x, 'pos_y', dt.pos_y)
                   order by dt.sort_order, dt.name)
                 from public.dining_tables dt where dt.location_id = v_loc and dt.is_active), '[]'),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                   'id', i.id, 'name', i.name, 'category_id', i.category_id, 'image_url', i.image_url,
                   'track_stock', i.track_stock, 'stock', i.stock,
                   'modifier_set_ids', coalesce((select jsonb_agg(ims.modifier_set_id order by ims.sort_order) from public.item_modifier_sets ims where ims.item_id = i.id), '[]'),
                   'variants', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'price', v.price, 'sku', v.sku,
                       'prices', coalesce((select jsonb_object_agg(p.sales_type_id, p.price) from public.variant_sales_type_prices p where p.variant_id = v.id), '{}'))
                       order by v.sort_order) from public.item_variants v where v.item_id = i.id and v.is_active), '[]')
                 ) order by i.sort_order, i.name)
                 from public.items i where i.location_id = v_loc and i.is_active), '[]'),
    'employees', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name,
                   'pin_lookup', e.pin_lookup, 'pin_hash', case when e.pin_lookup is null then e.pin_hash end,
                   'role', r.name, 'permissions', to_jsonb(r.permissions)) order by e.name)
                 from public.employees e join public.roles r on r.id = e.role_id
                 join public.employee_locations el on el.employee_id = e.id and el.location_id = v_loc
                 where e.is_active and e.pin_hash is not null), '[]')
  ) into v_doc;
  return v_doc;
end $$;
