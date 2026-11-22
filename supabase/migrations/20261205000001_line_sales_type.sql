-- Sales type per item: one bill can mix Dine In and Take Away (and GoFood…). Each order line keeps
-- its own sales type and price; the order's sales_type_* stays as the bill's main / current type.
-- Older lines without one fall back to the order's type.
alter table public.order_lines add column sales_type_id uuid, add column sales_type_name text;
update public.order_lines ol set sales_type_id = o.sales_type_id, sales_type_name = o.sales_type_name
  from public.orders o where o.id = ol.order_id and ol.sales_type_name is null;

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
    from (select item_id, sum(qty)::int qty from public.order_lines where order_id = v_id and item_id is not null group by item_id) s
    where i.id = s.item_id and i.location_id = v_dev.location_id and i.track_stock;
  end if;

  update public.devices set last_seen_at = now() where id = v_dev.id;
  return jsonb_build_object('status', 'saved', 'order', app.order_doc(v_id));
end $$;

create or replace function public.report_sales(p_locations uuid[], p_from timestamptz, p_to timestamptz, p_tz text default 'Asia/Jakarta')
returns jsonb
language sql stable security invoker set search_path = '' as $$
  with o as (
    select * from public.orders
    where location_id = any (p_locations) and status = 'completed' and completed_at >= p_from and completed_at < p_to
  ),
  r as (
    select * from public.refunds where location_id = any (p_locations) and refunded_at >= p_from and refunded_at < p_to
  ),
  l as (select ol.* from public.order_lines ol join o on o.id = ol.order_id),
  refunded_lines as (
    select rl.order_line_id, sum(rl.qty) qty, sum(rl.amount) amount
    from public.refund_lines rl join r on r.id = rl.refund_id group by rl.order_line_id
  )
  select jsonb_build_object(
    'summary', (select jsonb_build_object(
        'transactions', count(*),
        'items', coalesce((select sum(qty) from l), 0),
        'gross', coalesce(sum(gross), 0),
        'discounts', coalesce(sum(discount_total), 0),
        'refunds', coalesce((select sum(amount) from r), 0),
        'net', coalesce(sum(gross), 0) - coalesce(sum(discount_total), 0) - coalesce((select sum(amount) from r), 0),
        'gratuity', coalesce(sum(gratuity_total), 0),
        'tax', coalesce(sum(tax_total), 0),
        'rounding', coalesce(sum(rounding), 0),
        'collected', coalesce(sum(total), 0) - coalesce((select sum(amount) from r), 0),
        'average', case when count(*) > 0 then round(sum(total)::numeric / count(*)) else 0 end,
        'cogs', coalesce((select sum(ol.qty * i.avg_cost) from l ol join public.items i on i.id = ol.item_id where i.avg_cost is not null), 0)
      ) from o),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'transactions', n, 'gross', g, 'net', nt) order by d) from (
        select (completed_at at time zone p_tz)::date d, count(*) n, sum(gross) g, sum(gross - discount_total) nt from o group by 1) x), '[]'),
    'by_hour', coalesce((select jsonb_agg(jsonb_build_object('hour', h, 'transactions', n, 'net', nt) order by h) from (
        select extract(hour from completed_at at time zone p_tz)::int h, count(*) n, sum(gross - discount_total) nt from o group by 1) x), '[]'),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('method', method, 'kind', kind, 'count', n, 'amount', a, 'refunds', rf, 'net', a - rf) order by a desc) from (
        select coalesce(p.method_name, rr.method_name) method, coalesce(p.kind, rr.kind)::text kind,
               coalesce(p.n, 0) n, coalesce(p.a, 0) a, coalesce(rr.a, 0) rf
        from (select pm.method_name, pm.kind, count(*) n, sum(pm.amount) a from public.payments pm join o on o.id = pm.order_id group by 1, 2) p
        full join (select method_name, kind, sum(amount) a from r group by 1, 2) rr on rr.method_name = p.method_name and rr.kind = p.kind) x), '[]'),
    -- By the sales type of each item (a bill can mix Dine In and Take Away). Bill-level discounts are
    -- shared across the bill's items in proportion to their totals; count = bills with that type.
    'sales_types', coalesce((select jsonb_agg(jsonb_build_object('name', n, 'count', c, 'net', nt) order by nt desc) from (
        select coalesce(l.sales_type_name, o.sales_type_name, '—') n, count(distinct o.id) c,
               round(sum(l.line_total::numeric * (o.gross - o.discount_total) / nullif(lt.total, 0)))::bigint nt
        from l join o on o.id = l.order_id
        join (select order_id, sum(line_total) total from l group by 1) lt on lt.order_id = o.id
        group by 1) x), '[]'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', n, 'variant', v, 'category', cat, 'qty', q, 'gross', g, 'discounts', d,
        'refunded_qty', rq, 'refunds', ra, 'net', g - d - ra) order by g - d - ra desc) from (
        select l.item_name n, l.variant_name v, coalesce(l.category_name, 'Uncategorised') cat, sum(l.qty) q,
               sum((l.unit_price + l.modifiers_price) * l.qty) g, sum(l.discount_amount) d,
               coalesce(sum(rl.qty), 0) rq, coalesce(sum(rl.amount), 0) ra
        from l left join refunded_lines rl on rl.order_line_id = l.id group by 1, 2, 3) x), '[]'),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('name', n, 'qty', q, 'net', nt) order by nt desc) from (
        select coalesce(category_name, 'Uncategorised') n, sum(qty) q, sum(line_total) nt from l group by 1) x), '[]'),
    'modifiers', coalesce((select jsonb_agg(jsonb_build_object('set', s, 'option', op, 'qty', q, 'amount', a) order by q desc) from (
        select m->>'set' s, m->>'option' op, sum(l.qty) q, sum((m->>'price')::bigint * l.qty) a
        from l, jsonb_array_elements(l.modifiers) m group by 1, 2) x), '[]'),
    'discounts', coalesce((select jsonb_agg(jsonb_build_object('name', n, 'count', c, 'amount', a) order by a desc) from (
        select n, count(*) c, sum(a) a from (
          select l.discount->>'name' n, l.discount_amount a from l where l.discount_amount > 0
          union all
          select d.name, d.amount from public.order_discounts d join o on o.id = d.order_id where d.amount > 0) u group by 1) x), '[]'),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('name', n, 'collected_count', c, 'collected', a, 'served_count', sc, 'served', sa) order by a desc) from (
        select coalesce(cb.n, sb.n) n, coalesce(cb.c, 0) c, coalesce(cb.a, 0) a, coalesce(sb.c, 0) sc, coalesce(sb.a, 0) sa
        from (select coalesce(closed_by_name, '—') n, count(*) c, sum(total) a from o group by 1) cb
        full join (select served_by_name n, count(*) c, sum(total) a from o where served_by_name is not null group by 1) sb on sb.n = cb.n) x), '[]')
  )
