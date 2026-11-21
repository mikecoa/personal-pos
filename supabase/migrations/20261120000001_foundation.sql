-- Phase 0 foundation: accounts, members, locations, per-location access.
--
-- Isolation model
--   account (business) ─┬─ members (user ↔ account, role)
--                       ├─ locations
--                       └─ member_locations (which locations a non-owner can use)
--
-- Every operational table carries (account_id, location_id) with a composite
-- FK to locations(id, account_id), so a row can never point at a location of
-- another account. RLS then checks app.location_role(location_id).

create schema if not exists app;
grant usage on schema app to authenticated, anon;

-- ─────────────────────────────────────────────────────────────── types
create type app.member_role as enum ('owner', 'admin', 'staff');

-- ─────────────────────────────────────────────────────────────── tables
create table public.accounts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 120),
  owner_id    uuid not null references auth.users (id) on delete restrict,
  created_at  timestamptz not null default now()
);

create table public.members (
  account_id    uuid not null references public.accounts (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          app.member_role not null default 'staff',
  display_name  text,
  created_at    timestamptz not null default now(),
  primary key (account_id, user_id)
);
create index members_user_idx on public.members (user_id);

create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 120),
  address     text,
  phone       text,
  timezone    text not null default 'Asia/Jakarta',
  currency    char(3) not null default 'IDR',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (id, account_id),               -- target for composite FKs
  unique (account_id, name)
);
create index locations_account_idx on public.locations (account_id);

create table public.member_locations (
  account_id   uuid not null,
  user_id      uuid not null,
  location_id  uuid not null,
  primary key (user_id, location_id),
  foreign key (account_id, user_id) references public.members (account_id, user_id) on delete cascade,
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade
);

-- First location-scoped table; Phase 1 adds the rest of the catalog with the same pattern.
create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null,
  location_id  uuid not null,
  name         text not null check (length(trim(name)) between 1 and 80),
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (location_id, account_id) references public.locations (id, account_id) on delete cascade,
  unique (location_id, name)
);
create index categories_location_idx on public.categories (location_id);

-- ─────────────────────────────────────────────────────────────── helpers
-- SECURITY DEFINER so policies can read membership without recursive RLS.

create or replace function app.account_role(p_account uuid)
returns app.member_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.members m
  where m.account_id = p_account and m.user_id = auth.uid()
$$;

-- Role the current user has at a location, or NULL when no access.
-- Owners reach every location of their account; admins/staff only the
-- locations listed in member_locations.
create or replace function app.location_role(p_location uuid)
returns app.member_role
language sql stable security definer set search_path = '' as $$
  select m.role
  from public.locations l
  join public.members m on m.account_id = l.account_id and m.user_id = auth.uid()
  where l.id = p_location
    and (
      m.role = 'owner'
      or exists (
        select 1 from public.member_locations ml
        where ml.location_id = l.id and ml.user_id = auth.uid()
      )
    )
$$;

create or replace function app.can_manage_location(p_location uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.location_role(p_location) in ('owner', 'admin'), false)
$$;

grant execute on function app.account_role(uuid), app.location_role(uuid),
  app.can_manage_location(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────── RLS
alter table public.accounts         enable row level security;
alter table public.members          enable row level security;
alter table public.locations        enable row level security;
alter table public.member_locations enable row level security;
alter table public.categories       enable row level security;

-- accounts: visible to members; only the owner may rename. Created via RPC.
create policy accounts_select on public.accounts for select to authenticated
  using (app.account_role(id) is not null);
create policy accounts_update on public.accounts for update to authenticated
  using (app.account_role(id) = 'owner') with check (app.account_role(id) = 'owner');

-- members: visible within the account; owner manages (never the owner row itself).
create policy members_select on public.members for select to authenticated
  using (app.account_role(account_id) is not null);
create policy members_insert on public.members for insert to authenticated
  with check (app.account_role(account_id) = 'owner' and role <> 'owner');
create policy members_update on public.members for update to authenticated
  using (app.account_role(account_id) = 'owner' and role <> 'owner')
  with check (app.account_role(account_id) = 'owner' and role <> 'owner');
create policy members_delete on public.members for delete to authenticated
  using (app.account_role(account_id) = 'owner' and role <> 'owner');

-- locations: only locations you can access; owner creates/edits/deletes.
create policy locations_select on public.locations for select to authenticated
  using (app.location_role(id) is not null);
create policy locations_insert on public.locations for insert to authenticated
  with check (app.account_role(account_id) = 'owner');
create policy locations_update on public.locations for update to authenticated
  using (app.account_role(account_id) = 'owner') with check (app.account_role(account_id) = 'owner');
create policy locations_delete on public.locations for delete to authenticated
  using (app.account_role(account_id) = 'owner');

-- member_locations: members see the assignments of their account; owner manages.
create policy member_locations_select on public.member_locations for select to authenticated
  using (app.account_role(account_id) is not null);
create policy member_locations_write on public.member_locations for all to authenticated
  using (app.account_role(account_id) = 'owner') with check (app.account_role(account_id) = 'owner');

-- categories (template for every location-scoped table):
-- read with any access to the location, write as owner/admin of that location.
create policy categories_select on public.categories for select to authenticated
  using (app.location_role(location_id) is not null);
create policy categories_insert on public.categories for insert to authenticated
  with check (app.can_manage_location(location_id));
create policy categories_update on public.categories for update to authenticated
  using (app.can_manage_location(location_id)) with check (app.can_manage_location(location_id));
create policy categories_delete on public.categories for delete to authenticated
  using (app.can_manage_location(location_id));

-- ─────────────────────────────────────────────────────────────── triggers
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

create trigger categories_touch before update on public.categories
  for each row execute function app.touch_updated_at();

-- A row may not move to another location/account after creation.
create or replace function app.freeze_scope() returns trigger
language plpgsql as $$
begin
  if new.account_id <> old.account_id or new.location_id <> old.location_id then
    raise exception 'location_id/account_id cannot be changed';
  end if;
  return new;
end $$;

create trigger categories_freeze_scope before update on public.categories
  for each row execute function app.freeze_scope();

-- ─────────────────────────────────────────────────────────────── RPCs
-- Onboarding: create a business with its first location; caller becomes owner.
create or replace function public.create_account(p_name text, p_first_location text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_account uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  insert into public.accounts (name, owner_id) values (p_name, v_uid) returning id into v_account;
  insert into public.members (account_id, user_id, role) values (v_account, v_uid, 'owner');
  insert into public.locations (account_id, name) values (v_account, p_first_location);
  return v_account;
end $$;

revoke all on function public.create_account(text, text) from public, anon;
grant execute on function public.create_account(text, text) to authenticated;
