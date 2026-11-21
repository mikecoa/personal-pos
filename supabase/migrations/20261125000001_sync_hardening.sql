-- Phase 5 hardening.
--
-- submit_refund: a refund that arrives before its sale must not look like a permission error
-- (the tablet would stop syncing and ask for a new sign-in). Missing sale → SQLSTATE 23503 so the
-- tablet keeps it queued; a sale of another location stays 42501.

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
    from (select item_id, sum(qty)::int qty from public.refund_lines where refund_id = v_id and item_id is not null group by item_id) s
    where i.id = s.item_id and i.location_id = v_dev.location_id and i.track_stock;
  end if;
  return jsonb_build_object('status', 'saved');
end $$;

-- ───────────────────────────────────────────────────────────── device health + revocation
alter table public.devices
  add column revoked_at       timestamptz,
  add column app_version      text,
  add column pending_count    int not null default 0,
  add column rejected_count   int not null default 0,
  add column last_error       text,
  add column last_sync_ok_at  timestamptz;

-- Every device RPC looks the tablet up through one of these; a revoked tablet is treated as
-- unknown ("device not registered"), so it can neither upload nor download (incl. PIN hashes).
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

create or replace function public.pos_open_orders(p_device uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_loc uuid;
begin
  select location_id into v_loc from public.devices where id = p_device and revoked_at is null;
  if v_loc is null or app.location_role(v_loc) is null then
    raise exception 'device not registered or not allowed' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(app.order_doc(o.id) order by o.opened_at)
                   from public.orders o where o.location_id = v_loc and o.status = 'open'), '[]');
end $$;

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
  select * into v_dev from public.devices where id = p_device and revoked_at is null;
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

create or replace function app.device_for_caller(p_device uuid) returns public.devices
language plpgsql stable security definer set search_path = '' as $$
declare v public.devices;
begin
  select * into v from public.devices where id = p_device and revoked_at is null;
  if v.id is null or app.location_role(v.location_id) is null then
    raise exception 'device not registered or not allowed' using errcode = '42501';
  end if;
  return v;
end $$;

-- Called by the tablet after each sync attempt.
create or replace function public.device_heartbeat(p_device uuid, p jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare v public.devices := app.device_for_caller(p_device);
begin
  update public.devices set last_seen_at = now(),
    app_version = left(p->>'app_version', 40),
    pending_count = greatest(0, coalesce((p->>'pending')::int, 0)),
    rejected_count = greatest(0, coalesce((p->>'rejected')::int, 0)),
    last_error = left(nullif(p->>'error', ''), 500),
    last_sync_ok_at = case when coalesce((p->>'ok')::boolean, false) then now() else last_sync_ok_at end
  where id = v.id;
end $$;

-- Owner/admin cuts a tablet off (lost, stolen, replaced). Its past sales stay.
create or replace function public.revoke_device(p_device uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_loc uuid;
begin
  select location_id into v_loc from public.devices where id = p_device;
  if v_loc is null or not app.can_manage_location(v_loc) then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.devices set revoked_at = now() where id = p_device and revoked_at is null;
end $$;

revoke all on function public.device_heartbeat(uuid, jsonb), public.revoke_device(uuid) from public, anon;
grant execute on function public.device_heartbeat(uuid, jsonb), public.revoke_device(uuid) to authenticated;
