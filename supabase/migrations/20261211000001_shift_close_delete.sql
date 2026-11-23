-- Backoffice: owners and admins can close a shift a tablet left open; owners can remove shifts
-- from the history. Sales and refunds are kept (they just no longer point at a shift).

create or replace function public.close_shift(p_shift uuid, p_counted bigint)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.shifts;
  v_expected bigint;
  v_name text;
begin
  select * into s from public.shifts where id = p_shift for update;
  if not found or app.account_role(s.account_id) not in ('owner', 'admin') then
    raise exception 'Shift not found' using errcode = '42501';
  end if;
  if s.status = 'closed' then raise exception 'This shift is already closed.'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'Enter the counted cash.'; end if;

  -- Expected cash = starting cash + cash taken − cash refunded + cash in − cash out.
  select s.starting_cash
       + coalesce((select sum(p.amount) from public.payments p join public.orders o on o.id = p.order_id
                    where o.shift_id = s.id and o.status = 'completed' and p.kind = 'cash'), 0)
       - coalesce((select sum(r.amount) from public.refunds r where r.shift_id = s.id and r.kind = 'cash'), 0)
       + coalesce((select sum(case m.kind when 'in' then m.amount else -m.amount end) from public.cash_movements m where m.shift_id = s.id), 0)
    into v_expected;
  select coalesce(u.email, 'Backoffice') into v_name from auth.users u where u.id = auth.uid();

  update public.shifts
     set status = 'closed', version = version + 1, closed_at = now(), closed_by = null,
         closed_by_name = v_name || ' (backoffice)', expected_cash = v_expected, actual_cash = p_counted, updated_at = now()
   where id = s.id;
end $$;

create or replace function public.delete_shifts(p_ids uuid[])
returns int
language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[]; v_count int;
begin
  select array_agg(s.id) into v_ids from public.shifts s
   where s.id = any (p_ids) and s.status = 'closed' and app.account_role(s.account_id) = 'owner';
  if v_ids is null then return 0; end if;
  update public.orders set shift_id = null where shift_id = any (v_ids);
  update public.refunds set shift_id = null where shift_id = any (v_ids);
  delete from public.shifts where id = any (v_ids);   -- cash movements go with it
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.close_shift(uuid, bigint) from public, anon;
revoke all on function public.delete_shifts(uuid[]) from public, anon;
grant execute on function public.close_shift(uuid, bigint) to authenticated;
grant execute on function public.delete_shifts(uuid[]) to authenticated;
