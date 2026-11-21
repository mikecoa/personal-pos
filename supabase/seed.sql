-- Local development seed. NEVER run against production.
--
-- Test logins (local Supabase only, password for all: posdemo123):
--   owner@pos.test  - owner of "Demo Café", sees every location
--   admin@pos.test  - admin, assigned to "Second Branch" only
--   staff@pos.test  - staff, assigned to "Djoeragan Kopitiam" only

create or replace function pg_temp.make_user(p_id uuid, p_email text) returns void
language sql as $$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('posdemo123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), p_id, p_id::text,
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    'email', now(), now(), now());
$$;

select pg_temp.make_user('11111111-1111-1111-1111-111111111111', 'owner@pos.test');
select pg_temp.make_user('22222222-2222-2222-2222-222222222222', 'admin@pos.test');
select pg_temp.make_user('33333333-3333-3333-3333-333333333333', 'staff@pos.test');

insert into public.accounts (id, name, owner_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Demo Café', '11111111-1111-1111-1111-111111111111');

insert into public.members (account_id, user_id, role, display_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner', 'Owner'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'admin', 'Branch Admin'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'staff', 'Cashier');

insert into public.locations (id, account_id, name, address) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Djoeragan Kopitiam', 'Jl. Contoh No. 1'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Second Branch', 'Jl. Contoh No. 2');

insert into public.member_locations (account_id, user_id, location_id) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000002'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'bbbbbbbb-0000-0000-0000-000000000001');

insert into public.categories (account_id, location_id, name, sort_order) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Minuman', 1),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Menu Nasi', 2),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Snack Menu', 3),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Kopi', 1),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Kue', 2);

-- ── Phase 1 demo catalog (Djoeragan Kopitiam) ─────────────────────────────────────
-- Employee PINs (local only): Ani 1111 (Manager), Budi 2222 (Cashier)
do $$
declare
  acc  uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  loc  uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  c_minum uuid; c_nasi uuid; c_snack uuid;
  gofood uuid; suhu uuid; pedas uuid; it uuid; v uuid;
