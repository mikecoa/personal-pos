-- Phase 2: POS devices, orders (open bills + completed sales), lines, voids, payments,
-- and the RPCs the tablet uses to sync.
--
-- Sync model
--   down: pos_catalog(location)      full snapshot of one location's setup (small; no deltas needed)
--         pos_open_orders(location)  open bills, so several tablets share the billing list
--   up:   upsert_order(doc)          idempotent; the client sends the whole order document.
--         Open orders are last-writer-wins guarded by `version`; completed/cancelled orders
--         are immutable, so a late or repeated upload can never change a finished sale.
-- Clients never write these tables directly (no INSERT/UPDATE/DELETE grants).

create type app.order_status as enum ('open', 'completed', 'cancelled');

-- ───────────────────────────────────────────────────────────── devices
create table public.devices (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null,
  location_id    uuid not null,
  name           text not null check (length(trim(name)) between 1 and 60),
  receipt_prefix text not null check (receipt_prefix ~ '^[A-Z][0-9A-Z]$'),
  registered_by  uuid not null references auth.users (id),
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz,
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade,
  unique (location_id, receipt_prefix),
  unique (id, location_id)
);

-- ───────────────────────────────────────────────────────────── orders
create table public.orders (
  id                   uuid primary key,                    -- generated on the tablet
  account_id           uuid not null,
  location_id          uuid not null,
  device_id            uuid not null,
  number               text not null,                       -- e.g. A1-000123
  status               app.order_status not null,
  version              int not null default 1,
  bill_name            text,
  customer_name        text,
  sales_type_id        uuid,
  sales_type_name      text,
  opened_by            uuid,                                -- employee ids (snapshot names below)
  opened_by_name       text,
  served_by            uuid,
  served_by_name       text,
  closed_by            uuid,
  closed_by_name       text,
  opened_at            timestamptz not null,
  completed_at         timestamptz,
  cancelled_at         timestamptz,
  cancel_reason        text,
  -- pricing snapshot taken when the order was priced
  tax_name             text,
  tax_rate_bp          int not null default 0,
  gratuity_name        text,
  gratuity_rate_bp     int not null default 0,
  prices_include_tax   boolean not null default false,
  tax_after_discount   boolean not null default true,
  -- totals (integer rupiah)
  gross                bigint not null default 0,           -- sum of lines before any discount
  discount_total       bigint not null default 0,
  subtotal             bigint not null default 0,           -- gross - discounts
  gratuity_total       bigint not null default 0,
  tax_total            bigint not null default 0,
  rounding             bigint not null default 0,
  total                bigint not null default 0,
  paid                 bigint not null default 0,
  change_due           bigint not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade,
  foreign key (device_id, location_id) references public.devices (id, location_id),
  unique (location_id, number),
  unique (id, location_id),
  check (status <> 'completed' or completed_at is not null),
  check (status <> 'cancelled' or cancelled_at is not null)
);
create index orders_location_status_idx on public.orders (location_id, status);
create index orders_location_completed_idx on public.orders (location_id, completed_at desc);

create table public.order_lines (
  id             uuid primary key,
  account_id     uuid not null,
  location_id    uuid not null,
  order_id       uuid not null,
  sort_order     int not null,
  item_id        uuid,
  variant_id     uuid,
  item_name      text not null,
  variant_name   text not null default '',
  category_name  text,
  unit_price     bigint not null check (unit_price >= 0),   -- variant (or sales-type) price
  modifiers      jsonb not null default '[]',               -- [{set, option, price}]
  modifiers_price bigint not null default 0,                -- per unit
  qty            int not null check (qty > 0),
  note           text,
  discount       jsonb,                                     -- {id, name, kind, value}
  discount_amount bigint not null default 0,
  line_total     bigint not null,                           -- (unit + modifiers) * qty - discount
  foreign key (order_id, location_id) references public.orders (id, location_id) on delete cascade,
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade
);
create index order_lines_order_idx on public.order_lines (order_id);

create table public.order_discounts (               -- bill-level discounts
  id           uuid primary key,
  account_id   uuid not null,
  location_id  uuid not null,
  order_id     uuid not null,
  discount_id  uuid,
  name         text not null,
  kind         app.discount_kind not null,
  value        bigint not null,
  amount       bigint not null,
  foreign key (order_id, location_id) references public.orders (id, location_id) on delete cascade
);

