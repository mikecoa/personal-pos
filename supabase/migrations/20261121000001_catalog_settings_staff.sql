-- Phase 1: catalog, per-location settings, payment methods, roles and employees.
--
-- Same isolation pattern as the foundation migration:
--   * every location-scoped row carries (account_id, location_id)
--   * composite FKs pin children to the SAME location as their parent
--   * RLS: read with any access to the location, write as owner/admin of it
-- Money is integer rupiah (bigint). Percentages are basis points (10% = 1000).

-- ───────────────────────────────────────────────────────────── enums
create type app.payment_kind  as enum ('cash', 'qr', 'card', 'delivery', 'other', 'invoice');
create type app.discount_kind as enum ('percent', 'amount');
create type app.discount_scope as enum ('bill', 'item', 'both');

-- Targets for composite FKs (same id, same location).
alter table public.categories add constraint categories_id_location_key unique (id, location_id);

-- ───────────────────────────────────────────────────────────── per-location setup
create table public.location_settings (
  location_id            uuid primary key,
  account_id             uuid not null,
  tax_enabled            boolean not null default false,
  tax_name               text not null default 'PB1',
  tax_rate_bp            int not null default 1000 check (tax_rate_bp between 0 and 10000),
  gratuity_enabled       boolean not null default false,
  gratuity_name          text not null default 'Service',
  gratuity_rate_bp       int not null default 500 check (gratuity_rate_bp between 0 and 10000),
  prices_include_tax     boolean not null default false,
  tax_after_discount     boolean not null default true,
  rounding_enabled       boolean not null default false,
  rounding_unit          int not null default 100 check (rounding_unit in (50, 100, 500, 1000)),
  rounding_mode          text not null default 'nearest' check (rounding_mode in ('nearest', 'down', 'up')),
  stock_limit_enabled    boolean not null default false,
  track_server           boolean not null default false,
  split_payment_enabled  boolean not null default true,
  save_bill_enabled      boolean not null default true,
  auto_shift_enabled     boolean not null default false,
  default_starting_cash  bigint not null default 0 check (default_starting_cash >= 0),
  updated_at             timestamptz not null default now(),
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade
);

create table public.receipt_profiles (
  location_id   uuid primary key,
  account_id    uuid not null,
  logo_url      text,
  header_name   text not null default '',
  address       text,
  phone         text,
  social        text,
  footer        text default 'Terima kasih!',
  show_server   boolean not null default true,
  show_cashier  boolean not null default true,
  updated_at    timestamptz not null default now(),
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade
);

create table public.payment_methods (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null,
  location_id  uuid not null,
  name         text not null check (length(trim(name)) between 1 and 60),
  kind         app.payment_kind not null,
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade
);
create unique index payment_methods_name_uq on public.payment_methods (location_id, lower(name));

create table public.sales_types (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null,
  location_id  uuid not null,
  name         text not null check (length(trim(name)) between 1 and 60),
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade,
  unique (id, location_id)
);
create unique index sales_types_name_uq on public.sales_types (location_id, lower(name));

-- ───────────────────────────────────────────────────────────── catalog
create table public.items (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null,
  location_id  uuid not null,
  category_id  uuid,
  name         text not null check (length(trim(name)) between 1 and 120),
  description  text,
  image_url    text,
  track_stock  boolean not null default false,
  stock        int not null default 0,
  stock_alert  int check (stock_alert is null or stock_alert >= 0),
  avg_cost     bigint check (avg_cost is null or avg_cost >= 0),
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  source_key   uuid not null default gen_random_uuid(),  -- shared by copies across locations
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade,
  foreign key (category_id, location_id) references public.categories (id, location_id) on delete set null (category_id),
  unique (id, location_id),
  unique (location_id, source_key)
);
create unique index items_name_uq on public.items (location_id, lower(name));
create index items_category_idx on public.items (category_id);