begin
  select id into c_minum from public.categories where location_id = loc and name = 'Minuman';
  select id into c_nasi  from public.categories where location_id = loc and name = 'Menu Nasi';
  select id into c_snack from public.categories where location_id = loc and name = 'Snack Menu';

  insert into public.sales_types (account_id, location_id, name, sort_order) values (acc, loc, 'GoFood', 3) returning id into gofood;

  insert into public.modifier_sets (account_id, location_id, name, min_select, max_select, sort_order)
    values (acc, loc, 'Suhu', 1, 1, 1) returning id into suhu;
  insert into public.modifier_options (account_id, location_id, modifier_set_id, name, price, sort_order) values
    (acc, loc, suhu, 'Panas', 0, 1), (acc, loc, suhu, 'Dingin', 0, 2);
  insert into public.modifier_sets (account_id, location_id, name, min_select, max_select, sort_order)
    values (acc, loc, 'Tingkat kepedasan', 0, 1, 2) returning id into pedas;
  insert into public.modifier_options (account_id, location_id, modifier_set_id, name, price, sort_order) values
    (acc, loc, pedas, 'Tidak pedas', 0, 1), (acc, loc, pedas, 'Sedang', 0, 2),
    (acc, loc, pedas, 'Pedas', 0, 3), (acc, loc, pedas, 'Extra pedas', 2000, 4);

  -- Kopi Susu: two sizes, GoFood price override, Suhu modifier
  insert into public.items (account_id, location_id, category_id, name) values (acc, loc, c_minum, 'Kopi Susu') returning id into it;
  insert into public.item_variants (account_id, location_id, item_id, name, price, sort_order) values (acc, loc, it, 'Regular', 18000, 1) returning id into v;
  insert into public.variant_sales_type_prices (account_id, location_id, variant_id, sales_type_id, price) values (acc, loc, v, gofood, 22000);
  insert into public.item_variants (account_id, location_id, item_id, name, price, sort_order) values (acc, loc, it, 'Large', 23000, 2) returning id into v;
  insert into public.variant_sales_type_prices (account_id, location_id, variant_id, sales_type_id, price) values (acc, loc, v, gofood, 28000);
  insert into public.item_modifier_sets (account_id, location_id, item_id, modifier_set_id) values (acc, loc, it, suhu);

  insert into public.items (account_id, location_id, category_id, name) values (acc, loc, c_minum, 'Teh Manis') returning id into it;
  insert into public.item_variants (account_id, location_id, item_id, price) values (acc, loc, it, 8000);
  insert into public.item_modifier_sets (account_id, location_id, item_id, modifier_set_id) values (acc, loc, it, suhu);

  insert into public.items (account_id, location_id, category_id, name, track_stock, stock, stock_alert)
    values (acc, loc, c_minum, 'Air Mineral', true, 48, 12) returning id into it;
  insert into public.item_variants (account_id, location_id, item_id, price) values (acc, loc, it, 8000);

  insert into public.items (account_id, location_id, category_id, name) values (acc, loc, c_nasi, 'Nasi Goreng Ayam') returning id into it;
  insert into public.item_variants (account_id, location_id, item_id, price) values (acc, loc, it, 28000);
  insert into public.item_modifier_sets (account_id, location_id, item_id, modifier_set_id) values (acc, loc, it, pedas);

  insert into public.items (account_id, location_id, category_id, name) values (acc, loc, c_nasi, 'Mie Goreng Seafood') returning id into it;
  insert into public.item_variants (account_id, location_id, item_id, price) values (acc, loc, it, 32000);
  insert into public.item_modifier_sets (account_id, location_id, item_id, modifier_set_id) values (acc, loc, it, pedas);

  insert into public.items (account_id, location_id, category_id, name) values (acc, loc, c_snack, 'French Fries') returning id into it;
  insert into public.item_variants (account_id, location_id, item_id, price) values (acc, loc, it, 25000);

  insert into public.items (account_id, location_id, category_id, name) values (acc, loc, c_snack, 'Pisang Goreng') returning id into it;
  insert into public.item_variants (account_id, location_id, item_id, price) values (acc, loc, it, 15000);

  insert into public.discounts (account_id, location_id, name, kind, value, sort_order) values
    (acc, loc, 'Diskon Karyawan', 'percent', 1000, 1),
    (acc, loc, 'Diskon Owner', 'percent', 2000, 2),
    (acc, loc, 'Potongan 5rb', 'amount', 5000, 3);

  insert into public.employees (account_id, role_id, name, pin_hash)
    select acc, id, 'Ani', extensions.crypt('1111', extensions.gen_salt('bf', 8)) from public.roles where account_id = acc and name = 'Manager'
    returning id into it;
  insert into public.employee_locations (account_id, employee_id, location_id) values (acc, it, loc);
  insert into public.employees (account_id, role_id, name, pin_hash)
    select acc, id, 'Budi', extensions.crypt('2222', extensions.gen_salt('bf', 8)) from public.roles where account_id = acc and name = 'Cashier'
    returning id into it;
  insert into public.employee_locations (account_id, employee_id, location_id) values
    (acc, it, loc), (acc, it, 'bbbbbbbb-0000-0000-0000-000000000002');

  -- Fast offline PIN lookups (see migration 20261125000002_fast_pin.sql)
  update public.employees set pin_lookup = encode(extensions.digest(acc::text || ':' || case name when 'Ani' then '1111' when 'Budi' then '2222' end, 'sha256'), 'hex')
    where account_id = acc and name in ('Ani', 'Budi');

  update public.receipt_profiles set phone = '0812-0000-0000', social = '@democafe', footer = 'Terima kasih, sampai jumpa lagi!'
    where location_id = loc;
end $$;

-- ── Phase 4 demo sales: 14 days up to yesterday, both locations ──────────
-- Deterministic (setseed), relative to today so reports always have recent data.
do $$
declare
  acc  uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  loc  uuid;
  dev  uuid;
  sh   uuid;
  day  date;
  n    int;
  i    int;
  k    int;
  oid  uuid;
  t    timestamptz;
  item record;
  qty  int;
  v_gross bigint;
  v_disc bigint;
  v_total bigint;
  pay  record;
  cash_sales bigint;
  seq  int;
  prefix text;
  locs uuid[] := array['bbbbbbbb-0000-0000-0000-000000000001'::uuid, 'bbbbbbbb-0000-0000-0000-000000000002'::uuid];
  cat_kopi uuid; cat_kue uuid; it uuid;
