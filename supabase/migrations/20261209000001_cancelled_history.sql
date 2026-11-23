-- Open bills, and cancelled orders (cleared on the tablet before being saved or paid), get their
-- own report lists,
-- separate from cancelled bills; and the owner can delete cancelled orders / bills and void
-- records from the history.

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
    -- Cancelled bills: saved bills (they always have a name) cancelled with a reason.
    -- Cancelled orders: orders cleared on the tablet before they were saved or paid (no bill name).
    when 'cancelled' then coalesce((select jsonb_agg(x order by x->>'at' desc) from (
      select jsonb_build_object('id', o.id, 'at', o.cancelled_at, 'number', o.number, 'location', loc.name, 'bill', o.bill_name,
        'by', coalesce(o.closed_by_name, o.opened_by_name), 'reason', o.cancel_reason, 'total', o.total,
        'items', (select string_agg(case when ol.qty > 1 then ol.item_name || ' ×' || ol.qty else ol.item_name end, ', ' order by ol.sort_order) from public.order_lines ol where ol.order_id = o.id)) x
      from public.orders o join public.locations loc on loc.id = o.location_id
      where o.location_id = any (p_locations) and o.status = 'cancelled' and o.cancelled_at >= p_from and o.cancelled_at < p_to
        and coalesce(o.bill_name, '') <> ''
      order by o.cancelled_at desc limit p_limit offset p_offset) t), '[]')
    when 'cancelled_orders' then coalesce((select jsonb_agg(x order by x->>'at' desc) from (
      select jsonb_build_object('id', o.id, 'at', o.cancelled_at, 'number', o.number, 'location', loc.name, 'bill', o.bill_name,
        'by', coalesce(o.closed_by_name, o.opened_by_name), 'reason', o.cancel_reason, 'total', o.total,
        'items', (select string_agg(case when ol.qty > 1 then ol.item_name || ' ×' || ol.qty else ol.item_name end, ', ' order by ol.sort_order) from public.order_lines ol where ol.order_id = o.id)) x
      from public.orders o join public.locations loc on loc.id = o.location_id
      where o.location_id = any (p_locations) and o.status = 'cancelled' and o.cancelled_at >= p_from and o.cancelled_at < p_to
        and coalesce(o.bill_name, '') = ''
      order by o.cancelled_at desc limit p_limit offset p_offset) t), '[]')
    -- Open bills: saved and not paid yet, as they are right now (the date filter doesn't apply).
    when 'open' then coalesce((select jsonb_agg(x order by x->>'at' desc) from (
      select jsonb_build_object('id', o.id, 'at', o.opened_at, 'number', o.number, 'location', loc.name, 'bill', o.bill_name,
        'table', o.table_name, 'guests', o.guests, 'by', o.opened_by_name, 'total', o.total, 'updated', o.updated_at,
        'items', (select string_agg(case when ol.qty > 1 then ol.item_name || ' ×' || ol.qty else ol.item_name end, ', ' order by ol.sort_order) from public.order_lines ol where ol.order_id = o.id)) x
      from public.orders o join public.locations loc on loc.id = o.location_id
      where o.location_id = any (p_locations) and o.status = 'open'
      order by o.opened_at desc limit p_limit offset p_offset) t), '[]')
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


-- Owner-only: remove cancelled orders / bills (with their lines, discounts and voids) or individual
-- void records. Never touches sales or refunds. Returns how many records were deleted.
create or replace function public.delete_transactions(p_kind text, p_ids uuid[])
returns int
language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  if p_kind in ('cancelled', 'cancelled_orders') then
    delete from public.orders o
     where o.id = any (p_ids) and o.status = 'cancelled'
       and app.account_role(o.account_id) = 'owner';
  elsif p_kind = 'voids' then
    delete from public.order_voids v
     where v.id = any (p_ids)
       and app.account_role(v.account_id) = 'owner';
  else
    raise exception 'Only cancelled orders, cancelled bills and voided items can be removed';
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.delete_transactions(text, uuid[]) from public, anon;
grant execute on function public.delete_transactions(text, uuid[]) to authenticated;
