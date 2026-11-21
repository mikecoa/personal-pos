-- New businesses: the default Manager role also gets every backoffice page (Cashier gets none).
create or replace function app.init_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.roles (account_id, name, is_system, permissions, backoffice_pages) values
    (new.id, 'Manager', true, array[
      'charge', 'bill_print', 'open_bills_manage', 'void_items', 'discounts_apply', 'refunds_issue',
      'receipts_resend', 'cash_in_out', 'shift_view_details', 'shift_history_view', 'activity_view',
      'customers_edit', 'items_manage', 'favorites_manage', 'tables_manage', 'shift_settings_manage', 'pin_approve'],
      array['dashboard','reports_sales','reports_transactions','reports_shifts','library_items','library_categories','library_modifiers','library_sales_types','library_discounts','library_quick_notes','settings_checkout','settings_payments','settings_receipt','settings_tables','settings_tablets']),
    (new.id, 'Cashier', true, array[
      'charge', 'bill_print', 'open_bills_manage', 'discounts_apply', 'receipts_resend', 'activity_view'], '{}');
  return new;
end $$;
