#!/usr/bin/env python3
"""
Build one SQL transaction that loads the Moka library into a location.

Input:  data/moka/library.json (items, with their modifiers by name)
        data/moka/extras.json  (all categories, modifiers, discounts, employees)
Output: SQL on stdout. It targets the only account/location in the database, and refuses to run
        if that location already has items (so it can't double-import).

Choices (shown to the owner before running):
- Category names are trimmed; "Uncategorized" items get no category.
- Items with no fixed price in Moka (variable price): Bubur gets its Dine In / Take Away price
  (Rp 30.000); the others are skipped (see SKIP), since a variable price is rung up as a custom amount.
- Names that differ only in capitals: "milk choco crunchy" (no price) is skipped and "basreng" (Rp 9.000)
  becomes "Basreng kemasan" next to "Basreng" (Rp 25.000).
- Modifiers keep Moka's options and order. Moka's 0/0 limits mean "optional, any number".
- Discounts are percentages on the bill or an item (scope both).
- Employees: Administrator -> Manager role, Cashier -> Cashier role, no PIN (set in the backoffice).
- Moka sales types (Gofood, Grabfood, ...) are not copied; the item list's one Take Away price is.
"""
import json, sys, os

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
lib = json.load(open(os.path.join(root, "data/moka/library.json"), encoding="utf-8"))
ext = json.load(open(os.path.join(root, "data/moka/extras.json"), encoding="utf-8"))

SKIP = {"milk choco crunchy": "duplicate of 'Milk choco crunchy' (Rp 25.000) with no price",
        "usus": "variable price, no fixed amount (ring up as a custom amount)"}
VARIABLE_PRICE = {"Bubur": 30000}
ROLE = {"Administrator": "Manager", "Cashier": "Cashier"}
# Names must be unique ignoring capitals; Moka had both "basreng" (Rp 9.000) and "Basreng" (Rp 25.000).
RENAME = {("basreng", 9000): "Basreng kemasan"}


def q(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


out = []
w = out.append
w("begin;")
w("do $$")
w("declare")
w("  v_acc uuid; v_loc uuid; v_id uuid; v_var uuid;")
w("begin")
w("  select id into strict v_acc from public.accounts;")
w("  select id into strict v_loc from public.locations where account_id = v_acc;")
w("  if exists (select 1 from public.items where location_id = v_loc) then")
w("    raise exception 'This location already has items; import stopped so nothing is doubled.';")
w("  end if;")
w("  create temp table _cat(name text primary key, id uuid) on commit drop;")
w("  create temp table _mod(name text primary key, id uuid) on commit drop;")

# Categories (trimmed, Moka order is alphabetical already)
cats = [c.strip() for c in ext["categories"] if c.strip() and c.strip() != "Uncategorized"]
for i, c in enumerate(cats):
    w(f"  insert into public.categories(account_id, location_id, name, sort_order) values (v_acc, v_loc, {q(c)}, {i}) returning id into v_id;")
    w(f"  insert into _cat values ({q(c)}, v_id);")

# Modifier sets + options
for i, m in enumerate(ext["modifiers"]):
    mx = m["max"] or None
    w(f"  insert into public.modifier_sets(account_id, location_id, name, min_select, max_select, sort_order) values (v_acc, v_loc, {q(m['name'])}, {m['min'] or 0}, {mx if mx else 'null'}, {i}) returning id into v_id;")
    w(f"  insert into _mod values ({q(m['name'])}, v_id);")
    for j, o in enumerate(m["options"]):
        w(f"  insert into public.modifier_options(account_id, location_id, modifier_set_id, name, price, sort_order) values (v_acc, v_loc, v_id, {q(o['name'])}, {int(o['price'] or 0)}, {j});")

# Items
kept, skipped = 0, []
mod_names = {m["name"] for m in ext["modifiers"]}
for i, it in enumerate(lib["items"]):
    if it["name"] in SKIP:
        skipped.append((it["name"], SKIP[it["name"]]))
        continue
    price = it["price"] if it["price"] is not None else VARIABLE_PRICE.get(it["name"])
    if price is None:
        skipped.append((it["name"], "no price"))
        continue
    cat = (it["category"] or "").strip()
    cat_sql = "null" if not cat or cat == "Uncategorized" else f"(select id from _cat where name = {q(cat)})"
    w(f"  insert into public.items(account_id, location_id, category_id, name, description, sort_order) values (v_acc, v_loc, {cat_sql}, {q(RENAME.get((it['name'], price), it['name'].strip()))}, {q(it['description'].strip() if it['description'] else None)}, {i}) returning id into v_id;")
    w(f"  insert into public.item_variants(account_id, location_id, item_id, name, price, sku) values (v_acc, v_loc, v_id, '', {int(price)}, {q(it['sku'])}) returning id into v_var;")
    for st in it["sales_type_prices"]:
        w(f"  insert into public.variant_sales_type_prices(account_id, location_id, variant_id, sales_type_id, price) select v_acc, v_loc, v_var, id, {int(st['price'])} from public.sales_types where location_id = v_loc and name = {q(st['type'])};")
    for j, mn in enumerate(it["modifiers"]):
        assert mn in mod_names, mn
        w(f"  insert into public.item_modifier_sets(account_id, location_id, item_id, modifier_set_id, sort_order) values (v_acc, v_loc, v_id, (select id from _mod where name = {q(mn)}), {j});")
    kept += 1

# Discounts (percent stored x100)
for i, d in enumerate(ext["discounts"]):
    w(f"  insert into public.discounts(account_id, location_id, name, kind, value, scope, sort_order) values (v_acc, v_loc, {q(d['name'])}, 'percent', {int(d['percent'] * 100)}, 'both', {i});")

# Employees (no PIN yet)
for e in ext["employees"]:
    role = ROLE[e["role"]]
    w(f"  insert into public.employees(account_id, role_id, name) values (v_acc, (select id from public.roles where account_id = v_acc and name = {q(role)}), {q(e['name'])}) returning id into v_id;")
    w(f"  insert into public.employee_locations(account_id, employee_id, location_id) values (v_acc, v_id, v_loc);")

w("end $$;")
w("commit;")
print("\n".join(out))
print(f"-- items: {kept}, skipped: {len(skipped)} {skipped}", file=sys.stderr)
print(f"-- categories: {len(cats)}, modifier sets: {len(ext['modifiers'])}, discounts: {len(ext['discounts'])}, employees: {len(ext['employees'])}", file=sys.stderr)
