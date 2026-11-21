-- POS: manage items and categories from the tablet, and saved customers.
--
-- Customers belong to one location (like all operational data). A bill can be linked to a
-- customer (customer_id; customer_name stays as a snapshot). A customer can carry a default
-- discount that the tablet applies when the customer is added to a bill.
--
-- Tablet edits are online only and go through device-scoped functions. The tablet checks the
-- employee's permission (items_manage / customers_edit); the server checks the device and keeps
-- every change inside the device's location.

alter table public.discounts add constraint discounts_id_location_key unique (id, location_id);

create table public.customers (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null,
  location_id  uuid not null,
  name         text not null check (length(trim(name)) between 1 and 60),
  phone        text check (phone is null or length(phone) <= 30),
  email        text check (email is null or length(email) <= 120),
  note         text check (note is null or length(note) <= 300),
  discount_id  uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade,
  foreign key (discount_id, location_id) references public.discounts (id, location_id) on delete set null (discount_id),
  unique (id, location_id)
);
create unique index customers_phone_uq on public.customers (location_id, phone) where phone is not null;
create index customers_name_idx on public.customers (location_id, lower(name));

alter table public.orders
  add column customer_id uuid,
  add constraint orders_customer_fk foreign key (customer_id, location_id) references public.customers (id, location_id) on delete set null (customer_id);
create index orders_customer_idx on public.orders (customer_id) where customer_id is not null;

alter table public.customers enable row level security;
create policy customers_select on public.customers for select to authenticated using (app.location_role(location_id) is not null);
create policy customers_insert on public.customers for insert to authenticated with check (app.can_manage_location(location_id));
create policy customers_update on public.customers for update to authenticated using (app.can_manage_location(location_id)) with check (app.can_manage_location(location_id));
create policy customers_delete on public.customers for delete to authenticated using (app.can_manage_location(location_id));
create trigger customers_touch before update on public.customers for each row execute function app.touch_updated_at();
create trigger customers_freeze_scope before update on public.customers for each row execute function app.freeze_scope();

-- Device check shared by the tablet edit functions below.
create or replace function app.pos_device(p_device uuid) returns public.devices
language plpgsql stable security definer set search_path = '' as $$
declare v_dev public.devices;
begin
  select * into v_dev from public.devices where id = p_device and revoked_at is null;
  if v_dev.id is null or not app.can_manage_location(v_dev.location_id) then
    raise exception 'device not registered or not allowed' using errcode = '42501';
  end if;
  return v_dev;
end $$;

-- Categories. p: { id?, name } or { id, op: 'delete' } (its items stay, without a category).
create or replace function public.pos_save_category(p_device uuid, p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dev  public.devices := app.pos_device(p_device);
  v_id   uuid := nullif(p->>'id', '')::uuid;
  v_name text := trim(coalesce(p->>'name', ''));
begin
  if p->>'op' = 'delete' then
    delete from public.categories where id = v_id and location_id = v_dev.location_id;
  else
    if length(v_name) not between 1 and 40 then raise exception 'Category name must be 1–40 characters' using errcode = '22023'; end if;
    if exists (select 1 from public.categories where location_id = v_dev.location_id and lower(name) = lower(v_name) and id is distinct from v_id) then
      raise exception 'There is already a category called %', v_name using errcode = '23505';
    end if;
    if v_id is null then
      insert into public.categories (account_id, location_id, name, sort_order)
      values (v_dev.account_id, v_dev.location_id, v_name,
              coalesce((select max(sort_order) + 1 from public.categories where location_id = v_dev.location_id), 0));
    else
      update public.categories set name = v_name where id = v_id and location_id = v_dev.location_id;
      if not found then raise exception 'Category not found' using errcode = 'P0002'; end if;
    end if;
  end if;
  return public.pos_catalog(p_device);
end $$;

-- Items. p: the same shape as save_item (name, category_id, variants[{id?, name, price, sku, prices}],
-- modifier_set_ids, track_stock, stock) or { id, op: 'remove' } which takes it off the menu
-- (is_active = false; past sales keep it, the backoffice can bring it back).
-- Fields the tablet doesn't know (description, photo, stock alert, cost) are kept as they are.
create or replace function public.pos_save_item(p_device uuid, p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dev  public.devices := app.pos_device(p_device);
  v_id   uuid := nullif(p->>'id', '')::uuid;
  v_old  public.items;
  v_name text := trim(coalesce(p->>'name', ''));
begin
  if v_id is not null then
    select * into v_old from public.items where id = v_id and location_id = v_dev.location_id;
    if v_old.id is null then raise exception 'Item not found' using errcode = 'P0002'; end if;
  end if;
  if p->>'op' = 'remove' then
    update public.items set is_active = false where id = v_id and location_id = v_dev.location_id;
    return public.pos_catalog(p_device);
  end if;
  if length(v_name) not between 1 and 80 then raise exception 'Item name must be 1–80 characters' using errcode = '22023'; end if;
  if exists (select 1 from public.items where location_id = v_dev.location_id and lower(name) = lower(v_name) and id is distinct from v_id) then
    raise exception 'There is already an item called %', v_name using errcode = '23505';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p->'variants', '[]')) v
             where (v->>'price') is null or (v->>'price')::bigint < 0 or (v->>'price')::bigint > 1000000000) then
    raise exception 'Every price must be between 0 and 1.000.000.000' using errcode = '22023';
  end if;
  if nullif(p->>'category_id', '') is not null and not exists (
       select 1 from public.categories where id = (p->>'category_id')::uuid and location_id = v_dev.location_id) then
    raise exception 'Category not found' using errcode = 'P0002';
  end if;

  perform public.save_item(
    jsonb_build_object('description', v_old.description, 'image_url', v_old.image_url, 'stock_alert', v_old.stock_alert,
                       'avg_cost', v_old.avg_cost, 'is_active', true)
    || (p - 'location_id' - 'op')
    || jsonb_build_object('location_id', v_dev.location_id));
  return public.pos_catalog(p_device);
