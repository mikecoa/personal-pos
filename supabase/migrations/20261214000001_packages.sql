-- Packages ("Paket A"): a menu item made of choices from other menu items, e.g.
--   Choose 1 from: Nasi Goreng Ayam, Mie Goreng Ayam, ...   Choose 1 from: Es Teh Manis, Air Mineral, ...
-- A package is an ordinary item (own price, category) with one or more choice groups. Each option is
-- an existing item with an optional extra charge. The tablet gets the groups as "choose exactly N"
-- option groups, and each choice on an order line carries the chosen item's id, so selling (and
-- refunding with restock) a package moves the stock of the items chosen.

create table public.package_groups (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null,
  location_id  uuid not null,
  item_id      uuid not null,                         -- the package
  name         text not null check (length(trim(name)) between 1 and 60),
  choose       smallint not null default 1 check (choose between 1 and 10),
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade,
  foreign key (item_id, location_id) references public.items (id, location_id) on delete cascade,
  unique (id, location_id)
);
create index package_groups_item on public.package_groups (item_id);

create table public.package_options (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null,
  location_id  uuid not null,
  group_id     uuid not null,
  item_id      uuid not null,                         -- the item that can be chosen
  price        bigint not null default 0 check (price between 0 and 1000000000),   -- extra charge
  sort_order   int not null default 0,
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade,
  foreign key (group_id, location_id) references public.package_groups (id, location_id) on delete cascade,
  foreign key (item_id, location_id) references public.items (id, location_id) on delete cascade,
  unique (group_id, item_id)
);
create index package_options_group on public.package_options (group_id);

do $$
declare t text;
begin
  foreach t in array array['package_groups', 'package_options'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.location_role(location_id) is not null)', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app.can_manage_location(location_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app.can_manage_location(location_id)) with check (app.can_manage_location(location_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (app.can_manage_location(location_id))', t || '_delete', t);
    execute format('create trigger %I before update on public.%I for each row execute function app.freeze_scope()', t || '_freeze_scope', t);
  end loop;
end $$;
create trigger package_groups_touch before update on public.package_groups for each row execute function app.touch_updated_at();

-- Replace a package's choice groups in one go. p: [{ name, choose, options: [{ item_id, price }] }]
-- (empty = not a package any more). Runs as the caller, so only managers of the location can do it.
create or replace function public.save_package(p_item uuid, p jsonb)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_item  public.items;
  v_group jsonb;
  v_gid   uuid;
  v_i     int := 0;
  v_n     int;
begin
  select * into v_item from public.items where id = p_item;
  if v_item.id is null or not app.can_manage_location(v_item.location_id) then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p) is distinct from 'array' or jsonb_array_length(p) > 20 then
    raise exception 'A package can have up to 20 choice groups' using errcode = '22023';
  end if;
  if jsonb_array_length(p) > 0 and exists (select 1 from public.package_options where item_id = p_item) then
    raise exception 'This item is a choice inside another package, so it can''t be a package itself' using errcode = '22023';
  end if;
  delete from public.package_groups where item_id = p_item;
  for v_group in select * from jsonb_array_elements(p) loop
    v_i := v_i + 1;
    if length(trim(coalesce(v_group->>'name', ''))) not between 1 and 60 then
      raise exception 'Every choice group needs a name (up to 60 characters)' using errcode = '22023';
    end if;
    select count(distinct o->>'item_id') into v_n from jsonb_array_elements(coalesce(v_group->'options', '[]')) o;
    if v_n = 0 then raise exception 'Choice group "%" has no items to choose from', v_group->>'name' using errcode = '22023'; end if;
    if coalesce((v_group->>'choose')::int, 1) not between 1 and least(10, v_n) then
      raise exception 'Choice group "%": pick between 1 and % of its % items', v_group->>'name', least(10, v_n), v_n using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_group->'options') o
               left join public.items ci on ci.id = (o->>'item_id')::uuid and ci.location_id = v_item.location_id
               where ci.id is null or ci.id = p_item
                  or exists (select 1 from public.package_groups x where x.item_id = ci.id)) then
      raise exception 'Choices must be other menu items of this location (not packages)' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_group->'options') o
               where coalesce((o->>'price')::bigint, 0) not between 0 and 1000000000) then
      raise exception 'Extra charges must be between 0 and 1.000.000.000' using errcode = '22023';
    end if;
    insert into public.package_groups (account_id, location_id, item_id, name, choose, sort_order)
    values (v_item.account_id, v_item.location_id, p_item, trim(v_group->>'name'), coalesce((v_group->>'choose')::int, 1), v_i)
    returning id into v_gid;
    insert into public.package_options (account_id, location_id, group_id, item_id, price, sort_order)
    select v_item.account_id, v_item.location_id, v_gid, d.item_id, d.price, d.ord
    from (select distinct on ((o->>'item_id')::uuid) (o->>'item_id')::uuid as item_id,
                 coalesce((o->>'price')::bigint, 0) as price, ord::int as ord
          from jsonb_array_elements(v_group->'options') with ordinality as x(o, ord)
          order by (o->>'item_id')::uuid, ord) d;
  end loop;
