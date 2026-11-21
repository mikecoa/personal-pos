-- Fast offline PIN check.
--
-- The tablet used to bcrypt-compare a typed PIN against every employee's hash (~1 s each in
-- JavaScript), so a wrong PIN took N seconds. With a PIN lookup value the tablet hashes once and
-- finds the employee directly.
--
-- Security note: a 4-digit PIN has 10,000 possibilities, so neither bcrypt nor this hash resists an
-- offline guess by someone who has copied a tablet's data. That risk is handled by the PIN lockout
-- (on the tablet) and by revoking a lost tablet (server stops sending staff data to it).
--
-- pin_lookup = sha256_hex(account_id || ':' || pin). Unique per account, which also enforces
-- "PINs are unique within a business" without comparing every bcrypt hash.

alter table public.employees add column pin_lookup text;
create unique index employees_pin_lookup_uq on public.employees (account_id, pin_lookup) where pin_lookup is not null;
-- Not readable through the API (same as pin_hash); only pos_catalog hands it to registered tablets.

create or replace function app.pin_lookup(p_account uuid, p_pin text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p_account::text || ':' || p_pin, 'sha256'), 'hex')
$$;

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
    update public.employees set pin_hash = null, pin_lookup = null where id = p_employee;
    return;
  end if;
  if p_pin !~ '^\d{4}$' then
    raise exception 'PIN must be exactly 4 digits' using errcode = '22023';
  end if;
  -- Unique across the business: fast check via lookup, plus bcrypt check for PINs set before lookups existed.
  if exists (select 1 from public.employees e where e.account_id = v_account and e.id <> p_employee
             and (e.pin_lookup = app.pin_lookup(v_account, p_pin)
                  or (e.pin_lookup is null and e.pin_hash is not null and e.pin_hash = extensions.crypt(p_pin, e.pin_hash)))) then
    raise exception 'PIN already used by another employee' using errcode = '23505';
  end if;
  update public.employees
    set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)), pin_lookup = app.pin_lookup(v_account, p_pin)
  where id = p_employee;
end $$;

-- Catalog: add account_id (needed to compute the lookup) and each employee's pin_lookup.
-- pin_hash stays for employees whose PIN predates lookups (tablet falls back to bcrypt for them).
create or replace function public.pos_catalog(p_device uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_loc  uuid;
  v_doc  jsonb;
begin
  select location_id into v_loc from public.devices where id = p_device and revoked_at is null;
  if v_loc is null or not app.can_manage_location(v_loc) then
    raise exception 'device not registered or not allowed' using errcode = '42501';
  end if;
  update public.devices set last_seen_at = now() where id = p_device;

  select jsonb_build_object(
    'synced_at', now(),
    'location', (select jsonb_build_object('id', l.id, 'account_id', l.account_id, 'name', l.name, 'address', l.address, 'phone', l.phone)
                 from public.locations l where l.id = v_loc),
    'settings', (select to_jsonb(s) - 'account_id' - 'updated_at' from public.location_settings s where s.location_id = v_loc),
    'receipt',  (select to_jsonb(r) - 'account_id' - 'updated_at' from public.receipt_profiles r where r.location_id = v_loc),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'sort_order', c.sort_order) order by c.sort_order, c.name)
                 from public.categories c where c.location_id = v_loc), '[]'),
    'sales_types', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'sort_order', t.sort_order) order by t.sort_order, t.name)
                 from public.sales_types t where t.location_id = v_loc and t.is_active), '[]'),
    'payment_methods', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'kind', m.kind, 'sort_order', m.sort_order) order by m.sort_order, m.name)
                 from public.payment_methods m where m.location_id = v_loc and m.is_active), '[]'),
    'discounts', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'kind', d.kind, 'value', d.value, 'scope', d.scope) order by d.sort_order, d.name)
                 from public.discounts d where d.location_id = v_loc and d.is_active), '[]'),
    'modifier_sets', coalesce((select jsonb_agg(jsonb_build_object('id', ms.id, 'name', ms.name, 'min_select', ms.min_select, 'max_select', ms.max_select,
                   'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'price', o.price) order by o.sort_order)
                                        from public.modifier_options o where o.modifier_set_id = ms.id and o.is_active), '[]')) order by ms.sort_order, ms.name)
                 from public.modifier_sets ms where ms.location_id = v_loc), '[]'),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
                   'id', i.id, 'name', i.name, 'category_id', i.category_id, 'image_url', i.image_url,
                   'track_stock', i.track_stock, 'stock', i.stock,
                   'modifier_set_ids', coalesce((select jsonb_agg(ims.modifier_set_id order by ims.sort_order) from public.item_modifier_sets ims where ims.item_id = i.id), '[]'),
                   'variants', coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'price', v.price, 'sku', v.sku,
                       'prices', coalesce((select jsonb_object_agg(p.sales_type_id, p.price) from public.variant_sales_type_prices p where p.variant_id = v.id), '{}'))
                       order by v.sort_order) from public.item_variants v where v.item_id = i.id and v.is_active), '[]')
                 ) order by i.sort_order, i.name)
                 from public.items i where i.location_id = v_loc and i.is_active), '[]'),
    'employees', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name,
                   'pin_lookup', e.pin_lookup, 'pin_hash', case when e.pin_lookup is null then e.pin_hash end,
                   'role', r.name, 'permissions', to_jsonb(r.permissions)) order by e.name)
                 from public.employees e join public.roles r on r.id = e.role_id
                 join public.employee_locations el on el.employee_id = e.id and el.location_id = v_loc
                 where e.is_active and e.pin_hash is not null), '[]')
  ) into v_doc;
  return v_doc;
end $$;
