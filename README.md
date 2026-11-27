<p align="center">
  <img src="brand/orda-mark-512.png" alt="Orda" width="96" />
</p>

<h1 align="center">Orda</h1>

<p align="center">
  The point of sale for our cafés: an Android POS app for the counter and a web backoffice for the owner.<br />
  Works offline, prints to Bluetooth, Wi-Fi and USB printers, and keeps every location's data separate.
</p>

<p align="center">
  <a href="https://ordapos.vercel.app"><b>Backoffice</b></a> ·
  <a href="https://github.com/mikecoa/personal-pos/releases/latest"><b>Download the app</b></a> ·
  <a href="docs/operations.md"><b>Day-to-day operations</b></a>
</p>

---

## Contents

- [Getting started](#getting-started)
- [The POS app](#the-pos-app)
- [The backoffice](#the-backoffice)
- [Run it locally](#run-it-locally)
- [Release a new version](#release-a-new-version)
- [Checks](#checks)
- [How it works](#how-it-works)
- [More docs](#more-docs)

## Getting started

1. **Install the app.** Download the APK from the [latest release](https://github.com/mikecoa/personal-pos/releases/latest), copy it to the tablet or phone and tap it. After that, the app offers new versions by itself.
2. **Set up the tablet.** An owner or admin signs in once and picks the location. The tablet registers itself and gets its own receipt prefix (A1, A2…).
3. **Unlock and sell.** Staff unlock the tablet with their 4-digit PIN. Their role decides what they can do; managers can approve anything else on the spot with their PIN.

Runs on Android tablets (built for the Samsung Galaxy Tab A11, landscape) and phones (portrait), in English or Indonesian.

## The POS app

| | |
|---|---|
| **Selling** | Menu grouped by category with one category button, search by name or SKU, items with choices (size, temperature, spice level) in a quick pop-up, quick notes, item and bill discounts, customers with their own default discount, custom amounts. |
| **Bills** | Save a bill to a table or by name, split it into several bills, move it to another table (a split bill moves as a whole), and see every open bill from all tablets in the Billing list. |
| **Tables** | A floor map per area that shows busy tables with their total and how long they've been open. Managers can add, move and edit tables right on the tablet. |
| **Payment** | Cash with suggested amounts and change, QR / e-wallet, card and other methods, and split payments. Charging always prints any order tickets the kitchen hasn't had yet. |
| **Printing** | Receipts, bills and kitchen order tickets on 58 or 80 mm ESC/POS printers over Bluetooth, Wi-Fi or USB, with a preview before printing. |
| **Shifts** | Starting cash, cash in/out, a blind cash count at closing, and a shift report with expected vs counted cash and totals per payment method. |
| **After the sale** | Activity shows completed sales by day with search by receipt number; refunds per item to any payment method, optionally putting stock back. |
| **Staff and safety** | PIN unlock with lockout after wrong tries, manager PIN approval for locked actions, and every void, cancellation and refund recorded with its reason. |
| **Offline** | Everything is saved on the tablet first and syncs in the background. A sale is never lost when the internet drops. |

## The backoffice

| Section | What's there | Who |
|---|---|---|
| **Reports** | Dashboard (compared with the previous period, daily and hourly charts, payment mix, top items), sales by item, category, modifier, payment, sales type, discount and staff, transactions (sales, cancelled bills, voids, refunds), shifts. CSV export everywhere. | Owner, admin |
| **Library** | Items (variants, prices per sales type, modifiers, stock, copy to other locations), CSV import, categories, modifiers, sales types, discounts, quick notes. | Owner, admin |
| **Location settings** | Checkout (tax, service, rounding, bills, shifts), payment methods, receipt layout with live preview, the table floor map, POS tablets. | Owner, admin |
| **Employees** | Employee slots with PINs, roles with POS and backoffice permissions, and which actions need a manager's PIN. | Owner |
| **Business** | Locations. | Owner |

Staff can get their own backoffice login: give their role backoffice pages and put an email on their employee slot; they then create an account with that email and see only the pages and locations they're allowed.

## Run it locally

You need **Node 22** (`nvm use`), **pnpm 9** (`corepack enable`), **Docker** (e.g. `colima start`) and the **Supabase CLI**.

```bash
pnpm install
pnpm db:start                # local Supabase: API on :54321, Studio on :54323
cp apps/backoffice/.env.example apps/backoffice/.env.local   # anon key from `supabase status -o env`
pnpm dev                     # backoffice on http://localhost:3100
```

For the POS app:

```bash
cp apps/pos/.env.example apps/pos/.env.local   # anon key from `supabase status -o env`
cd apps/pos && npx expo start --dev-client      # then open Orda's development build on the emulator or tablet
```

An Android emulator reaches your Mac as `10.0.2.2`; a real tablet needs your Mac's LAN IP in `EXPO_PUBLIC_SUPABASE_URL`.

Local test logins and employee PINs are in [`supabase/seed.sql`](supabase/seed.sql). The seed also creates 14 days of demo sales.

<details>
<summary><b>Repository layout</b></summary>

```
apps/backoffice      Next.js web backoffice (port 3100)
apps/pos             Expo (React Native) POS app, offline-first
packages/core        Shared TypeScript: money, cart pricing, receipts/ESC-POS, CSV, permissions, DB types
supabase/migrations  Database schema and Row-Level Security
supabase/seed.sql    Local demo data and test logins
supabase/tests       pgTAP database tests
scripts/             Release, deploy, backup and restore scripts
```

The whole repo uses one React version (pinned with `pnpm.overrides`), because Expo requires it and mixing versions breaks the Next.js build.
</details>

## Release a new version

```bash
supabase db push --remote             # 1. only when there are new migrations
scripts/deploy-web.sh                 # 2. publish the backoffice to Vercel
scripts/release-app.sh "What's new"   # 3. build and publish the POS app
```

Before step 3, raise `version` and `android.versionCode` in `apps/pos/app.json`. The app decides whether an update is newer by `versionCode` alone, so it must go up by one every release. The script asks for the signing key password, then builds `dist/orda-<version>.apk`, uploads it with a `latest.json` to the `app-releases` storage bucket and attaches it to a GitHub release.

Tablets and phones offer the update when the app opens or comes back to the front, never in the middle of an order. Android asks once to allow installing from Orda and confirms every update.

## Checks

```bash
pnpm test               # unit tests
pnpm typecheck
pnpm db:test            # database tests (pgTAP)
pnpm test:integration   # two simulated tablets against the local Supabase
pnpm db:reset           # rebuild the local database from migrations and seed
pnpm db:backup          # back up to backups/<stamp>/ (restore with scripts/restore.sh)
```

## How it works

<details>
<summary><b>Offline-first sync</b></summary>

Every change is written to SQLite on the tablet first. A sync loop (every 10 s and after each change) uploads shifts, orders and refunds through `upsert_shift`, `upsert_order` and `submit_refund`. These are idempotent and versioned, and completed sales can't be changed. The tablet also pulls the open bills shared by all tablets at the location (`pos_open_orders`) and refreshes the catalog (`pos_catalog`) every 5 minutes.

Each record uploads on its own (`classifySyncError` in core): network trouble retries with backoff, an expired sign-in shows "Sign in again" without losing anything, and a record the server refuses is kept and marked "needs attention" without blocking the rest. Tablets report their health to the backoffice **Tablets** page, where a lost tablet can be revoked.
</details>

<details>
<summary><b>Location isolation</b></summary>

Every operational table has `account_id` and `location_id`, with a composite foreign key to `locations(id, account_id)`, so a row can never point at another business's location. Row-Level Security calls `app.location_role(location_id)`: owners reach all their locations, admins and staff only the ones assigned to them, and only owners and admins can write.

To add a location-scoped table, add it to the policy loop in `supabase/migrations/20261121000001_catalog_settings_staff.sql` (the same four policies plus the `freeze_scope` trigger) and add a cross-location test.
</details>

<details>
<summary><b>PINs and permissions</b></summary>

PINs are checked offline against hashes in the catalog (one SHA-256 lookup; bcrypt only for older PINs). Five wrong PINs lock the pad for 30 seconds, doubling each time. A locked action asks for the PIN of anyone whose role can approve; one approval covers one action.

The backoffice page list for staff logins is enforced by `pageForPath` in `packages/core/src/backoffice.ts`; database rules apply per location.
</details>

<details>
<summary><b>Money, receipts and refunds</b></summary>

Cart pricing, tax, service and rounding live in `packages/core`, shared by the app and the backoffice. Receipts are laid out and ESC/POS-encoded in `packages/core/src/receipt.ts`. Refund amounts come from `refundAllocator`: bill discounts, tax and rounding are shared out, and refunding everything returns exactly the total. The server re-checks refund quantities and amounts across all tablets.

Reports run through `report_sales`, `report_transactions` and `report_shifts` (security invoker, so RLS limits them to locations the user can see). Days are counted in WIB.
</details>

## More docs

- [Day-to-day operations](docs/operations.md): backups, tablets, troubleshooting
- [Going live](docs/go-live.md)
- [Original plan](docs/mvp-plan.md)