end $$;
revoke execute on function public.save_package(uuid, jsonb) from public, anon;
grant execute on function public.save_package(uuid, jsonb) to authenticated;

-- save_item: ignore package groups in modifier_set_ids.
CREATE OR REPLACE FUNCTION public.save_item(p_item jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id        uuid := nullif(p_item->>'id', '')::uuid;
  v_location  uuid := (p_item->>'location_id')::uuid;
  v_account   uuid;
  v_variant   jsonb;
  v_var_id    uuid;
  v_price     record;
  v_i         int := 0;
begin
  select account_id into v_account from public.locations where id = v_location;
  if v_account is null then raise exception 'location not found' using errcode = '42501'; end if;

  if jsonb_array_length(coalesce(p_item->'variants', '[]')) = 0 then
    raise exception 'an item needs at least one price' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.items (account_id, location_id, category_id, name, description, image_url,
      is_active, track_stock, stock, stock_alert, avg_cost)
    values (v_account, v_location, nullif(p_item->>'category_id', '')::uuid, trim(p_item->>'name'),
      nullif(trim(p_item->>'description'), ''), nullif(p_item->>'image_url', ''),
      coalesce((p_item->>'is_active')::boolean, true),
      coalesce((p_item->>'track_stock')::boolean, false),
      coalesce((p_item->>'stock')::int, 0),
      nullif(p_item->>'stock_alert', '')::int,
      nullif(p_item->>'avg_cost', '')::bigint)
    returning id into v_id;
  else
    -- Stock is only set on creation; later changes go through stock adjustments.
    update public.items set
      category_id = nullif(p_item->>'category_id', '')::uuid,
      name        = trim(p_item->>'name'),
      description = nullif(trim(p_item->>'description'), ''),
      image_url   = nullif(p_item->>'image_url', ''),
      is_active   = coalesce((p_item->>'is_active')::boolean, true),
      track_stock = coalesce((p_item->>'track_stock')::boolean, false),
      stock_alert = nullif(p_item->>'stock_alert', '')::int,
      avg_cost    = nullif(p_item->>'avg_cost', '')::bigint
    where id = v_id and location_id = v_location;
    if not found then raise exception 'item not found' using errcode = '42501'; end if;
  end if;

  -- Remove variants that are no longer listed BEFORE upserting, so a new variant may
  -- reuse the name of one that was just removed.
  delete from public.item_variants
  where item_id = v_id
    and id not in (
      select nullif(v->>'id', '')::uuid from jsonb_array_elements(p_item->'variants') v
      where nullif(v->>'id', '') is not null
    );

  for v_variant in select * from jsonb_array_elements(p_item->'variants') loop
    v_i := v_i + 1;
    v_var_id := nullif(v_variant->>'id', '')::uuid;
    if v_var_id is null then
      insert into public.item_variants (account_id, location_id, item_id, name, price, sku, sort_order)
      values (v_account, v_location, v_id, coalesce(trim(v_variant->>'name'), ''),
        (v_variant->>'price')::bigint, nullif(trim(v_variant->>'sku'), ''), v_i)
      returning id into v_var_id;
    else
      update public.item_variants set
        name = coalesce(trim(v_variant->>'name'), ''), price = (v_variant->>'price')::bigint,
        sku = nullif(trim(v_variant->>'sku'), ''), sort_order = v_i
      where id = v_var_id and item_id = v_id;
      if not found then raise exception 'variant not found' using errcode = '42501'; end if;
    end if;

    delete from public.variant_sales_type_prices where variant_id = v_var_id;
    for v_price in select key, value from jsonb_each_text(coalesce(v_variant->'prices', '{}')) loop
      if v_price.value is not null and v_price.value <> '' then
        insert into public.variant_sales_type_prices (account_id, location_id, variant_id, sales_type_id, price)
        values (v_account, v_location, v_var_id, v_price.key::uuid, v_price.value::bigint);
      end if;
    end loop;
  end loop;

  delete from public.item_modifier_sets where item_id = v_id;
  insert into public.item_modifier_sets (account_id, location_id, item_id, modifier_set_id, sort_order)
  select v_account, v_location, v_id, s.id::uuid, s.ord
  from jsonb_array_elements_text(coalesce(p_item->'modifier_set_ids', '[]')) with ordinality as s(id, ord)
  -- only real modifier groups (the catalog also lists a package's choice groups there)
  where exists (select 1 from public.modifier_sets ms where ms.id = s.id::uuid and ms.location_id = v_location);

  return v_id;
end $function$;

-- pos_catalog: package groups as option groups; items list theirs first.
CREATE OR REPLACE FUNCTION public.pos_catalog(p_device uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                 from public.modifier_sets ms where ms.location_id = v_loc), '[]')
      -- Package choice groups, as "choose exactly N" groups; each option is a menu item (item_id: its stock is used).
      || coalesce((select jsonb_agg(jsonb_build_object('id', pg.id, 'name', pg.name, 'min_select', pg.choose, 'max_select', pg.choose, 'package', true,
                   'options', coalesce((select jsonb_agg(jsonb_build_object('id', po.id, 'name', ci.name, 'price', po.price, 'item_id', po.item_id) order by po.sort_order)
                                        from public.package_options po join public.items ci on ci.id = po.item_id and ci.is_active
                                        where po.group_id = pg.id), '[]')) order by pg.sort_order)
                 from public.package_groups pg where pg.location_id = v_loc), '[]'),
    'table_areas', coalesce((select jsonb_agg(jsonb_build_object('id', ta.id, 'name', ta.name, 'grid_cols', ta.grid_cols, 'grid_rows', ta.grid_rows) order by ta.sort_order, ta.name)
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
                   'modifier_set_ids', coalesce((select jsonb_agg(pg.id order by pg.sort_order) from public.package_groups pg where pg.item_id = i.id), '[]')
                                    || coalesce((select jsonb_agg(ims.modifier_set_id order by ims.sort_order) from public.item_modifier_sets ims where ims.item_id = i.id), '[]'),
                   'package_group_ids', coalesce((select jsonb_agg(pg.id order by pg.sort_order) from public.package_groups pg where pg.item_id = i.id), '[]'),
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
end $function$;

-- upsert_order: completing a sale also takes stock off the items chosen in packages.
CREATE OR REPLACE FUNCTION public.upsert_order(p_device uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_dev      public.devices;
  v_id       uuid := (p->>'id')::uuid;
  v_existing public.orders;
  v_status   app.order_status := (p->>'status')::app.order_status;
  v_version  int := coalesce((p->>'version')::int, 1);
  v_table    uuid;
  v_cust     uuid;
begin
  select * into v_dev from public.devices where id = p_device and revoked_at is null;
  if v_dev.id is null or app.location_role(v_dev.location_id) is null then
    raise exception 'device not registered or not allowed' using errcode = '42501';
  end if;

  -- A table removed in the backoffice while this bill was offline: keep the bill, drop the link
  -- (table_name stays as a snapshot for receipts and reports).
  select t.id into v_table from public.dining_tables t
    where t.id = nullif(p->>'table_id', '')::uuid and t.location_id = v_dev.location_id;
  -- Same for a customer deleted while the bill was offline (customer_name stays).
  select cu.id into v_cust from public.customers cu
    where cu.id = nullif(p->>'customer_id', '')::uuid and cu.location_id = v_dev.location_id;

  select * into v_existing from public.orders where id = v_id for update;
  if v_existing.id is not null then
    if v_existing.location_id <> v_dev.location_id then
      raise exception 'order belongs to another location' using errcode = '42501';
    end if;
    if v_existing.status <> 'open' then
      return jsonb_build_object('status', 'closed', 'order', app.order_doc(v_id));
    end if;
    if v_existing.version >= v_version then
      return jsonb_build_object('status', 'stale', 'order', app.order_doc(v_id));
    end if;
  end if;

  insert into public.orders as o (id, account_id, location_id, device_id, shift_id, table_id, table_name, guests, customer_id, number, status, version, bill_name, customer_name,
    sales_type_id, sales_type_name, opened_by, opened_by_name, served_by, served_by_name, closed_by, closed_by_name,
    opened_at, completed_at, cancelled_at, cancel_reason, tax_name, tax_rate_bp, gratuity_name, gratuity_rate_bp,
    prices_include_tax, tax_after_discount, gross, discount_total, subtotal, gratuity_total, tax_total, rounding, total, paid, change_due)
  values (v_id, v_dev.account_id, v_dev.location_id, coalesce(v_existing.device_id, v_dev.id), nullif(p->>'shift_id', '')::uuid, v_table, nullif(p->>'table_name', ''), nullif(p->>'guests', '')::int, v_cust, p->>'number', v_status, v_version,
    p->>'bill_name', p->>'customer_name', nullif(p->>'sales_type_id', '')::uuid, p->>'sales_type_name',
    nullif(p->>'opened_by', '')::uuid, p->>'opened_by_name', nullif(p->>'served_by', '')::uuid, p->>'served_by_name',
    nullif(p->>'closed_by', '')::uuid, p->>'closed_by_name',
    (p->>'opened_at')::timestamptz, (p->>'completed_at')::timestamptz, (p->>'cancelled_at')::timestamptz, p->>'cancel_reason',
    p->>'tax_name', coalesce((p->>'tax_rate_bp')::int, 0), p->>'gratuity_name', coalesce((p->>'gratuity_rate_bp')::int, 0),
    coalesce((p->>'prices_include_tax')::boolean, false), coalesce((p->>'tax_after_discount')::boolean, true),
    coalesce((p->>'gross')::bigint, 0), coalesce((p->>'discount_total')::bigint, 0), coalesce((p->>'subtotal')::bigint, 0),
    coalesce((p->>'gratuity_total')::bigint, 0), coalesce((p->>'tax_total')::bigint, 0), coalesce((p->>'rounding')::bigint, 0),
    coalesce((p->>'total')::bigint, 0), coalesce((p->>'paid')::bigint, 0), coalesce((p->>'change_due')::bigint, 0))
  on conflict (id) do update set
    shift_id = coalesce(o.shift_id, excluded.shift_id),
    table_id = excluded.table_id, table_name = excluded.table_name, guests = excluded.guests, customer_id = excluded.customer_id,
    status = excluded.status, version = excluded.version, bill_name = excluded.bill_name, customer_name = excluded.customer_name,
    sales_type_id = excluded.sales_type_id, sales_type_name = excluded.sales_type_name,
    served_by = excluded.served_by, served_by_name = excluded.served_by_name,
    closed_by = excluded.closed_by, closed_by_name = excluded.closed_by_name,
    completed_at = excluded.completed_at, cancelled_at = excluded.cancelled_at, cancel_reason = excluded.cancel_reason,
    tax_name = excluded.tax_name, tax_rate_bp = excluded.tax_rate_bp, gratuity_name = excluded.gratuity_name,
    gratuity_rate_bp = excluded.gratuity_rate_bp, prices_include_tax = excluded.prices_include_tax,
    tax_after_discount = excluded.tax_after_discount, gross = excluded.gross, discount_total = excluded.discount_total,
    subtotal = excluded.subtotal, gratuity_total = excluded.gratuity_total, tax_total = excluded.tax_total,
    rounding = excluded.rounding, total = excluded.total, paid = excluded.paid, change_due = excluded.change_due;

  -- lines / bill discounts / payments: replace; voids: append-only
  delete from public.order_lines where order_id = v_id;
  insert into public.order_lines (id, account_id, location_id, order_id, sort_order, item_id, variant_id, item_name, variant_name,
    category_name, unit_price, modifiers, modifiers_price, qty, note, discount, discount_amount, line_total, sales_type_id, sales_type_name)
  select (l->>'id')::uuid, v_dev.account_id, v_dev.location_id, v_id, coalesce((l->>'sort_order')::int, n::int),
    nullif(l->>'item_id', '')::uuid, nullif(l->>'variant_id', '')::uuid, l->>'item_name', coalesce(l->>'variant_name', ''),
    l->>'category_name', (l->>'unit_price')::bigint, coalesce(l->'modifiers', '[]'), coalesce((l->>'modifiers_price')::bigint, 0),
    (l->>'qty')::int, l->>'note', nullif(l->'discount', 'null'::jsonb), coalesce((l->>'discount_amount')::bigint, 0), (l->>'line_total')::bigint,
    coalesce(nullif(l->>'sales_type_id', '')::uuid, nullif(p->>'sales_type_id', '')::uuid),
    coalesce(nullif(l->>'sales_type_name', ''), p->>'sales_type_name')
  from jsonb_array_elements(coalesce(p->'lines', '[]')) with ordinality as x(l, n);

  delete from public.order_discounts where order_id = v_id;
  insert into public.order_discounts (id, account_id, location_id, order_id, discount_id, name, kind, value, amount)
  select (d->>'id')::uuid, v_dev.account_id, v_dev.location_id, v_id, nullif(d->>'discount_id', '')::uuid, d->>'name',
    (d->>'kind')::app.discount_kind, (d->>'value')::bigint, (d->>'amount')::bigint
  from jsonb_array_elements(coalesce(p->'discounts', '[]')) d;

  delete from public.payments where order_id = v_id;
  insert into public.payments (id, account_id, location_id, order_id, method_id, method_name, kind, amount, tendered, change_due, reference, paid_at)
  select (x->>'id')::uuid, v_dev.account_id, v_dev.location_id, v_id, nullif(x->>'method_id', '')::uuid, x->>'method_name',
    (x->>'kind')::app.payment_kind, (x->>'amount')::bigint, nullif(x->>'tendered', '')::bigint, coalesce((x->>'change_due')::bigint, 0),
    x->>'reference', (x->>'paid_at')::timestamptz
  from jsonb_array_elements(coalesce(p->'payments', '[]')) x;

  insert into public.order_voids (id, account_id, location_id, order_id, line_id, item_name, qty, amount, reason, employee_id, employee_name, voided_at)
  select (v->>'id')::uuid, v_dev.account_id, v_dev.location_id, v_id, nullif(v->>'line_id', '')::uuid, v->>'item_name',
    (v->>'qty')::int, coalesce((v->>'amount')::bigint, 0), v->>'reason', nullif(v->>'employee_id', '')::uuid, v->>'employee_name',
    (v->>'voided_at')::timestamptz
  from jsonb_array_elements(coalesce(p->'voids', '[]')) v
  on conflict (id) do nothing;

  -- Stock: deduct once, when an order becomes completed.
  if v_status = 'completed' then
    update public.items i set stock = i.stock - s.qty
    from (select item_id, sum(qty)::int qty from (
            select item_id, qty from public.order_lines where order_id = v_id and item_id is not null
            union all      -- items chosen inside a package
            select (m->>'item_id')::uuid, l.qty from public.order_lines l, jsonb_array_elements(coalesce(l.modifiers, '[]')) m
            where l.order_id = v_id and nullif(m->>'item_id', '') is not null
          ) x group by item_id) s
    where i.id = s.item_id and i.location_id = v_dev.location_id and i.track_stock;
  end if;

  update public.devices set last_seen_at = now() where id = v_dev.id;
  return jsonb_build_object('status', 'saved', 'order', app.order_doc(v_id));
end $function$;

-- submit_refund: restocking puts back the items chosen in refunded packages too.
CREATE OR REPLACE FUNCTION public.submit_refund(p_device uuid, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_dev    public.devices := app.device_for_caller(p_device);
  v_id     uuid := (p->>'id')::uuid;
  v_order  public.orders;
  v_line   jsonb;
  v_sold   int;
  v_done   int;
  v_prior  bigint;
begin
  if exists (select 1 from public.refunds where id = v_id) then
    return jsonb_build_object('status', 'saved');           -- already uploaded
  end if;

  select * into v_order from public.orders where id = (p->>'order_id')::uuid for update;
  if v_order.id is null then
    -- The sale hasn't been uploaded yet (it is behind this refund in the tablet's queue).
    -- foreign_key_violation tells the tablet to keep the refund queued and retry later.
    raise exception 'sale not uploaded yet' using errcode = '23503';
  end if;
  if v_order.location_id <> v_dev.location_id then
    raise exception 'sale belongs to another location' using errcode = '42501';
  end if;
  if v_order.status <> 'completed' then
    raise exception 'only completed sales can be refunded' using errcode = '22023';
  end if;

  select coalesce(sum(amount), 0) into v_prior from public.refunds where order_id = v_order.id;
  if v_prior + (p->>'amount')::bigint > v_order.total then
    raise exception 'refund exceeds what was paid' using errcode = '22023';
  end if;

  for v_line in select * from jsonb_array_elements(coalesce(p->'lines', '[]')) loop
    select qty into v_sold from public.order_lines where id = (v_line->>'order_line_id')::uuid and order_id = v_order.id;
    if v_sold is null then raise exception 'line not on this sale' using errcode = '22023'; end if;
    select coalesce(sum(rl.qty), 0) into v_done from public.refund_lines rl where rl.order_line_id = (v_line->>'order_line_id')::uuid;
    if v_done + (v_line->>'qty')::int > v_sold then
      raise exception 'refund quantity exceeds what was sold' using errcode = '22023';
    end if;
  end loop;

  insert into public.refunds (id, account_id, location_id, device_id, order_id, shift_id, reason, employee_id, employee_name,
    method_id, method_name, kind, amount, restock, refunded_at)
  values (v_id, v_dev.account_id, v_dev.location_id, v_dev.id, v_order.id, nullif(p->>'shift_id', '')::uuid, p->>'reason',
    nullif(p->>'employee_id', '')::uuid, p->>'employee_name', nullif(p->>'method_id', '')::uuid, p->>'method_name',
    (p->>'kind')::app.payment_kind, (p->>'amount')::bigint, coalesce((p->>'restock')::boolean, false), (p->>'refunded_at')::timestamptz);

  insert into public.refund_lines (id, account_id, location_id, refund_id, order_line_id, item_id, item_name, qty, amount)
  select (l->>'id')::uuid, v_dev.account_id, v_dev.location_id, v_id, (l->>'order_line_id')::uuid, nullif(l->>'item_id', '')::uuid,
    l->>'item_name', (l->>'qty')::int, (l->>'amount')::bigint
  from jsonb_array_elements(coalesce(p->'lines', '[]')) l;

  if coalesce((p->>'restock')::boolean, false) then
    update public.items i set stock = i.stock + s.qty
    from (select item_id, sum(qty)::int qty from (
            select item_id, qty from public.refund_lines where refund_id = v_id and item_id is not null
            union all      -- items chosen inside a refunded package
            select (m->>'item_id')::uuid, rl.qty from public.refund_lines rl
            join public.order_lines l on l.id = rl.order_line_id, jsonb_array_elements(coalesce(l.modifiers, '[]')) m
            where rl.refund_id = v_id and nullif(m->>'item_id', '') is not null
          ) x group by item_id) s
    where i.id = s.item_id and i.location_id = v_dev.location_id and i.track_stock;
  end if;
  return jsonb_build_object('status', 'saved');
end $function$;