begin
  perform setseed(0.42);

  -- a small menu for Second Branch
  select id into cat_kopi from public.categories where location_id = locs[2] and name = 'Kopi';
  select id into cat_kue from public.categories where location_id = locs[2] and name = 'Kue';
  insert into public.items (account_id, location_id, category_id, name) values (acc, locs[2], cat_kopi, 'Es Kopi Gula Aren') returning id into it;
  insert into public.item_variants (account_id, location_id, item_id, price) values (acc, locs[2], it, 22000);
  insert into public.items (account_id, location_id, category_id, name) values (acc, locs[2], cat_kopi, 'Americano') returning id into it;
  insert into public.item_variants (account_id, location_id, item_id, price) values (acc, locs[2], it, 18000);
  insert into public.items (account_id, location_id, category_id, name) values (acc, locs[2], cat_kue, 'Bolu Pandan') returning id into it;
  insert into public.item_variants (account_id, location_id, item_id, price) values (acc, locs[2], it, 12000);

  foreach loc in array locs loop
    prefix := case when loc = locs[1] then 'D1' else 'D2' end;
    insert into public.devices (account_id, location_id, name, receipt_prefix, registered_by)
      values (acc, loc, 'Demo tablet', prefix, '11111111-1111-1111-1111-111111111111') returning id into dev;
    seq := 0;

    for day in select generate_series(current_date - 14, current_date - 1, interval '1 day')::date loop
      sh := gen_random_uuid();
      insert into public.shifts (id, account_id, location_id, device_id, status, opened_by_name, opened_at, starting_cash)
        values (sh, acc, loc, dev, 'open', 'Budi', (day + time '06:00') at time zone 'Asia/Jakarta', 500000);
      cash_sales := 0;
      -- weekends busier; second branch smaller
      n := (case when extract(isodow from day) >= 6 then 70 else 50 end + floor(random() * 15))::int;
      if loc = locs[2] then n := n / 3; end if;

      for i in 1..n loop
        seq := seq + 1;
        oid := gen_random_uuid();
        -- busy around breakfast, lunch and evening
        t := (day + time '06:00' + make_interval(mins => (
               case when random() < 0.25 then 60 + random() * 120 when random() < 0.55 then 360 + random() * 150 else 690 + random() * 300 end)::int))
             at time zone 'Asia/Jakarta';
        insert into public.orders (id, account_id, location_id, device_id, shift_id, number, status, opened_at, completed_at,
          sales_type_name, opened_by_name, closed_by_name, gross, discount_total, subtotal, total, paid)
          values (oid, acc, loc, dev, sh, prefix || '-' || lpad(seq::text, 6, '0'), 'completed', t - interval '8 minutes', t,
            case when random() < 0.7 then 'Dine In' when random() < 0.6 then 'Take Away' else coalesce((select name from public.sales_types where location_id = loc and name = 'GoFood'), 'Take Away') end,
            'Budi', case when random() < 0.6 then 'Budi' else 'Ani' end, 0, 0, 0, 0, 0);
        v_gross := 0; k := 0;
        for item in
          select i2.id, i2.name, v.id vid, v.name vname, v.price, c.name cat
          from public.items i2 join public.item_variants v on v.item_id = i2.id left join public.categories c on c.id = i2.category_id
          where i2.location_id = loc order by random() limit (1 + floor(random() * 3))::int
        loop
          k := k + 1;
          qty := case when random() < 0.8 then 1 else 2 end;
          insert into public.order_lines (id, account_id, location_id, order_id, sort_order, item_id, variant_id, item_name, variant_name,
            category_name, unit_price, modifiers, qty, line_total)
            values (gen_random_uuid(), acc, loc, oid, k, item.id, item.vid, item.name, item.vname, item.cat, item.price,
              case when item.name in ('Kopi Susu', 'Teh Manis') then jsonb_build_array(jsonb_build_object('set', 'Suhu', 'option', case when random() < 0.7 then 'Dingin' else 'Panas' end, 'price', 0))
                   when item.name in ('Nasi Goreng Ayam', 'Mie Goreng Seafood') and random() < 0.6 then jsonb_build_array(jsonb_build_object('set', 'Tingkat kepedasan', 'option', 'Pedas', 'price', 0))
                   else '[]'::jsonb end,
              qty, item.price * qty);
          v_gross := v_gross + item.price * qty;
        end loop;
        v_disc := case when random() < 0.06 then round(v_gross * 0.1) else 0 end;
        if v_disc > 0 then
          insert into public.order_discounts (id, account_id, location_id, order_id, name, kind, value, amount)
            values (gen_random_uuid(), acc, loc, oid, 'Diskon Karyawan', 'percent', 1000, v_disc);
        end if;
        v_total := v_gross - v_disc;
        update public.orders set gross = v_gross, discount_total = v_disc, subtotal = v_total, total = v_total, paid = v_total where id = oid;
        select * into pay from (values ('QRIS', 'qr'::app.payment_kind), ('Cash', 'cash'::app.payment_kind), ('Card', 'card'::app.payment_kind)) m(name, kind)
          order by case when m.name = 'QRIS' then random() * 0.57 when m.name = 'Cash' then random() * 0.33 else random() * 0.10 end desc limit 1;
        insert into public.payments (id, account_id, location_id, order_id, method_name, kind, amount, paid_at)
          values (gen_random_uuid(), acc, loc, oid, pay.name, pay.kind, v_total, t);
        if pay.kind = 'cash' then cash_sales := cash_sales + v_total; end if;
      end loop;

      -- one void and an occasional refund per day
      insert into public.order_voids (id, account_id, location_id, order_id, item_name, qty, amount, reason, employee_name, voided_at)
        select gen_random_uuid(), acc, loc, o.id, 'Teh Manis', 1, 8000, 'Customer changed mind', 'Ani', o.completed_at - interval '4 minutes'
        from public.orders o where o.shift_id = sh order by random() limit 1;
      if random() < 0.4 then
        insert into public.refunds (id, account_id, location_id, device_id, order_id, shift_id, reason, employee_name, method_name, kind, amount, refunded_at)
          select gen_random_uuid(), acc, loc, dev, o.id, sh, 'Item problem', 'Ani', 'Cash', 'cash', l.line_total / l.qty, o.completed_at + interval '10 minutes'
          from public.orders o join public.order_lines l on l.order_id = o.id where o.shift_id = sh order by random() limit 1;
        insert into public.refund_lines (id, account_id, location_id, refund_id, order_line_id, item_id, item_name, qty, amount)
          select gen_random_uuid(), acc, loc, r.id, l.id, l.item_id, l.item_name, 1, r.amount
          from public.refunds r join public.order_lines l on l.order_id = r.order_id
          where r.shift_id = sh and not exists (select 1 from public.refund_lines x where x.refund_id = r.id) limit 1;
        cash_sales := cash_sales - coalesce((select amount from public.refunds where shift_id = sh), 0);
      end if;

      update public.shifts set status = 'closed', closed_by_name = 'Ani', closed_at = (day + time '23:30') at time zone 'Asia/Jakarta',
        expected_cash = 500000 + cash_sales, actual_cash = 500000 + cash_sales - case when random() < 0.2 then 1000 * (1 + floor(random() * 5)) else 0 end
        where id = sh;
    end loop;
  end loop;
