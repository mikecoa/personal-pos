-- "Edit favorites" (favorites_manage) never did anything on the tablet (there is no favorites
-- feature), so the permission is removed from every role and from new accounts' default roles.

update public.roles set permissions = array_remove(permissions, 'favorites_manage') where 'favorites_manage' = any (permissions);

create or replace function app.init_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.roles (account_id, name, is_system, permissions, backoffice_pages, backoffice_write) values
    (new.id, 'Manager', true, array[
      'charge', 'bill_print', 'open_bills_manage', 'void_items', 'discounts_apply', 'refunds_issue',
      'receipts_resend', 'cash_in_out', 'shift_view_details', 'shift_history_view', 'activity_view',
      'customers_edit', 'items_manage', 'tables_manage', 'shift_settings_manage', 'pin_approve',
      'custom_amount'],
     array['dashboard','reports_sales','reports_transactions','reports_shifts',
       'library_items','library_categories','library_modifiers','library_sales_types','library_discounts','library_quick_notes',
       'settings_checkout','settings_payments','settings_receipt','settings_tables','settings_tablets','employees','employee_roles'],
     array['library_items','library_categories','library_modifiers','library_sales_types','library_discounts','library_quick_notes',
       'settings_checkout','settings_payments','settings_receipt','settings_tables','settings_tablets','employees','employee_roles']),
    (new.id, 'Cashier', true, array[
      'charge', 'bill_print', 'open_bills_manage', 'discounts_apply', 'receipts_resend', 'activity_view'], '{}', '{}');
  return new;
end $$;