end $$;

-- Customers. p: { id?, name, phone?, email?, note?, discount_id? } or { id, op: 'delete' }.
-- Returns { customer: the saved row (null after delete), customers: the location's list }.
create or replace function public.pos_save_customer(p_device uuid, p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dev   public.devices := app.pos_device(p_device);
  v_id    uuid := nullif(p->>'id', '')::uuid;
  v_name  text := trim(coalesce(p->>'name', ''));
  v_phone text := nullif(regexp_replace(coalesce(p->>'phone', ''), '[^0-9+]', '', 'g'), '');
  v_disc  uuid := nullif(p->>'discount_id', '')::uuid;
  v_row   public.customers;
begin
  if p->>'op' = 'delete' then
    delete from public.customers where id = v_id and location_id = v_dev.location_id;
  else
    if length(v_name) not between 1 and 60 then raise exception 'Name must be 1–60 characters' using errcode = '22023'; end if;
    if v_phone is not null and exists (select 1 from public.customers where location_id = v_dev.location_id and phone = v_phone and id is distinct from v_id) then
      raise exception 'Another customer already has phone %', v_phone using errcode = '23505';
    end if;
    if v_disc is not null and not exists (select 1 from public.discounts where id = v_disc and location_id = v_dev.location_id) then
      raise exception 'Discount not found' using errcode = 'P0002';
    end if;
    if v_id is null then
      insert into public.customers (account_id, location_id, name, phone, email, note, discount_id)
      values (v_dev.account_id, v_dev.location_id, v_name, v_phone, nullif(trim(p->>'email'), ''), nullif(trim(p->>'note'), ''), v_disc)
      returning * into v_row;
    else
      update public.customers set name = v_name, phone = v_phone, email = nullif(trim(p->>'email'), ''),
        note = nullif(trim(p->>'note'), ''), discount_id = v_disc
      where id = v_id and location_id = v_dev.location_id
      returning * into v_row;
      if v_row.id is null then raise exception 'Customer not found' using errcode = 'P0002'; end if;
    end if;
  end if;
  return jsonb_build_object(
    'customer', case when v_row.id is null then null else jsonb_build_object('id', v_row.id, 'name', v_row.name, 'phone', v_row.phone,
                  'email', v_row.email, 'note', v_row.note, 'discount_id', v_row.discount_id) end,
    'customers', coalesce((select jsonb_agg(jsonb_build_object('id', cu.id, 'name', cu.name, 'phone', cu.phone, 'email', cu.email,
                   'note', cu.note, 'discount_id', cu.discount_id) order by lower(cu.name))
                 from public.customers cu where cu.location_id = v_dev.location_id), '[]'));
end $$;

revoke execute on function public.pos_save_category(uuid, jsonb) from public, anon;
revoke execute on function public.pos_save_item(uuid, jsonb) from public, anon;
revoke execute on function public.pos_save_customer(uuid, jsonb) from public, anon;
grant execute on function public.pos_save_category(uuid, jsonb) to authenticated;
grant execute on function public.pos_save_item(uuid, jsonb) to authenticated;
grant execute on function public.pos_save_customer(uuid, jsonb) to authenticated;

-- upsert_order: also stores customer_id (validated against this location).
create or replace function public.upsert_order(p_device uuid, p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
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
    category_name, unit_price, modifiers, modifiers_price, qty, note, discount, discount_amount, line_total)
  select (l->>'id')::uuid, v_dev.account_id, v_dev.location_id, v_id, coalesce((l->>'sort_order')::int, n::int),
    nullif(l->>'item_id', '')::uuid, nullif(l->>'variant_id', '')::uuid, l->>'item_name', coalesce(l->>'variant_name', ''),
    l->>'category_name', (l->>'unit_price')::bigint, coalesce(l->'modifiers', '[]'), coalesce((l->>'modifiers_price')::bigint, 0),
    (l->>'qty')::int, l->>'note', nullif(l->'discount', 'null'::jsonb), coalesce((l->>'discount_amount')::bigint, 0), (l->>'line_total')::bigint
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
    from (select item_id, sum(qty)::int qty from public.order_lines where order_id = v_id and item_id is not null group by item_id) s
    where i.id = s.item_id and i.location_id = v_dev.location_id and i.track_stock;
  end if;

  update public.devices set last_seen_at = now() where id = v_dev.id;
  return jsonb_build_object('status', 'saved', 'order', app.order_doc(v_id));
end $$;

-- pos_catalog: adds the location's customers.
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
