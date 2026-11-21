-- Phase 3: shifts (per device), cash in/out, refunds.
--
-- Same upload rules as orders: documents generated on the tablet, uploaded idempotently.
--   upsert_shift   versioned; a closed shift is immutable. Cash movements are append-only.
--   submit_refund  insert-once; the server re-checks that refunded qty/amount never exceed
--                  what was sold (also across tablets), and restocks tracked items if asked.
-- Clients only read these tables.

create type app.shift_status as enum ('open', 'closed');
create type app.cash_move as enum ('in', 'out');

create table public.shifts (
  id              uuid primary key,
  account_id      uuid not null,
  location_id     uuid not null,
  device_id       uuid not null,
  status          app.shift_status not null,
  version         int not null default 1,
  opened_by       uuid,
  opened_by_name  text,
  opened_at       timestamptz not null,
  starting_cash   bigint not null check (starting_cash >= 0),
  closed_by       uuid,
  closed_by_name  text,
  closed_at       timestamptz,
  expected_cash   bigint,
  actual_cash     bigint check (actual_cash is null or actual_cash >= 0),
  summary         jsonb,                     -- per-method expected totals etc., computed on the tablet
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade,
  foreign key (device_id, location_id) references public.devices (id, location_id),
  unique (id, location_id),
  check (status <> 'closed' or (closed_at is not null and actual_cash is not null))
);
create unique index shifts_one_open_per_device on public.shifts (device_id) where status = 'open';
create index shifts_location_opened_idx on public.shifts (location_id, opened_at desc);

create table public.cash_movements (
  id            uuid primary key,
  account_id    uuid not null,
  location_id   uuid not null,
  shift_id      uuid not null,
  kind          app.cash_move not null,
  amount        bigint not null check (amount > 0),
  description   text not null check (length(trim(description)) > 0),
  employee_id   uuid,
  employee_name text,
  moved_at      timestamptz not null,
  foreign key (shift_id, location_id) references public.shifts (id, location_id) on delete cascade
);
create index cash_movements_shift_idx on public.cash_movements (shift_id);

alter table public.orders add column shift_id uuid;
alter table public.orders add constraint orders_shift_fk foreign key (shift_id, location_id) references public.shifts (id, location_id);
create index orders_shift_idx on public.orders (shift_id);

create table public.refunds (
  id            uuid primary key,
  account_id    uuid not null,
  location_id   uuid not null,
  device_id     uuid not null,
  order_id      uuid not null,
  shift_id      uuid,
  reason        text not null check (length(trim(reason)) > 0),
  employee_id   uuid,
  employee_name text,
  method_id     uuid,
  method_name   text not null,
  kind          app.payment_kind not null,
  amount        bigint not null check (amount > 0),
  restock       boolean not null default false,
  refunded_at   timestamptz not null,
  created_at    timestamptz not null default now(),
  foreign key (order_id, location_id) references public.orders (id, location_id),
  foreign key (shift_id, location_id) references public.shifts (id, location_id),
  foreign key (device_id, location_id) references public.devices (id, location_id),
  unique (id, location_id)
);
create index refunds_order_idx on public.refunds (order_id);
create index refunds_shift_idx on public.refunds (shift_id);

create table public.refund_lines (
  id             uuid primary key,
  account_id     uuid not null,
  location_id    uuid not null,
  refund_id      uuid not null,
  order_line_id  uuid not null,
  item_id        uuid,
  item_name      text not null,
  qty            int not null check (qty > 0),
  amount         bigint not null check (amount >= 0),
  foreign key (refund_id, location_id) references public.refunds (id, location_id) on delete cascade
);
create index refund_lines_line_idx on public.refund_lines (order_line_id);

do $$
declare t text;
begin
  foreach t in array array['shifts', 'cash_movements', 'refunds', 'refund_lines'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.location_role(location_id) is not null)', t || '_select', t);
  end loop;
end $$;
create trigger shifts_touch before update on public.shifts for each row execute function app.touch_updated_at();

-- ───────────────────────────────────────────────────────────── helpers
create or replace function app.device_for_caller(p_device uuid) returns public.devices
language plpgsql stable security definer set search_path = '' as $$
declare v public.devices;
begin
  select * into v from public.devices where id = p_device;
  if v.id is null or app.location_role(v.location_id) is null then
    raise exception 'device not registered or not allowed' using errcode = '42501';
  end if;
  return v;
end $$;

