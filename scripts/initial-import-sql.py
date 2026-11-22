#!/usr/bin/env python3
"""
Build one SQL transaction with the café's starting data, for a freshly created location.

- Items and categories: data/djoeragan-kopitiam-menu.csv (the printed menu), in menu order.
- Modifier sets: the six the owner picked from Moka (data/moka/extras.json), with tidied capitals,
  attached as listed in MODIFIERS. Each is "pick one, optional".
- Discounts: Karyawan 10%, Owner 20% (bill or item).
- Employees: Admin (Manager role) and Kasir 1 (Cashier role), no PIN yet.
- Sales types: Dine In and Take Away already exist with every new location.

It targets the only account/location in the database and stops if that location already has items,
so it can't double-import. Usage: python3 scripts/initial-import-sql.py > import.sql
"""
import csv, os, sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rows = list(csv.DictReader(open(os.path.join(root, "data/djoeragan-kopitiam-menu.csv"), encoding="utf-8")))

# name -> (options, items it is attached to)
MODIFIERS = {
    "Suhu": (["Panas", "Dingin"], [r["Name"] for r in rows if r["Choices"] == "Suhu"]),
    "Soto": (["Bening", "Santan"], ["Soto Ayam", "Soto Daging"]),
    "Condiment": (["Ikan", "Ayam"], ["Bubur Ayam / Ikan"]),
    "Rasa": (["Srikaya", "Coklat", "Pandan"], ["Roti Bakar Srikaya/Cokelat"]),
    "Tingkat Kepedasan": (["Tidak Pedas", "Sedang", "Pedas", "Sangat Pedas"],
                          ["Nasi Goreng Ayam", "Nasi Goreng Seafood", "Nasi Goreng Djoeragan", "Nasi Goreng Gila",
                           "Nasi Goreng Buntut", "Mie Goreng Ayam", "Mie Goreng Seafood", "Kwetiaw Medan", "Bihun Goreng"]),
    "Tingkat Kematangan": (["1/4", "1/2", "3/4", "Matang", "Mata Sapi", "Dadar"], []),
}
DISCOUNTS = [("Karyawan", 10), ("Owner", 20)]
EMPLOYEES = [("Admin", "Manager"), ("Kasir 1", "Cashier")]

names = {r["Name"] for r in rows}
for m, (_, items) in MODIFIERS.items():
    missing = [i for i in items if i not in names]
    assert not missing, (m, missing)


def q(s):
    return "null" if s in (None, "") else "'" + str(s).replace("'", "''") + "'"


out = []
w = out.append
w("begin;")
w("do $$")
w("declare v_acc uuid; v_loc uuid; v_id uuid;")
w("begin")
w("  select id into strict v_acc from public.accounts;")
w("  select id into strict v_loc from public.locations where account_id = v_acc;")
w("  if exists (select 1 from public.items where location_id = v_loc) then")
w("    raise exception 'This location already has items; import stopped so nothing is doubled.';")
w("  end if;")
w("  create temp table _cat(name text primary key, id uuid) on commit drop;")
w("  create temp table _item(name text primary key, id uuid) on commit drop;")

cats = list(dict.fromkeys(r["Category"] for r in rows))
for i, c in enumerate(cats):
    w(f"  insert into public.categories(account_id, location_id, name, sort_order) values (v_acc, v_loc, {q(c)}, {i}) returning id into v_id;")
    w(f"  insert into _cat values ({q(c)}, v_id);")

for i, r in enumerate(rows):
    w(f"  insert into public.items(account_id, location_id, category_id, name, description, sort_order) values "
      f"(v_acc, v_loc, (select id from _cat where name = {q(r['Category'])}), {q(r['Name'])}, {q(r['Description'])}, {i}) returning id into v_id;")
    w(f"  insert into _item values ({q(r['Name'])}, v_id);")
    variant = q(r["Variant"]) if r["Variant"] else "''"
    w(f"  insert into public.item_variants(account_id, location_id, item_id, name, price, sku) values (v_acc, v_loc, v_id, {variant}, {int(r['Price'])}, {q(r['SKU'])});")

for i, (m, (opts, items)) in enumerate(MODIFIERS.items()):
    w(f"  insert into public.modifier_sets(account_id, location_id, name, min_select, max_select, sort_order) values (v_acc, v_loc, {q(m)}, 0, 1, {i}) returning id into v_id;")
    for j, o in enumerate(opts):
        w(f"  insert into public.modifier_options(account_id, location_id, modifier_set_id, name, price, sort_order) values (v_acc, v_loc, v_id, {q(o)}, 0, {j});")
    for it in items:
        w(f"  insert into public.item_modifier_sets(account_id, location_id, item_id, modifier_set_id, sort_order) values (v_acc, v_loc, (select id from _item where name = {q(it)}), v_id, 0);")

for i, (d, pct) in enumerate(DISCOUNTS):
    w(f"  insert into public.discounts(account_id, location_id, name, kind, value, scope, sort_order) values (v_acc, v_loc, {q(d)}, 'percent', {pct * 100}, 'both', {i});")

for e, role in EMPLOYEES:
    w(f"  insert into public.employees(account_id, role_id, name) values (v_acc, (select id from public.roles where account_id = v_acc and name = {q(role)}), {q(e)}) returning id into v_id;")
    w("  insert into public.employee_locations(account_id, employee_id, location_id) values (v_acc, v_id, v_loc);")

w("end $$;")
w("commit;")
print("\n".join(out))
links = sum(len(v[1]) for v in MODIFIERS.values())
print(f"-- {len(rows)} items, {len(cats)} categories, {len(MODIFIERS)} modifier sets ({links} links), "
      f"{len(DISCOUNTS)} discounts, {len(EMPLOYEES)} employees", file=sys.stderr)