create table public.item_variants (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null,
  location_id  uuid not null,
  item_id      uuid not null,
  name         text not null default '',          -- '' = the single default variant
  price        bigint not null check (price >= 0),
  sku          text,
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade,
  foreign key (item_id, location_id) references public.items (id, location_id) on delete cascade,
  unique (id, location_id)
);
create unique index item_variants_name_uq on public.item_variants (item_id, lower(name));
create index item_variants_item_idx on public.item_variants (item_id);

create table public.variant_sales_type_prices (
  account_id     uuid not null,
  location_id    uuid not null,
  variant_id     uuid not null,
  sales_type_id  uuid not null,
  price          bigint not null check (price >= 0),
  primary key (variant_id, sales_type_id),
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade,
  foreign key (variant_id, location_id) references public.item_variants (id, location_id) on delete cascade,
  foreign key (sales_type_id, location_id) references public.sales_types (id, location_id) on delete cascade
);

create table public.modifier_sets (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null,
  location_id  uuid not null,
  name         text not null check (length(trim(name)) between 1 and 60),
  min_select   int not null default 0 check (min_select >= 0),
  max_select   int check (max_select is null or max_select >= 1),   -- null = no limit
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade,
  unique (id, location_id),
  check (max_select is null or max_select >= min_select)
);
create unique index modifier_sets_name_uq on public.modifier_sets (location_id, lower(name));

create table public.modifier_options (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null,
  location_id      uuid not null,
  modifier_set_id  uuid not null,
  name             text not null check (length(trim(name)) between 1 and 60),
  price            bigint not null default 0 check (price >= 0),
  is_active        boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade,
  foreign key (modifier_set_id, location_id) references public.modifier_sets (id, location_id) on delete cascade
);
create unique index modifier_options_name_uq on public.modifier_options (modifier_set_id, lower(name));

create table public.item_modifier_sets (
  account_id       uuid not null,
  location_id      uuid not null,
  item_id          uuid not null,
  modifier_set_id  uuid not null,
  sort_order       int not null default 0,
  primary key (item_id, modifier_set_id),
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade,
  foreign key (item_id, location_id) references public.items (id, location_id) on delete cascade,
  foreign key (modifier_set_id, location_id) references public.modifier_sets (id, location_id) on delete cascade
);

create table public.discounts (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null,
  location_id  uuid not null,
  name         text not null check (length(trim(name)) between 1 and 60),
  kind         app.discount_kind not null,
  value        bigint not null check (value > 0),     -- percent: basis points; amount: rupiah
  scope        app.discount_scope not null default 'both',
  is_active    boolean not null default true,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade,
  check (kind <> 'percent' or value <= 10000)
);
create unique index discounts_name_uq on public.discounts (location_id, lower(name));

-- ───────────────────────────────────────────────────────────── staff (account level)
create table public.roles (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts (id) on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 40),
  permissions  text[] not null default '{}',
  is_system    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, account_id)
);
create unique index roles_name_uq on public.roles (account_id, lower(name));

create table public.employees (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  role_id     uuid not null,
  name        text not null check (length(trim(name)) between 1 and 80),
  phone       text,
  pin_hash    text,                                        -- bcrypt; never readable by clients
  has_pin     boolean generated always as (pin_hash is not null) stored,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (role_id, account_id) references public.roles (id, account_id),
  unique (id, account_id)
);

create table public.employee_locations (
  account_id   uuid not null,
  employee_id  uuid not null,
  location_id  uuid not null,
  primary key (employee_id, location_id),
  foreign key (employee_id, account_id) references public.employees (id, account_id) on delete cascade,
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade
);

-- pin_hash is write-only through set_employee_pin(); hide it from API reads/writes.
revoke select, insert, update on public.employees from anon, authenticated;
grant select (id, account_id, role_id, name, phone, has_pin, is_active, created_at, updated_at)
  on public.employees to authenticated;
