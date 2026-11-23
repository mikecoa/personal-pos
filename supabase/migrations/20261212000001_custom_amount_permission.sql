-- New tablet permission "custom_amount": typing a price by hand (Custom amount) instead of picking a
-- menu item. Without it, a manager's PIN is asked. Roles that can void items (Owner, Manager) get it;
-- cashiers don't by default (the owner can tick it under Employee access).

create or replace function app.init_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.roles (account_id, name, is_system, permissions) values
    (new.id, 'Manager', true, array[
      'charge', 'bill_print', 'open_bills_manage', 'void_items', 'discounts_apply', 'refunds_issue',
      'receipts_resend', 'cash_in_out', 'shift_view_details', 'shift_history_view', 'activity_view',
      'customers_edit', 'items_manage', 'favorites_manage', 'tables_manage', 'shift_settings_manage', 'pin_approve',
      'custom_amount']),
    (new.id, 'Cashier', true, array[
      'charge', 'bill_print', 'open_bills_manage', 'discounts_apply', 'receipts_resend', 'activity_view']);
  return new;
end $$;

update public.roles set permissions = array_append(permissions, 'custom_amount')
where 'void_items' = any (permissions) and not ('custom_amount' = any (permissions));
