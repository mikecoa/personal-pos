-- Manager PIN approval (like Moka's PIN Access).
--
-- pin_required_actions: tablet actions that need a manager's PIN at this location even when the
-- cashier's role allows them (e.g. refunds). Actions a role doesn't allow can also be unlocked
-- with a manager's PIN. Who can approve: employees whose role has `pin_approve` (Managers by
-- default). The check runs on the tablet against the PINs it already holds for unlocking, so it
-- works offline.

alter table public.location_settings
  add column pin_required_actions text[] not null default '{}'
    check (pin_required_actions <@ array['open_bills_manage', 'void_items', 'discounts_apply', 'refunds_issue', 'receipts_resend',
                                         'activity_view', 'shift_history_view', 'customers_edit', 'cash_in_out', 'bill_print']);

create or replace function app.init_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.roles (account_id, name, is_system, permissions) values
    (new.id, 'Manager', true, array[
      'charge', 'bill_print', 'open_bills_manage', 'void_items', 'discounts_apply', 'refunds_issue',
      'receipts_resend', 'cash_in_out', 'shift_view_details', 'shift_history_view', 'activity_view',
      'customers_edit', 'items_manage', 'favorites_manage', 'tables_manage', 'shift_settings_manage', 'pin_approve']),
    (new.id, 'Cashier', true, array[
      'charge', 'bill_print', 'open_bills_manage', 'discounts_apply', 'receipts_resend', 'activity_view']);
  return new;
end $$;

update public.roles set permissions = array_append(permissions, 'pin_approve')
where is_system and name = 'Manager' and not ('pin_approve' = any (permissions));
