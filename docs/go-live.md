# Going live: a trial week alongside the old POS

The goal: run Orda next to the POS you use today for 7 days and switch only when the daily numbers match.

## 1. What you need to provide

| Needed | Why | Cost |
|---|---|---|
| Supabase account + project (region: Singapore) | Hosts the database and sign-in | Free tier is enough for one café; Pro (~US$25/month) adds daily backups you can restore yourself |
| Vercel account (or any Node host) | Hosts the backoffice website | Free tier |
| The café's Android tablet | Runs the POS app (sideloaded APK, no Play Store needed) | — |
| Receipt printer model | To add printing (Bluetooth / LAN / USB) | — |
| Item export (CSV) from your current POS | To import your real menu | — |

I can't create these accounts for you. Once they exist, the steps below take about an hour.

## 2. Set up (one time)

1. `supabase link --project-ref <ref>` then `supabase db push`: creates all tables and rules in the hosted project. **Do not** load `seed.sql` there; it contains demo logins.
2. In Supabase → Authentication: turn on email confirmation and set the site URL to the backoffice address.
3. Deploy `apps/backoffice` to Vercel with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the hosted project.
4. Open the backoffice → **Create an owner account** → set up your business and location(s).
5. Library → **Import CSV** with the item export from your current POS, then add modifiers (temperature, spice level, combo choices) and attach them to items.
6. Location settings: tables (if you seat customers), payment methods (e.g. *BCA QR*, *EDC BCA*, *EDC BRI*, *Cash*), checkout (tax/service as you charge them today), receipt.
7. Employees: add each cashier with a role and a 4-digit PIN.
8. Build the Android app pointing at the hosted project (`EXPO_PUBLIC_SUPABASE_URL` / `ANON_KEY`), install the APK on the tablet, sign in once as owner, pick the location.

## 3. During the trial week

Ring up every sale in **both** systems (or, if that's too slow at peak times, ring up in the new POS during quiet hours only and compare those hours).

### Daily check (5 minutes, after closing)

| Compare | Orda | Old POS | Must match |
|---|---|---|---|
| Number of sales | Dashboard → Today → Transactions | Sales summary | yes |
| Net sales | Sales → Summary → Net sales | Net sales | yes (or explain: tax/service settings) |
| Per payment method | Sales → Payment methods | Sales by payment method | yes |
| Shift cash | Shifts → Expected vs counted | Shift report | same counted cash |
| Tablet health | Tablets: **0 waiting, 0 need attention** | — | yes |

Write down any difference and why (missed in one system, wrong item, price mismatch). Fix the cause the same day (usually a price or modifier set-up).

### Switch-over criteria

- 3 consecutive days where every row above matches, and
- at least one day with an internet outage handled (turn Wi-Fi off for 15 minutes during service to test), and
- a backup taken and test-restored (`docs/operations.md`).

Then keep the old POS read-only for a month for its history, and export what you need before closing it.

## 4. Known gaps before switching

- Refunds can only be made from the tablet that took the sale.
- No loyalty points or ingredient stock yet (planned "later" items).
