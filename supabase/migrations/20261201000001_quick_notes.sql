-- Quick notes: the one-tap note buttons on the tablet (e.g. "Less sugar", "Tanpa Sayur").
--
-- One list per location, edited in the backoffice (Library → Quick notes) or from the tablet's
-- note pop-up by people allowed to edit the menu. A note can be limited to some categories
-- (category_ids); an empty list means it shows for every item. Tablets get the list with the
-- catalog.

create table public.quick_notes (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null,
  location_id   uuid not null,
  text          text not null check (length(trim(text)) between 1 and 40),
  category_ids  uuid[] not null default '{}',
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade
);
create unique index quick_notes_text_uq on public.quick_notes (location_id, lower(text));

alter table public.quick_notes enable row level security;
create policy quick_notes_select on public.quick_notes for select to authenticated using (app.location_role(location_id) is not null);
create policy quick_notes_insert on public.quick_notes for insert to authenticated with check (app.can_manage_location(location_id));
create policy quick_notes_update on public.quick_notes for update to authenticated using (app.can_manage_location(location_id)) with check (app.can_manage_location(location_id));
create policy quick_notes_delete on public.quick_notes for delete to authenticated using (app.can_manage_location(location_id));
create trigger quick_notes_touch before update on public.quick_notes for each row execute function app.touch_updated_at();
create trigger quick_notes_freeze_scope before update on public.quick_notes for each row execute function app.freeze_scope();

-- Replace the location's list from the tablet, in the order given.
-- p: [{ id?, text, category_ids? }, …]  (category_ids left out = keep what the note had)
create or replace function public.pos_save_quick_notes(p_device uuid, p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dev   public.devices := app.pos_device(p_device);
  v_note  jsonb;
  v_i     int := 0;
  v_text  text;
  v_id    uuid;
  v_keep  uuid[] := '{}';
begin
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) > 60 then
    raise exception 'Up to 60 quick notes' using errcode = '22023';
  end if;
  if (select count(distinct lower(trim(x->>'text'))) from jsonb_array_elements(p) x) <> jsonb_array_length(p) then
    raise exception 'Each quick note must be different' using errcode = '23505';
  end if;
  for v_note in select * from jsonb_array_elements(p) loop
    v_text := trim(coalesce(v_note->>'text', ''));
    if length(v_text) not between 1 and 40 then raise exception 'Notes must be 1–40 characters' using errcode = '22023'; end if;
    v_id := (select id from public.quick_notes where id = nullif(v_note->>'id', '')::uuid and location_id = v_dev.location_id);
    if v_id is not null then v_keep := v_keep || v_id; end if;
  end loop;
  -- Remove notes that are no longer listed first, so a new one may reuse their text.
  delete from public.quick_notes where location_id = v_dev.location_id and not (id = any (v_keep));
  for v_note in select * from jsonb_array_elements(p) loop
    v_i := v_i + 1;
    v_text := trim(v_note->>'text');
    v_id := (select id from public.quick_notes where id = nullif(v_note->>'id', '')::uuid and location_id = v_dev.location_id);
    if v_id is null then
      insert into public.quick_notes (account_id, location_id, text, sort_order, category_ids)
      values (v_dev.account_id, v_dev.location_id, v_text, v_i,
              coalesce(array(select (c.id)::uuid from jsonb_array_elements_text(v_note->'category_ids') c(id)
                             join public.categories k on k.id = (c.id)::uuid and k.location_id = v_dev.location_id), '{}'));
    else
      update public.quick_notes set text = v_text, sort_order = v_i,
        category_ids = case when v_note ? 'category_ids' then coalesce(array(select (c.id)::uuid from jsonb_array_elements_text(v_note->'category_ids') c(id)
                             join public.categories k on k.id = (c.id)::uuid and k.location_id = v_dev.location_id), '{}') else category_ids end
      where id = v_id;
    end if;
  end loop;
  return coalesce((select jsonb_agg(jsonb_build_object('id', qn.id, 'text', qn.text, 'category_ids', to_jsonb(qn.category_ids)) order by qn.sort_order, qn.text)
                   from public.quick_notes qn where qn.location_id = v_dev.location_id), '[]');
end $$;

revoke execute on function public.pos_save_quick_notes(uuid, jsonb) from public, anon;
grant execute on function public.pos_save_quick_notes(uuid, jsonb) to authenticated;

-- pos_catalog: adds the location's quick notes.
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