create or replace function app.shift_doc(p_shift uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(s) - 'account_id' - 'created_at' || jsonb_build_object(
    'movements', coalesce((select jsonb_agg(to_jsonb(m) - 'account_id' - 'location_id' - 'shift_id' order by m.moved_at)
                           from public.cash_movements m where m.shift_id = s.id), '[]'))
  from public.shifts s where s.id = p_shift
$$;

-- ───────────────────────────────────────────────────────────── upsert_shift
create or replace function public.upsert_shift(p_device uuid, p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dev      public.devices := app.device_for_caller(p_device);
  v_id       uuid := (p->>'id')::uuid;
  v_version  int := coalesce((p->>'version')::int, 1);
  v_existing public.shifts;
begin
  select * into v_existing from public.shifts where id = v_id for update;
  if v_existing.id is not null then
    if v_existing.location_id <> v_dev.location_id then raise exception 'shift belongs to another location' using errcode = '42501'; end if;
    if v_existing.status = 'closed' then return jsonb_build_object('status', 'closed', 'shift', app.shift_doc(v_id)); end if;
    if v_existing.version >= v_version then return jsonb_build_object('status', 'stale', 'shift', app.shift_doc(v_id)); end if;
  end if;

  insert into public.shifts as s (id, account_id, location_id, device_id, status, version, opened_by, opened_by_name, opened_at,
    starting_cash, closed_by, closed_by_name, closed_at, expected_cash, actual_cash, summary)
  values (v_id, v_dev.account_id, v_dev.location_id, coalesce(v_existing.device_id, v_dev.id), (p->>'status')::app.shift_status, v_version,
    nullif(p->>'opened_by', '')::uuid, p->>'opened_by_name', (p->>'opened_at')::timestamptz, (p->>'starting_cash')::bigint,
    nullif(p->>'closed_by', '')::uuid, p->>'closed_by_name', (p->>'closed_at')::timestamptz,
    (p->>'expected_cash')::bigint, (p->>'actual_cash')::bigint, p->'summary')
  on conflict (id) do update set status = excluded.status, version = excluded.version, closed_by = excluded.closed_by,
    closed_by_name = excluded.closed_by_name, closed_at = excluded.closed_at, expected_cash = excluded.expected_cash,
    actual_cash = excluded.actual_cash, summary = excluded.summary;

  insert into public.cash_movements (id, account_id, location_id, shift_id, kind, amount, description, employee_id, employee_name, moved_at)
  select (m->>'id')::uuid, v_dev.account_id, v_dev.location_id, v_id, (m->>'kind')::app.cash_move, (m->>'amount')::bigint,
    m->>'description', nullif(m->>'employee_id', '')::uuid, m->>'employee_name', (m->>'moved_at')::timestamptz
  from jsonb_array_elements(coalesce(p->'movements', '[]')) m
  on conflict (id) do nothing;

  update public.devices set last_seen_at = now() where id = v_dev.id;
  return jsonb_build_object('status', 'saved', 'shift', app.shift_doc(v_id));
end $$;

-- ───────────────────────────────────────────────────────────── submit_refund
create or replace function public.submit_refund(p_device uuid, p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
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
  if v_order.id is null or v_order.location_id <> v_dev.location_id then
    raise exception 'sale not found at this location' using errcode = '42501';
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
    from (select item_id, sum(qty)::int qty from public.refund_lines where refund_id = v_id and item_id is not null group by item_id) s
    where i.id = s.item_id and i.location_id = v_dev.location_id and i.track_stock;
  end if;
  return jsonb_build_object('status', 'saved');
end $$;

-- orders now carry shift_id: upsert_order is redefined to store it once and never move it.
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

  insert into public.orders as o (id, account_id, location_id, device_id, shift_id, number, status, version, bill_name, customer_name,
    sales_type_id, sales_type_name, opened_by, opened_by_name, served_by, served_by_name, closed_by, closed_by_name,
    opened_at, completed_at, cancelled_at, cancel_reason, tax_name, tax_rate_bp, gratuity_name, gratuity_rate_bp,
    prices_include_tax, tax_after_discount, gross, discount_total, subtotal, gratuity_total, tax_total, rounding, total, paid, change_due)
  values (v_id, v_dev.account_id, v_dev.location_id, coalesce(v_existing.device_id, v_dev.id), nullif(p->>'shift_id', '')::uuid, p->>'number', v_status, v_version,
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

revoke all on function public.upsert_shift(uuid, jsonb), public.submit_refund(uuid, jsonb) from public, anon;
grant execute on function public.upsert_shift(uuid, jsonb), public.submit_refund(uuid, jsonb) to authenticated;
