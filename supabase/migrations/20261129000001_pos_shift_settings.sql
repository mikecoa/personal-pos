-- Shift options from the tablet (Shift → Shift option): start shifts automatically and the
-- default starting cash. These are location settings, shared by every tablet at the location.
-- The tablet checks the employee's `shift_settings_manage` permission; the server checks the
-- device and only touches the device's own location. Returns the new settings row.

create or replace function app.init_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.roles (account_id, name, is_system, permissions) values
    (new.id, 'Manager', true, array[
      'charge', 'bill_print', 'open_bills_manage', 'void_items', 'discounts_apply', 'refunds_issue',
      'receipts_resend', 'cash_in_out', 'shift_view_details', 'shift_history_view', 'activity_view',
      'customers_edit', 'items_manage', 'favorites_manage', 'tables_manage', 'shift_settings_manage']),
    (new.id, 'Cashier', true, array[
      'charge', 'bill_print', 'open_bills_manage', 'discounts_apply', 'receipts_resend', 'activity_view']);
  return new;
end $$;

update public.roles set permissions = array_append(permissions, 'shift_settings_manage')
where is_system and name = 'Manager' and not ('shift_settings_manage' = any (permissions));

create or replace function public.pos_shift_settings(p_device uuid, p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_dev  public.devices;
  v_cash bigint := (p->>'default_starting_cash')::bigint;
  v_row  public.location_settings;
begin
  select * into v_dev from public.devices where id = p_device and revoked_at is null;
  if v_dev.id is null or not app.can_manage_location(v_dev.location_id) then
    raise exception 'device not registered or not allowed' using errcode = '42501';
  end if;
  if p ? 'default_starting_cash' and (v_cash is null or v_cash < 0 or v_cash > 1000000000) then
    raise exception 'Starting cash must be between 0 and 1.000.000.000' using errcode = '22023';
  end if;
  update public.location_settings set
    auto_shift_enabled    = case when p ? 'auto_shift_enabled' then (p->>'auto_shift_enabled')::boolean else auto_shift_enabled end,
    default_starting_cash = case when p ? 'default_starting_cash' then v_cash else default_starting_cash end
  where location_id = v_dev.location_id
  returning * into v_row;
  update public.devices set last_seen_at = now() where id = p_device;
  return to_jsonb(v_row) - 'account_id' - 'updated_at';
end $$;

revoke execute on function public.pos_shift_settings(uuid, jsonb) from public, anon;
grant execute on function public.pos_shift_settings(uuid, jsonb) to authenticated;