grant insert (id, account_id, role_id, name, phone, is_active) on public.employees to authenticated;
grant update (role_id, name, phone, is_active) on public.employees to authenticated;

-- ───────────────────────────────────────────────────────────── RLS
-- Location-scoped catalog/config tables: identical policy set.
do $$
declare t text;
begin
  foreach t in array array[
    'payment_methods', 'sales_types', 'items', 'item_variants', 'variant_sales_type_prices',
    'modifier_sets', 'modifier_options', 'item_modifier_sets', 'discounts'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.location_role(location_id) is not null)', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app.can_manage_location(location_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app.can_manage_location(location_id)) with check (app.can_manage_location(location_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (app.can_manage_location(location_id))', t || '_delete', t);
  end loop;
end $$;

-- One row per location, created by trigger: read + update only.
do $$
declare t text;
begin
  foreach t in array array['location_settings', 'receipt_profiles'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (app.location_role(location_id) is not null)', t || '_select', t);
    execute format('create policy %I on public.%I for update to authenticated using (app.can_manage_location(location_id)) with check (app.can_manage_location(location_id))', t || '_update', t);
  end loop;
end $$;

-- Roles / employees: visible to account members; managed by the owner.
alter table public.roles enable row level security;
alter table public.employees enable row level security;
alter table public.employee_locations enable row level security;

create policy roles_select on public.roles for select to authenticated
  using (app.account_role(account_id) is not null);
create policy roles_write on public.roles for all to authenticated
  using (app.account_role(account_id) = 'owner') with check (app.account_role(account_id) = 'owner');

create policy employees_select on public.employees for select to authenticated
  using (app.account_role(account_id) is not null);
create policy employees_write on public.employees for all to authenticated
  using (app.account_role(account_id) = 'owner') with check (app.account_role(account_id) = 'owner');

create policy employee_locations_select on public.employee_locations for select to authenticated
  using (app.account_role(account_id) is not null);
create policy employee_locations_write on public.employee_locations for all to authenticated
  using (app.account_role(account_id) = 'owner') with check (app.account_role(account_id) = 'owner');

-- ───────────────────────────────────────────────────────────── triggers
do $$
declare t text;
begin
  foreach t in array array[
    'payment_methods', 'sales_types', 'items', 'item_variants', 'modifier_sets',
    'modifier_options', 'discounts', 'location_settings', 'receipt_profiles', 'roles', 'employees'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.touch_updated_at()', t || '_touch', t);
  end loop;
  foreach t in array array[
    'payment_methods', 'sales_types', 'items', 'item_variants', 'variant_sales_type_prices',
    'modifier_sets', 'modifier_options', 'item_modifier_sets', 'discounts'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function app.freeze_scope()', t || '_freeze_scope', t);
  end loop;
end $$;

-- New location → default settings, receipt header, payment methods, sales types.
create or replace function app.init_location() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.location_settings (location_id, account_id) values (new.id, new.account_id);
  insert into public.receipt_profiles (location_id, account_id, header_name, address, phone)
    values (new.id, new.account_id, new.name, new.address, new.phone);
  insert into public.payment_methods (account_id, location_id, name, kind, sort_order) values
    (new.account_id, new.id, 'Cash', 'cash', 1),
    (new.account_id, new.id, 'QRIS', 'qr', 2),
    (new.account_id, new.id, 'Card', 'card', 3),
    (new.account_id, new.id, 'Other', 'other', 4);
  insert into public.sales_types (account_id, location_id, name, sort_order) values
    (new.account_id, new.id, 'Dine In', 1),
    (new.account_id, new.id, 'Take Away', 2);
  return new;
end $$;

create trigger locations_init after insert on public.locations
  for each row execute function app.init_location();

-- New account → default roles.
create or replace function app.init_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.roles (account_id, name, is_system, permissions) values
    (new.id, 'Manager', true, array[
      'charge', 'bill_print', 'open_bills_manage', 'void_items', 'discounts_apply', 'refunds_issue',
      'receipts_resend', 'cash_in_out', 'shift_view_details', 'shift_history_view', 'activity_view',
      'customers_edit', 'items_manage', 'favorites_manage']),
    (new.id, 'Cashier', true, array[
      'charge', 'bill_print', 'open_bills_manage', 'discounts_apply', 'receipts_resend', 'activity_view']);
  return new;
end $$;

create trigger accounts_init after insert on public.accounts
  for each row execute function app.init_account();

-- ───────────────────────────────────────────────────────────── RPCs
-- Set (or clear with NULL) an employee's 4-digit PIN. PINs are unique per account.
create or replace function public.set_employee_pin(p_employee uuid, p_pin text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_account uuid;
begin
  select account_id into v_account from public.employees where id = p_employee;
  if v_account is null or app.account_role(v_account) is distinct from 'owner' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_pin is null then
    update public.employees set pin_hash = null where id = p_employee;
    return;
  end if;
  if p_pin !~ '^\d{4}$' then
    raise exception 'PIN must be exactly 4 digits' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.employees e
    where e.account_id = v_account and e.id <> p_employee and e.pin_hash is not null
      and e.pin_hash = extensions.crypt(p_pin, e.pin_hash)
  ) then
    raise exception 'PIN already used by another employee' using errcode = '23505';
  end if;
  update public.employees set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8))
  where id = p_employee;
end $$;

revoke all on function public.set_employee_pin(uuid, text) from public, anon;
grant execute on function public.set_employee_pin(uuid, text) to authenticated;

-- Create or update an item with its variants, per-sales-type prices and modifier sets
-- in one transaction. SECURITY INVOKER: every write is checked by RLS.
--
-- p_item: {
--   id?, location_id, name, category_id?, description?, image_url?, is_active?,
--   track_stock?, stock?, stock_alert?, avg_cost?,
--   variants: [{ id?, name, price, sku?, prices?: { "<sales_type_id>": price } }],
--   modifier_set_ids: [uuid]
-- }
create or replace function public.save_item(p_item jsonb)
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id        uuid := nullif(p_item->>'id', '')::uuid;
  v_location  uuid := (p_item->>'location_id')::uuid;
  v_account   uuid;
  v_variant   jsonb;
  v_var_id    uuid;
  v_price     record;
  v_i         int := 0;
begin
  select account_id into v_account from public.locations where id = v_location;
  if v_account is null then raise exception 'location not found' using errcode = '42501'; end if;

  if jsonb_array_length(coalesce(p_item->'variants', '[]')) = 0 then
    raise exception 'an item needs at least one price' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.items (account_id, location_id, category_id, name, description, image_url,
      is_active, track_stock, stock, stock_alert, avg_cost)
    values (v_account, v_location, nullif(p_item->>'category_id', '')::uuid, trim(p_item->>'name'),
      nullif(trim(p_item->>'description'), ''), nullif(p_item->>'image_url', ''),
      coalesce((p_item->>'is_active')::boolean, true),
      coalesce((p_item->>'track_stock')::boolean, false),
      coalesce((p_item->>'stock')::int, 0),
      nullif(p_item->>'stock_alert', '')::int,
      nullif(p_item->>'avg_cost', '')::bigint)
    returning id into v_id;
  else
    -- Stock is only set on creation; later changes go through stock adjustments.
    update public.items set
      category_id = nullif(p_item->>'category_id', '')::uuid,
      name        = trim(p_item->>'name'),
      description = nullif(trim(p_item->>'description'), ''),
      image_url   = nullif(p_item->>'image_url', ''),
      is_active   = coalesce((p_item->>'is_active')::boolean, true),
      track_stock = coalesce((p_item->>'track_stock')::boolean, false),
      stock_alert = nullif(p_item->>'stock_alert', '')::int,
      avg_cost    = nullif(p_item->>'avg_cost', '')::bigint
    where id = v_id and location_id = v_location;
    if not found then raise exception 'item not found' using errcode = '42501'; end if;
  end if;

  -- Remove variants that are no longer listed BEFORE upserting, so a new variant may
  -- reuse the name of one that was just removed.
  delete from public.item_variants
  where item_id = v_id
    and id not in (
      select nullif(v->>'id', '')::uuid from jsonb_array_elements(p_item->'variants') v
      where nullif(v->>'id', '') is not null
    );

  for v_variant in select * from jsonb_array_elements(p_item->'variants') loop
    v_i := v_i + 1;
    v_var_id := nullif(v_variant->>'id', '')::uuid;
    if v_var_id is null then
      insert into public.item_variants (account_id, location_id, item_id, name, price, sku, sort_order)
      values (v_account, v_location, v_id, coalesce(trim(v_variant->>'name'), ''),
        (v_variant->>'price')::bigint, nullif(trim(v_variant->>'sku'), ''), v_i)
      returning id into v_var_id;
    else
      update public.item_variants set
        name = coalesce(trim(v_variant->>'name'), ''), price = (v_variant->>'price')::bigint,
        sku = nullif(trim(v_variant->>'sku'), ''), sort_order = v_i
      where id = v_var_id and item_id = v_id;
      if not found then raise exception 'variant not found' using errcode = '42501'; end if;
    end if;

    delete from public.variant_sales_type_prices where variant_id = v_var_id;
    for v_price in select key, value from jsonb_each_text(coalesce(v_variant->'prices', '{}')) loop
      if v_price.value is not null and v_price.value <> '' then
        insert into public.variant_sales_type_prices (account_id, location_id, variant_id, sales_type_id, price)
        values (v_account, v_location, v_var_id, v_price.key::uuid, v_price.value::bigint);
      end if;
    end loop;
  end loop;

  delete from public.item_modifier_sets where item_id = v_id;
  insert into public.item_modifier_sets (account_id, location_id, item_id, modifier_set_id, sort_order)
  select v_account, v_location, v_id, s.id::uuid, s.ord
  from jsonb_array_elements_text(coalesce(p_item->'modifier_set_ids', '[]')) with ordinality as s(id, ord);

  return v_id;
end $$;

grant execute on function public.save_item(jsonb) to authenticated;

-- Copy items (with variants, category, modifier sets and per-sales-type prices) into other
-- locations. Matching rules in the target location:
--   item          same source_key → updated, otherwise created
--   category      same name (case-insensitive) → reused, otherwise created
--   modifier set  same name → reused (options added if missing), otherwise copied
--   sales type    same name → price copied; missing sales types are skipped
-- SECURITY INVOKER: caller must be able to read the source and manage every target.
create or replace function public.copy_items_to_locations(p_item_ids uuid[], p_target_locations uuid[])
returns int
language plpgsql security invoker set search_path = '' as $$
declare
  v_target   uuid;
  v_account  uuid;
  v_src      public.items%rowtype;
  v_cat      uuid;
  v_item     uuid;
  v_set      record;
  v_new_set  uuid;
  v_var      record;
  v_new_var  uuid;
  v_count    int := 0;
begin
  foreach v_target in array p_target_locations loop
    if not app.can_manage_location(v_target) then
      raise exception 'not allowed to manage target location' using errcode = '42501';
    end if;
    select account_id into v_account from public.locations where id = v_target;

    for v_src in select * from public.items where id = any (p_item_ids) and location_id <> v_target loop
      if v_src.account_id <> v_account then
        raise exception 'cannot copy across businesses' using errcode = '42501';
      end if;

      -- category by name
      v_cat := null;
      if v_src.category_id is not null then
        select c2.id into v_cat from public.categories c1
          join public.categories c2 on c2.location_id = v_target and lower(c2.name) = lower(c1.name)
          where c1.id = v_src.category_id;
        if v_cat is null then
          insert into public.categories (account_id, location_id, name, sort_order)
          select v_account, v_target, name, sort_order from public.categories where id = v_src.category_id
          returning id into v_cat;
        end if;
      end if;

      -- item by source_key (fall back to same name to avoid a unique-name clash)
      select id into v_item from public.items
        where location_id = v_target and (source_key = v_src.source_key or lower(name) = lower(v_src.name))
        order by (source_key = v_src.source_key) desc limit 1;
      if v_item is null then
        insert into public.items (account_id, location_id, category_id, name, description, image_url,
          track_stock, stock_alert, avg_cost, is_active, sort_order, source_key)
        values (v_account, v_target, v_cat, v_src.name, v_src.description, v_src.image_url,
          v_src.track_stock, v_src.stock_alert, v_src.avg_cost, v_src.is_active, v_src.sort_order, v_src.source_key)
        returning id into v_item;
      else
        update public.items set category_id = v_cat, name = v_src.name, description = v_src.description,
          image_url = v_src.image_url, track_stock = v_src.track_stock, stock_alert = v_src.stock_alert,
          avg_cost = v_src.avg_cost, is_active = v_src.is_active, source_key = v_src.source_key
        where id = v_item;
      end if;

      -- variants: replace wholesale (matched by name so ids of unchanged names survive)
      delete from public.item_variants v where v.item_id = v_item
        and not exists (select 1 from public.item_variants s where s.item_id = v_src.id and lower(s.name) = lower(v.name));
      for v_var in select * from public.item_variants where item_id = v_src.id order by sort_order loop
        select id into v_new_var from public.item_variants where item_id = v_item and lower(name) = lower(v_var.name);
        if v_new_var is null then
          insert into public.item_variants (account_id, location_id, item_id, name, price, sku, is_active, sort_order)
          values (v_account, v_target, v_item, v_var.name, v_var.price, v_var.sku, v_var.is_active, v_var.sort_order)
          returning id into v_new_var;
        else
          update public.item_variants set price = v_var.price, sku = v_var.sku, is_active = v_var.is_active,
            sort_order = v_var.sort_order where id = v_new_var;
        end if;

        delete from public.variant_sales_type_prices where variant_id = v_new_var;
        insert into public.variant_sales_type_prices (account_id, location_id, variant_id, sales_type_id, price)
        select v_account, v_target, v_new_var, st2.id, p.price
        from public.variant_sales_type_prices p
        join public.sales_types st1 on st1.id = p.sales_type_id
        join public.sales_types st2 on st2.location_id = v_target and lower(st2.name) = lower(st1.name)
        where p.variant_id = v_var.id;
      end loop;

      -- modifier sets by name
      delete from public.item_modifier_sets where item_id = v_item;
      for v_set in
        select ms.*, ims.sort_order as link_order from public.item_modifier_sets ims
        join public.modifier_sets ms on ms.id = ims.modifier_set_id
        where ims.item_id = v_src.id
      loop
        select id into v_new_set from public.modifier_sets where location_id = v_target and lower(name) = lower(v_set.name);
        if v_new_set is null then
          insert into public.modifier_sets (account_id, location_id, name, min_select, max_select, sort_order)
          values (v_account, v_target, v_set.name, v_set.min_select, v_set.max_select, v_set.sort_order)
          returning id into v_new_set;
        end if;
        insert into public.modifier_options (account_id, location_id, modifier_set_id, name, price, is_active, sort_order)
        select v_account, v_target, v_new_set, o.name, o.price, o.is_active, o.sort_order
        from public.modifier_options o where o.modifier_set_id = v_set.id
          and not exists (select 1 from public.modifier_options x where x.modifier_set_id = v_new_set and lower(x.name) = lower(o.name));
        insert into public.item_modifier_sets (account_id, location_id, item_id, modifier_set_id, sort_order)
        values (v_account, v_target, v_item, v_new_set, v_set.link_order);
      end loop;

      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end $$;

grant execute on function public.copy_items_to_locations(uuid[], uuid[]) to authenticated;