$$;

create or replace function public.report_transactions(p_locations uuid[], p_from timestamptz, p_to timestamptz,
  p_kind text default 'completed', p_search text default null, p_limit int default 100, p_offset int default 0)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select case p_kind
    when 'completed' then coalesce((select jsonb_agg(x order by x->>'at' desc) from (
      select jsonb_build_object('id', o.id, 'at', o.completed_at, 'number', o.number, 'location', loc.name, 'bill', o.bill_name,
        'sales_type', coalesce((select string_agg(distinct coalesce(ol.sales_type_name, o.sales_type_name), ' + ') from public.order_lines ol where ol.order_id = o.id), o.sales_type_name), 'cashier', o.closed_by_name, 'total', o.total,
        'items', (select string_agg(case when ol.qty > 1 then ol.item_name || ' ×' || ol.qty else ol.item_name end, ', ' order by ol.sort_order) from public.order_lines ol where ol.order_id = o.id),
        'payments', (select string_agg(pm.method_name, ' + ' order by pm.paid_at) from public.payments pm where pm.order_id = o.id),
        'refunded', coalesce((select sum(amount) from public.refunds rf where rf.order_id = o.id), 0)) x
      from public.orders o join public.locations loc on loc.id = o.location_id
      where o.location_id = any (p_locations) and o.status = 'completed' and o.completed_at >= p_from and o.completed_at < p_to
        and (p_search is null or o.number ilike '%' || p_search || '%')
      order by o.completed_at desc limit p_limit offset p_offset) t), '[]')
    when 'cancelled' then coalesce((select jsonb_agg(x order by x->>'at' desc) from (
      select jsonb_build_object('id', o.id, 'at', o.cancelled_at, 'number', o.number, 'location', loc.name, 'bill', o.bill_name,
        'by', o.closed_by_name, 'reason', o.cancel_reason, 'total', o.total) x
      from public.orders o join public.locations loc on loc.id = o.location_id
      where o.location_id = any (p_locations) and o.status = 'cancelled' and o.cancelled_at >= p_from and o.cancelled_at < p_to
      order by o.cancelled_at desc limit p_limit offset p_offset) t), '[]')
    when 'voids' then coalesce((select jsonb_agg(x order by x->>'at' desc) from (
      select jsonb_build_object('id', v.id, 'at', v.voided_at, 'number', o.number, 'location', loc.name, 'bill', o.bill_name,
        'item', v.item_name, 'qty', v.qty, 'amount', v.amount, 'reason', v.reason, 'by', v.employee_name) x
      from public.order_voids v join public.orders o on o.id = v.order_id join public.locations loc on loc.id = v.location_id
      where v.location_id = any (p_locations) and v.voided_at >= p_from and v.voided_at < p_to
      order by v.voided_at desc limit p_limit offset p_offset) t), '[]')
    when 'refunds' then coalesce((select jsonb_agg(x order by x->>'at' desc) from (
      select jsonb_build_object('id', r.id, 'at', r.refunded_at, 'number', o.number, 'location', loc.name,
        'items', (select string_agg(rl.item_name || ' ×' || rl.qty, ', ') from public.refund_lines rl where rl.refund_id = r.id),
        'method', r.method_name, 'amount', r.amount, 'reason', r.reason, 'by', r.employee_name, 'restock', r.restock) x
      from public.refunds r join public.orders o on o.id = r.order_id join public.locations loc on loc.id = r.location_id
      where r.location_id = any (p_locations) and r.refunded_at >= p_from and r.refunded_at < p_to
      order by r.refunded_at desc limit p_limit offset p_offset) t), '[]')
  end
$$;
