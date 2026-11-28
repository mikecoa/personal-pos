# POS MVP Plan

A personal POS for our cafés: an **Android tablet app** for cashiers plus a **web backoffice** for the owner. One account, many locations, and each location's data kept separate.

---

## 1. What the MVP must do (from how your café actually runs)

| Need | Evidence from how the café runs today |
|---|---|
| Fast item selection with modifiers | 177 items, 11 modifier sets (spice, hot/cold, flavour, combo choices) |
| Sales types | Dine In, Take Away, GoFood, GrabFood, ShopeeFood, custom |
| % discounts on the bill or item | Staff 10%, Owner 20%, holiday promos |
| Open bills named by table/spot | 3 open bills tonight ("11", "25", "sofa") |
| Payments: QR, cash, card machine, other | 57% QR · 33% cash · 5% EDC · 5% other |
| Shifts with a cash count | ~3 shifts/day, expected vs actual |
| Transaction and shift reports | Daily use |
| **Works offline** | It's a café: the internet will drop |
| Receipt printing | Bluetooth/LAN thermal printer |

Not in the MVP (unused today or easy to add later): taxes/gratuity *(cheap, so included as settings)*, promo engine, bundles, ingredients/recipes, purchase orders, transfers, loyalty, table map, online-order integrations, customer display.

---

## 2. Stack (recommended)

| Part | Choice | Why |
|---|---|---|
| Database + auth + API | **Supabase** (Postgres, Auth, Row-Level Security, Storage) | Real Postgres, so location isolation is enforced **in the database** by RLS, not just in app code. Free tier is enough for personal use. |
| Backoffice website | **Next.js** (App Router) + TypeScript + Tailwind + shadcn/ui, hosted on Vercel | Fast to build good tables and forms; free hosting. |
| POS tablet app | **React Native (Expo)** + TypeScript, Android tablet first | Same language as the web; native Bluetooth printing works; can add iPad later. |
| Offline sync | ~~PowerSync~~ → **own sync layer** (expo-sqlite outbox + 3 RPCs) | Changed in Phase 2: the catalog is small enough to snapshot, sales are append-only, so a custom outbox is simpler, needs no extra service and works in Expo Go. |
| Printing | ESC/POS over Bluetooth/LAN (`react-native-thermal-printer` or similar) | Works with common 58/80 mm printers. |
| Shared code | Monorepo (pnpm + Turborepo): `apps/backoffice`, `apps/pos`, `packages/core` | One copy of the money maths, types and validation for both apps. |

**Alternative if you'd rather not use hosted services:** a self-hosted Postgres + Hono API + ElectricSQL. That means more work and more to maintain, so I'd only choose it if you want everything on your own server.

---

## 3. Location isolation (your key requirement)

```
account (business, owner)
 ├─ members (user ↔ account, role)
 ├─ member_locations (which locations a member can access)
 └─ locations
      └─ everything operational: categories, items, variants, modifier sets,
         sales types, discounts, payment methods, settings, receipt profile,
         devices, open bills, orders, payments, refunds, shifts, cash movements
```

- Every operational table has `account_id` and `location_id` (both NOT NULL).
- **RLS policy on every table:** a row is visible or writable only if the user is a member of `account_id` *and* has access to `location_id` (the owner has every location).
- **Sync scoping:** each tablet is registered to **one location** (picked once when the tablet is set up), so it only downloads that location's data.
- **Cross-location is explicit, never implicit:**
  - Backoffice report filter "All locations" (owner only, read-only roll-up).
  - "Copy to locations…" action on items, modifiers, discounts and so on. It creates independent copies linked by a shared `source_key`, so "update copies too" is optional and safe. Safer than matching copies by name.
- **Customers:** per location in the MVP (matches your rule). An account-wide "shared customers" option can come with loyalty later.

---

## 4. Core data model (MVP)

All IDs are UUIDs generated on the device (so offline sales never clash). Money is stored as **integer rupiah** (`bigint`). No floats.

**Setup**
- `accounts`, `members`, `locations`, `member_locations`, `devices` (tablet → location)
- `roles` (permission flags for the app and backoffice), `employees` (name, role, 4-digit PIN hash, locations)
- `location_settings` (tax on/off and rate, include/exclude tax, rounding, stock limit, split payment, save bill on/off, auto-shift with default starting cash)
- `receipt_profiles` (logo, header, address, phone, socials, footer)
- `payment_methods` (name, type: cash | qr | card | delivery | other | invoice, active)

**Catalog**
- `categories`, `items` (name, category, image, description, track_stock, stock, alert_at, cost)
- `item_variants` (name, price, sku): every item has at least one variant
- `variant_prices_by_sales_type` (optional override)
- `modifier_sets` (name, min/max selections, so combo choices like "pick 1 main" work), `modifier_options` (name, price), `item_modifier_sets`
- `sales_types` (name, active), `discounts` (name, % or Rp, scope bill/item)

