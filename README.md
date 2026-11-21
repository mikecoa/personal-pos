# POS

Personal Moka-style point of sale: web **backoffice** + Android tablet **POS app** (Phase 2), one account with many locations whose data is kept separate.

- Research: [docs/moka-study.md](docs/moka-study.md)
- Plan: [docs/mvp-plan.md](docs/mvp-plan.md)
- Running it day to day (backups, tablets, troubleshooting): [docs/operations.md](docs/operations.md)
- Going live alongside Moka: [docs/go-live.md](docs/go-live.md)

## Layout

```
apps/backoffice      Next.js 15 web backoffice (port 3100)
apps/pos             Expo (React Native) tablet POS, offline-first
packages/core        Shared TypeScript: money, cart pricing, receipts/ESC-POS, CSV, permissions, DB types
supabase/migrations  Database schema + Row-Level Security
supabase/seed.sql    Local demo data and test logins
supabase/tests       pgTAP tests proving location isolation
```

## Requirements

- Node 22 (`nvm use`, see `.nvmrc`) and pnpm 9 (`corepack enable`)
- One React version for the whole repo (19.3.0, pinned by `pnpm.overrides`): Expo requires it, and mixing versions breaks the Next.js build
- Docker engine (Colima: `colima start`) and the Supabase CLI

## Run locally

```bash
colima start                 # container engine, once per boot
pnpm install
pnpm db:start                # local Supabase: API :54321, Studio :54323
cp apps/backoffice/.env.example apps/backoffice/.env.local   # fill the anon key from `supabase status -o env`
pnpm dev                     # http://localhost:3100
```

Test logins and employee PINs are listed in [supabase/seed.sql](supabase/seed.sql) (local only). The seed also generates 14 days of demo sales (up to the day before `pnpm db:reset` is run).

`pnpm --filter backoffice build` writes to `.next-build`, so it can run while `pnpm dev` is serving from `.next`.

## Backoffice pages

| Section | Pages | Who |
|---|---|---|
| Library (per location) | Items (variants, sales-type prices, modifiers, stock, copy to locations), Import CSV, Categories, Modifiers, Sales types, Discounts | Owner, admin |
| Location settings | Checkout (tax, service, rounding, bills, shifts), Payment methods, Receipt (live preview), Tables (floor map per area, the same one the tablets show: drag to place or swap, click to edit; areas, seats, shape; bulk add "T1–T10"; shows which are in use), POS tablets | Owner, admin |
| Business | Locations, Employees (role, locations, 4-digit PIN), Roles (POS permissions) | Owner |
| Reports | Dashboard (KPIs vs previous period, daily/hourly charts, payment mix, top items), Sales (summary, items, categories, modifiers, payments, sales types, discounts, staff), Transactions (sales, cancelled bills, voids, refunds; receipt search), Shifts (cash differences, cash in/out); CSV export everywhere | Owner, admin |

Reports run through `report_sales` / `report_transactions` / `report_shifts` (SECURITY INVOKER, so RLS limits them to locations the user can see). Filters live in the URL (`?loc=all|<id>&range=7d|30d|month|…|custom&from=&to=`); days are bucketed in WIB. Definitions are documented at the top of `supabase/migrations/20261124000001_reports.sql`.

Editors open as a side panel driven by the URL (`?edit=<id>` / `?new=1`). Multi-table saves go through database functions (`save_item`, `save_employee`, `copy_items_to_locations`) so they succeed or fail as a whole.

## POS tablet app

```bash
cp apps/pos/.env.example apps/pos/.env.local   # anon key from `supabase status -o env`
cd apps/pos && npx expo start --android         # opens in Expo Go on the emulator / tablet
```

The emulator reaches your Mac as `10.0.2.2`; a real tablet needs your Mac's LAN IP in `EXPO_PUBLIC_SUPABASE_URL`.

