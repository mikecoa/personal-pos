-- Location logo: a small image (data URL, resized to at most 256 px in the backoffice) shown on
-- the tablet's side menu and lock screen. Stored on the row so the tablet keeps it offline with
-- the rest of the catalog.
alter table public.locations add column logo text
  constraint locations_logo_format check (logo is null or (logo ~ '^data:image/(png|jpeg|webp);base64,' and length(logo) <= 300000));

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
    'location', (select jsonb_build_object('id', l.id, 'account_id', l.account_id, 'name', l.name, 'address', l.address, 'phone', l.phone, 'logo', l.logo)
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
    'quick_notes', coalesce((select jsonb_agg(jsonb_build_object('id', qn.id, 'text', qn.text, 'category_ids', to_jsonb(qn.category_ids)) order by qn.sort_order, qn.text)
                 from public.quick_notes qn where qn.location_id = v_loc), '[]'),
    'customers', coalesce((select jsonb_agg(jsonb_build_object('id', cu.id, 'name', cu.name, 'phone', cu.phone, 'email', cu.email,
                   'note', cu.note, 'discount_id', cu.discount_id) order by lower(cu.name))
                 from public.customers cu where cu.location_id = v_loc), '[]'),
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