**Selling** (append-only; never edited after completion)
- `orders` (number, status: open | completed | cancelled, sales_type, bill name, server, cashier, shift, opened/closed at, subtotal, discount, tax, rounding, total)
- `order_lines` (variant snapshot: name, price, qty, note) + `order_line_modifiers` (snapshot)
- `order_discounts`, `voids` (line, qty, reason, by, at)
- `payments` (method, amount, tendered, change, reference)
- `refunds` + `refund_lines` (reason, by, shift)
- `shifts` (device, employee, start cash, opened/closed, actual cash, and the expected amounts calculated when the shift closes), `cash_movements` (income/expense, description, amount)

Product names and prices are copied onto order lines when sold, so later edits to an item never change past receipts or reports.

---

## 5. Screens

### POS tablet app (landscape, two panes, built for speed)
1. **Sign in** (owner email, once) → **pick location** → **employee PIN** to unlock.
2. **Sell:** category chips across the top plus a **photo/tile grid** (not a drill-down list), search, Favorites, Custom amount keypad. Cart on the right: customer name (free text in the MVP), sales type, lines, totals, Save Bill / Print Bill / Split Bill / **Charge**.
3. **Item sheet:** variant, modifier groups (required/optional, min/max), qty, note, line discount.
4. **Open bills:** named bills with age timers; open, merge or cancel; void needs a reason.
5. **Charge:** quick cash amounts, QR (show a static QR image, cashier confirms), card machine (pick the bank), other, **split payment**; then the done screen with Print / New Sale.
6. **Activity:** search receipts; reprint; refund (needs an open shift and permission or PIN).
7. **Shift:** start (starting cash), cash in/out, close (count cash → expected vs actual for each method), print the summary.
8. **Settings:** printer pairing, which documents to print (receipt, kitchen ticket), device info, sync status, logout.

### Web backoffice
1. **Dashboard:** gross/net sales, transactions, average sale, top items, sales by hour; location filter.
2. **Reports:** Sales (summary, payment methods, sales types, items, categories, modifiers, discounts, cashier), Transactions (success / cancelled / voids), Shifts, all exportable to CSV.
3. **Library:** items (with variants, per-sales-type prices, modifiers, stock tracking), categories, modifier sets, discounts, sales types; **CSV import (including the item export from your current POS)**; copy to locations.
4. **Employees:** employees, roles and permissions, PINs.
5. **Locations & settings:** locations, checkout settings, payment methods, receipt designer with live preview, devices.

---

## 6. Build phases

| Phase | Deliverable | You can… |
|---|---|---|
| **0. Foundations** ✅ | Monorepo, Supabase project, schema + RLS, auth, accounts/locations/members, seed data, RLS tests proving location A can't see B | Log in to an empty backoffice |
| **1. Backoffice catalog & setup** ✅ | Locations, items/variants/modifiers/categories/sales types/discounts, payment methods, employees/roles/PIN, settings, receipt designer, **CSV import of your current menu** | Load your real menu |
| **2. POS selling (offline)** ✅ (printer transport pending hardware) | Expo app, device→location pairing, PowerSync, PIN unlock, sell screen, item sheet, cart maths, open bills + voids, charge + split payment, receipts on a Bluetooth printer | Ring up a real sale with Wi-Fi off |
| **3. Shifts, activity, refunds** ✅ | Shift open/close, cash in/out, shift report print, activity, reprint, refunds | Run a full day |
| **4. Reports** ✅ | Dashboard, sales sub-reports, transactions, shift report, CSV export | Close the month |
| **5. Hardening** ✅ (trial week pending: needs hosting accounts + printer) | Sync conflict tests, a long offline run, printer edge cases, backups, error tracking | Use it alongside the old POS for a week, then switch |

**Later (in rough priority order):** inventory (stock movements, adjustments, transfers, POs) → customers + loyalty → table map → promo rules + bundles → ingredients/recipes → kitchen display / customer display → QRIS payment gateway → online-order integrations.

---

## 7. Rules worth fixing early
- **Cart maths in one shared function** (`packages/core`), unit-tested: line = (variant price or sales-type price + modifiers) × qty − line discount → subtotal → bill discount → tax (include/exclude, before/after discount) → rounding → total. Reports reuse the same definitions: Gross Sales, Discounts, Refunds, Net Sales, Total Collected.
- **Shift expected cash** = starting cash + cash sales + cash invoice payments − cash refunds ± income/expense.
- **Offline sync:** sales, payments, refunds, voids and shift records are **append-only** (no conflicts possible); catalog and settings are **server-wins**, edited only in the backoffice.
- **Receipt numbers:** short per-device codes (e.g. `A7-000123`) so offline tablets never collide.
- **Run alongside the old POS** until a full week's reports match.

---

## 8. Decisions needed from you
1. **Stack:** Supabase + Next.js + Expo + PowerSync as above? *(recommended)*
2. **Customers:** per location (default above) or shared across your locations?
3. **Device:** which Android tablet and printer does the café use? (Printer model decides the print library.)
4. **Language:** English UI, Indonesian, or both?
