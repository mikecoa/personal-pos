-- Phase 4: reporting functions for the backoffice.
--
-- All are SECURITY INVOKER: they read through RLS, so a report can only ever include
-- locations the caller may see, whatever ids are passed in.
--
-- Definitions (one place, used by every report):
--   gross sales     = Σ (line totals before line discounts)            = order.gross
--   discounts       = Σ order.discount_total (line + bill discounts)
--   refunds         = Σ refunds.amount refunded in the period (money given back)
--   net sales       = gross − discounts − refunds
--   tax / service   = Σ order.tax_total / gratuity_total
--   total collected = Σ order.total − refunds                           (= money kept)
-- A sale belongs to the day it was completed; a refund to the day it was given.
-- Days and hours are bucketed in p_tz (the business's timezone).

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
    'sales_types', coalesce((select jsonb_agg(jsonb_build_object('name', n, 'count', c, 'net', nt) order by nt desc) from (
        select coalesce(sales_type_name, '—') n, count(*) c, sum(gross - discount_total) nt from o group by 1) x), '[]'),
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

-- Transactions list: completed sales, cancelled bills, voids or refunds, newest first.
create or replace function public.report_transactions(p_locations uuid[], p_from timestamptz, p_to timestamptz,
  p_kind text default 'completed', p_search text default null, p_limit int default 100, p_offset int default 0)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select case p_kind
    when 'completed' then coalesce((select jsonb_agg(x order by x->>'at' desc) from (
      select jsonb_build_object('id', o.id, 'at', o.completed_at, 'number', o.number, 'location', loc.name, 'bill', o.bill_name,
        'sales_type', o.sales_type_name, 'cashier', o.closed_by_name, 'total', o.total,
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

-- Shifts overlapping the period.
create or replace function public.report_shifts(p_locations uuid[], p_from timestamptz, p_to timestamptz)
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'location', loc.name, 'device', d.name, 'status', s.status,
      'opened_at', s.opened_at, 'opened_by', s.opened_by_name, 'closed_at', s.closed_at, 'closed_by', s.closed_by_name,
      'starting_cash', s.starting_cash, 'expected_cash', s.expected_cash, 'actual_cash', s.actual_cash,
      'difference', s.actual_cash - s.expected_cash, 'summary', s.summary,
      'sales', (select count(*) from public.orders o where o.shift_id = s.id and o.status = 'completed'),
      'takings', (select coalesce(sum(total), 0) from public.orders o where o.shift_id = s.id and o.status = 'completed'),
      'movements', coalesce((select jsonb_agg(jsonb_build_object('kind', m.kind, 'amount', m.amount, 'description', m.description, 'by', m.employee_name, 'at', m.moved_at) order by m.moved_at)
                    from public.cash_movements m where m.shift_id = s.id), '[]'))
    order by s.opened_at desc), '[]')
  from public.shifts s join public.locations loc on loc.id = s.location_id join public.devices d on d.id = s.device_id
  where s.location_id = any (p_locations) and s.opened_at < p_to and coalesce(s.closed_at, 'infinity') >= p_from
$$;

grant execute on function public.report_sales(uuid[], timestamptz, timestamptz, text),
  public.report_transactions(uuid[], timestamptz, timestamptz, text, text, int, int),
  public.report_shifts(uuid[], timestamptz, timestamptz) to authenticated;