end $$;

-- ── Tables (Djoeragan Kopitiam): Indoor 1–8 + Sofa, Teras T1–T4 ──────────────────
do $$
declare
  acc uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  loc uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  indoor uuid; teras uuid; i int;
begin
  insert into public.table_areas (account_id, location_id, name, sort_order) values (acc, loc, 'Indoor', 1) returning id into indoor;
  insert into public.table_areas (account_id, location_id, name, sort_order) values (acc, loc, 'Teras', 2) returning id into teras;
  for i in 1..8 loop
    insert into public.dining_tables (account_id, location_id, area_id, name, seats, shape, sort_order)
      values (acc, loc, indoor, i::text, case when i <= 4 then 2 else 4 end, case when i <= 4 then 'round' else 'square' end::app.table_shape, i);
  end loop;
  insert into public.dining_tables (account_id, location_id, area_id, name, seats, shape, sort_order) values (acc, loc, indoor, 'Sofa', 6, 'long', 9);
  for i in 1..4 loop
    insert into public.dining_tables (account_id, location_id, area_id, name, seats, sort_order) values (acc, loc, teras, 'T' || i, 4, 10 + i);
  end loop;
end $$;

-- ── Quick notes (Djoeragan Kopitiam) ──────────────────────────────────────
insert into public.quick_notes (account_id, location_id, text, sort_order) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Less sugar', 1),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'No sugar', 2),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Tanpa Sayur', 3);