- **Side menu** (collapsible; the choice is remembered on the tablet): *Point of Sale*, *Tables* (floor map, busy-table badge), *Activity* (completed sales by day, search by receipt number; details: payment method, receipt number, time, items with modifiers and totals; receipt and refund), *Shift* (Shift option, Current shift, Shift history; a dot means no shift is open), *Settings* (Account, Printer, Log out). On the POS screen, *Billing list* shows open bills (all tablets), cancelled bills with their reason, and item voids with reason, bill and who did it. The bottom shows who is signed in, with a lock button to switch employee.
- **Item grid:** *All items* is grouped under a heading per category (pinned while scrolling; items without a category under *Other*). Categories are chosen from one button that opens a list with item counts (searchable when there are more than 8), so the screen stays tidy however many categories there are.
- **Edit menu** (POS screen, *Edit items on the POS* permission): tap an item to change its name, category, price or sizes/variants, choices (modifier sets) and stock tracking, or remove it from the menu (it is hidden, past sales keep it). *New item* adds an item; categories are added, renamed and deleted from the category button's list (a deleted category's items stay). Online only, via `pos_save_item` / `pos_save_category`; fields the tablet doesn't show (description, photo, cost, per-sales-type prices) are kept.
- **Customers** (POS cart → *Add customer*): search by name or phone, tap to put them on the bill. A customer can have a default discount (e.g. owner 20%) that is applied when they're picked and removed when they're taken off. Adding, editing and deleting customers needs *Edit customer details* and a connection (`pos_save_customer`); customers belong to the location and reach tablets with the catalog. Bills store `customer_id` plus the name as a snapshot.
- **Shift report** (Current shift and each closed shift in Shift history) reads like Moka's Shift Details: shift details, order details (sold / refunded items open a list), cash (starting cash, cash sales, refunds, cash in/out, expected vs actual and the difference), each kind of non-cash payment (QR, card/EDC, delivery, invoice, other) with refunds and expected totals, then the total. *Print shift report* shows a preview until the printer is connected.
- **Items with choices** (temperature, spice level, size…): the pop-up shows one button per combination (e.g. *Panas*, *Dingin*, or *Panas · Pedas* when there are two choices) and stays open, so *2 Panas + 1 Dingin* is three taps; each button shows how many are on the order with a − to undo. *More options* opens the full form (note, item discount, optional toppings) with an add button that keeps the pop-up open for the next one. An *On this order* list shows every line of that item with − / +.
- **Notes:** every cart line (and each line in the item pop-up's *On this order*) has a *Note* button. One-tap notes (this tablet's recent notes first, then common ones like *Less sugar*, *No ice*, *Extra spicy*) can be combined or typed. With several on a line the note goes on **just 1** by default: it moves to its own line, or joins a line that already has that note.
- **Cart:** each line has − / + buttons (− turns into a bin at 1; reducing a saved bill below what was saved asks for a void reason), menu tiles show how many are on the order, and the search box has a clear button.
- **Shift option** on the tablet changes the location's *Start shift automatically* and *Default starting cash* (`pos_shift_settings`, needs a connection and the *Change shift options on the POS* permission, on by default for Managers).
- **Printer settings** (connection, IP or name, paper 58/80 mm, print after every sale, copies) are saved on the tablet; *Test print* shows a preview. Sending to a real printer comes once the printer model is known.
- **Setup:** an owner/admin signs in once and picks the location; the tablet is registered (`register_device`) and gets a receipt prefix (A1, A2…).
- **Unlock:** staff enter their 4-digit PIN, checked offline against bcrypt hashes in the catalog; their role's permissions apply.
- **Offline-first:** everything is written to on-device SQLite first. A sync loop (every 10 s and after each change) uploads the outbox (shifts → orders → refunds) via `upsert_shift` / `upsert_order` / `submit_refund` (idempotent, versioned; completed sales are immutable), pulls open bills shared by all tablets at the location (`pos_open_orders`) and refreshes the catalog (`pos_catalog`) every 5 min.
- **Shifts:** selling and refunds need an open shift on the tablet (auto-started if the location setting is on). Cash in/out is logged; closing asks for a blind cash count and shows expected vs counted plus totals per payment method (`summarizeShift` in core). Uploaded with `upsert_shift`; a closed shift is immutable.
- **Refunds:** from Sales history, per item and quantity, to any payment method, optionally restocking. Amounts come from `refundAllocator` (bill discounts, tax and rounding shared out; refunding everything returns exactly the total). The server (`submit_refund`) re-checks quantities and amounts across all tablets.
- **Tables:** *Tables* in the top bar opens a 2D floor map, one tab per area (a badge shows how many tables are in use). Each table shows its number and pax (guests/seats, e.g. 3/4 pax); busy tables are green and also show the bill total and time since it was opened. Tables sit on an 8-column grid (`pos_x`/`pos_y`; layout rules shared with the backoffice in `packages/core/src/floor.ts`); in edit mode drag a table to another cell, or onto another table to swap them, and the area's layout is saved (`pos_tables_layout`). Tables without a position fill the first free cells; moving a table to another area clears its position. Tap a free table to start a bill there (guests and optional customer name in the side panel); tap a busy one to open its bill. *Save bill* / *Update bill* also asks for the table (busy tables are greyed out; *No table* keeps a plain bill name for takeaway or bar orders). In the cart, the guests/customer pill edits them and *Move table* moves the whole bill (items, guests, customer) to a free table. A move is a new version of the bill, so it syncs to every tablet (last writer wins). Seating and moving need the *open bills* permission.
- **Editing tables on the tablet:** employees with *Edit tables and areas on the POS* (`tables_manage`, on by default for Managers) get *Edit tables*, or can **hold any table** to jump into editing with it selected (or **hold an area tab** to open that area's name/delete editor). In edit mode, tapping tables selects them (*Select all* / *Clear* per area): one selected opens its editor (name, seats, area, delete); several selected can get the same seats and/or area, or be deleted together (refused as a whole if any has an open bill). *Add table* suggests the next name (e.g. T8 after T7). Areas can be added, renamed or deleted (their tables move to "No area"). Changes need a connection and go through `pos_table_setup` / `pos_tables_bulk`, which keeps them inside the tablet's location; other tablets get them with the next catalog refresh. The backoffice *Tables* page edits the same data.
- **Upload errors:** each record is handled on its own (`classifySyncError` in core): network trouble → retry with backoff; expired sign-in → "Sign in again" from the sync badge (nothing lost); a record the server refuses → kept and shown as "needs attention" with Retry, without blocking the queue. The tablet reports its health (`device_heartbeat`) to the backoffice **Tablets** page, where a lost tablet can be revoked.
- **PIN unlock:** one SHA-256 lookup (`pin_lookup`), bcrypt only for PINs set before lookups existed. 5 wrong PINs lock the pad (30 s, doubling).
- **Printing:** receipts are laid out and ESC/POS-encoded in `packages/core/src/receipt.ts`; the Bluetooth/LAN transport is added once the printer model is known.

## Checks

```bash
pnpm db:test            # database tests (pgTAP)
pnpm test:integration   # two simulated tablets against the running local Supabase
pnpm db:backup          # back up to backups/<stamp>/ (restore: scripts/restore.sh)
pnpm test         # unit tests
pnpm typecheck
pnpm db:reset     # rebuild the local DB from migrations + seed
```

## How location isolation works

Every operational table has `account_id` + `location_id`, with a composite foreign key to `locations(id, account_id)` so a row can never point at another business's location. Row-Level Security calls `app.location_role(location_id)`: owners reach all their locations, admins and staff only the ones assigned in `member_locations`; only owners and admins can write. New location-scoped tables: add them to the policy loop in `supabase/migrations/20261121000001_catalog_settings_staff.sql` (same four policies + `freeze_scope` trigger) and add a cross-location test.
