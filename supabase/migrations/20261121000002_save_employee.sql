-- Save an employee, their locations and (optionally) their PIN in ONE transaction,
-- so a rejected PIN never leaves a half-created employee behind.
--
-- p: { id?, account_id, name, phone?, role_id, is_active, location_ids: [uuid],
--      pin?: "1234" (set), clear_pin?: true (remove) }
create or replace function public.save_employee(p jsonb)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id       uuid := nullif(p->>'id', '')::uuid;
  v_account  uuid := (p->>'account_id')::uuid;
  v_pin      text := nullif(p->>'pin', '');
  v_locs     uuid[] := array(select jsonb_array_elements_text(coalesce(p->'location_ids', '[]'))::uuid);
begin
  if app.account_role(v_account) is distinct from 'owner' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if coalesce(array_length(v_locs, 1), 0) = 0 then
    raise exception 'choose at least one location' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_locs) l where not exists (
      select 1 from public.locations x where x.id = l and x.account_id = v_account)) then
    raise exception 'location not in this business' using errcode = '42501';
  end if;

  if v_id is null then
    insert into public.employees (account_id, role_id, name, phone, is_active)
    values (v_account, (p->>'role_id')::uuid, trim(p->>'name'), nullif(trim(p->>'phone'), ''),
      coalesce((p->>'is_active')::boolean, true))
    returning id into v_id;
  else
    update public.employees set role_id = (p->>'role_id')::uuid, name = trim(p->>'name'),
      phone = nullif(trim(p->>'phone'), ''), is_active = coalesce((p->>'is_active')::boolean, true)
    where id = v_id and account_id = v_account;
    if not found then raise exception 'employee not found' using errcode = '42501'; end if;
  end if;

  delete from public.employee_locations where employee_id = v_id;
  insert into public.employee_locations (account_id, employee_id, location_id)
    select v_account, v_id, l from unnest(v_locs) l;

  if v_pin is not null then
    perform public.set_employee_pin(v_id, v_pin);       -- raises on bad/duplicate PIN → whole call rolls back
  elsif coalesce((p->>'clear_pin')::boolean, false) then
    perform public.set_employee_pin(v_id, null);
  end if;
  return v_id;
end $$;

revoke all on function public.save_employee(jsonb) from public, anon;
grant execute on function public.save_employee(jsonb) to authenticated;