create table public.order_voids (                   -- append-only audit trail
  id           uuid primary key,
  account_id   uuid not null,
  location_id  uuid not null,
  order_id     uuid not null,
  line_id      uuid,
  item_name    text not null,
  qty          int not null check (qty > 0),
  amount       bigint not null,
  reason       text not null check (length(trim(reason)) > 0),
  employee_id  uuid,
  employee_name text,
  voided_at    timestamptz not null,
  foreign key (order_id, location_id) references public.orders (id, location_id) on delete cascade
);

create table public.payments (
  id           uuid primary key,
  account_id   uuid not null,
  location_id  uuid not null,
  order_id     uuid not null,
  method_id    uuid,
  method_name  text not null,
  kind         app.payment_kind not null,
  amount       bigint not null check (amount > 0),       -- applied to the bill
  tendered     bigint,                                   -- cash handed over
  change_due   bigint not null default 0,
  reference    text,
  paid_at      timestamptz not null,
  foreign key (order_id, location_id) references public.orders (id, location_id) on delete cascade
);
create index payments_order_idx on public.payments (order_id);

-- ───────────────────────────────────────────────────────────── RLS (read-only for clients)
do $$
declare t text;
begin
  foreach t in array array['devices', 'orders', 'order_lines', 'order_discounts', 'order_voids', 'payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.location_role(location_id) is not null)', t || '_select', t);
  end loop;
end $$;

create trigger orders_touch before update on public.orders for each row execute function app.touch_updated_at();

-- ───────────────────────────────────────────────────────────── RPCs
-- Register this tablet for a location. Requires owner/admin of the location (the person
-- setting up the tablet), because the device then receives staff PIN hashes for offline unlock.
create or replace function public.register_device(p_location uuid, p_name text)
returns public.devices
language plpgsql security definer set search_path = '' as $$
declare
  v_account uuid;
  v_prefix  text;
  v_row     public.devices;
  v_n       int;
begin
  if not app.can_manage_location(p_location) then
    raise exception 'only an owner or admin of this location can set up a POS device' using errcode = '42501';
  end if;
  select account_id into v_account from public.locations where id = p_location and is_active;
  if v_account is null then raise exception 'location not found or closed' using errcode = '22023'; end if;

  -- next free prefix: A1..A9, AA..AZ, B1.. (36 per letter)
  select count(*) into v_n from public.devices where location_id = p_location;
  loop
    v_prefix := chr(65 + (v_n / 35) % 26) || substr('123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', (v_n % 35) + 1, 1);
    exit when not exists (select 1 from public.devices where location_id = p_location and receipt_prefix = v_prefix);
    v_n := v_n + 1;
  end loop;

  insert into public.devices (account_id, location_id, name, receipt_prefix, registered_by)
  values (v_account, p_location, coalesce(nullif(trim(p_name), ''), 'Tablet'), v_prefix, auth.uid())
  returning * into v_row;
  return v_row;
end $$;

-- Everything the POS needs to sell at one location, as a single JSON document.
create or replace function public.pos_catalog(p_device uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_loc  uuid;
  v_doc  jsonb;
begin
  select location_id into v_loc from public.devices where id = p_device;
  if v_loc is null or not app.can_manage_location(v_loc) then
    raise exception 'device not registered or not allowed' using errcode = '42501';
  end if;
  update public.devices set last_seen_at = now() where id = p_device;

  select jsonb_build_object(
    'synced_at', now(),
    'location', (select jsonb_build_object('id', l.id, 'name', l.name, 'address', l.address, 'phone', l.phone)
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
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                   'id', i.id, 'name', i.name, 'category_id', i.category_id, 'image_url', i.image_url,
                   'track_stock', i.track_stock, 'stock', i.stock,
                   'modifier_set_ids', coalesce((select jsonb_agg(ims.modifier_set_id order by ims.sort_order) from public.item_modifier_sets ims where ims.item_id = i.id), '[]'),
                   'variants', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'price', v.price, 'sku', v.sku,
                       'prices', coalesce((select jsonb_object_agg(p.sales_type_id, p.price) from public.variant_sales_type_prices p where p.variant_id = v.id), '{}'))
                       order by v.sort_order) from public.item_variants v where v.item_id = i.id and v.is_active), '[]')
                 ) order by i.sort_order, i.name)
                 from public.items i where i.location_id = v_loc and i.is_active), '[]'),
    -- Offline PIN unlock: employees assigned here, with bcrypt hash and permissions.
    'employees', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'pin_hash', e.pin_hash,
                   'role', r.name, 'permissions', to_jsonb(r.permissions)) order by e.name)
                 from public.employees e join public.roles r on r.id = e.role_id
                 join public.employee_locations el on el.employee_id = e.id and el.location_id = v_loc
                 where e.is_active and e.pin_hash is not null), '[]')
  ) into v_doc;
  return v_doc;
end $$;

-- Open bills of the device's location as order documents (same shape upsert_order accepts).
create or replace function app.order_doc(p_order uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(o) - 'account_id' - 'created_at' || jsonb_build_object(
    'lines', coalesce((select jsonb_agg(to_jsonb(l) - 'account_id' - 'location_id' - 'order_id' order by l.sort_order) from public.order_lines l where l.order_id = o.id), '[]'),
    'discounts', coalesce((select jsonb_agg(to_jsonb(d) - 'account_id' - 'location_id' - 'order_id') from public.order_discounts d where d.order_id = o.id), '[]'),
    'voids', coalesce((select jsonb_agg(to_jsonb(v) - 'account_id' - 'location_id' - 'order_id' order by v.voided_at) from public.order_voids v where v.order_id = o.id), '[]'),
    'payments', coalesce((select jsonb_agg(to_jsonb(p) - 'account_id' - 'location_id' - 'order_id' order by p.paid_at) from public.payments p where p.order_id = o.id), '[]'))
  from public.orders o where o.id = p_order
$$;

create or replace function public.pos_open_orders(p_device uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_loc uuid;
begin
  select location_id into v_loc from public.devices where id = p_device;
  if v_loc is null or app.location_role(v_loc) is null then
    raise exception 'device not registered or not allowed' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(app.order_doc(o.id) order by o.opened_at)
                   from public.orders o where o.location_id = v_loc and o.status = 'open'), '[]');
end $$;

-- Idempotent upload of one order document from a device.
-- Returns {status: 'saved' | 'stale' | 'closed', order: <server doc>}.
--   saved   applied (new order, or newer version of an open order)
--   stale   server already has a newer version of this open order; client should take `order`
--   closed  order is already completed/cancelled on the server; nothing changed
create or replace function public.upsert_order(p_device uuid, p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dev      public.devices;
  v_id       uuid := (p->>'id')::uuid;
  v_existing public.orders;
  v_status   app.order_status := (p->>'status')::app.order_status;
  v_version  int := coalesce((p->>'version')::int, 1);
begin
  select * into v_dev from public.devices where id = p_device;
  if v_dev.id is null or app.location_role(v_dev.location_id) is null then
    raise exception 'device not registered or not allowed' using errcode = '42501';
  end if;

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

  insert into public.orders as o (id, account_id, location_id, device_id, number, status, version, bill_name, customer_name,
    sales_type_id, sales_type_name, opened_by, opened_by_name, served_by, served_by_name, closed_by, closed_by_name,
    opened_at, completed_at, cancelled_at, cancel_reason, tax_name, tax_rate_bp, gratuity_name, gratuity_rate_bp,
    prices_include_tax, tax_after_discount, gross, discount_total, subtotal, gratuity_total, tax_total, rounding, total, paid, change_due)
  values (v_id, v_dev.account_id, v_dev.location_id, coalesce(v_existing.device_id, v_dev.id), p->>'number', v_status, v_version,
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

revoke all on function public.register_device(uuid, text), public.pos_catalog(uuid), public.pos_open_orders(uuid),
  public.upsert_order(uuid, jsonb) from public, anon;
grant execute on function public.register_device(uuid, text), public.pos_catalog(uuid), public.pos_open_orders(uuid),
  public.upsert_order(uuid, jsonb) to authenticated;
