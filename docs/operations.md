# Running the POS day to day

## Backups

### Daily backup to Telegram (automatic)

Every day at **23:30 WIB** a GitHub Action (`.github/workflows/telegram-backup.yml`) backs up the
live database (everything: menu, sales, shifts, staff and sign-in accounts), **encrypts it with your
backup passphrase**, and sends the file `orda-backup-<date>.tgz.enc` to your Telegram bot chat. If it
ever fails, the bot sends a ⚠️ message instead.

- **Set up once:** create a bot with @BotFather in Telegram, then run `scripts/setup-telegram-backup.sh`
  and follow it (bot token, database password and a passphrase; nothing is shown or saved on the Mac).
- **Back up right now:** GitHub → Actions → *Backup to Telegram* → *Run workflow*
  (or `gh workflow run telegram-backup.yml`).
- **Restore:** download the file from Telegram, then
  `scripts/restore-telegram-backup.sh ~/Downloads/orda-backup-….tgz.enc` (asks for the passphrase;
  restores into the local database, or a hosted one with `DATABASE_URL=…`; same rules as `restore.sh` below).
  `UNPACK_ONLY=1` just decrypts and unpacks it into `backups/`.
- **Keep the passphrase safe** (password manager). Without it the backups can't be opened, by
  anyone, including you.
- Tested: backup → wipe → restore from the encrypted file gave identical counts and totals.

### Manual backups

| | Command |
|---|---|
| Back up (local) | `pnpm db:backup` |
| Back up (hosted) | `DATABASE_URL='postgresql://…' pnpm db:backup` |
| Restore | `scripts/restore.sh backups/<stamp>` (into a database with the migrations applied and no data) |

- A backup is `backups/<date_time>/` with `schema.sql`, `data.sql` (all app data **and** sign-in accounts) and `SHA256SUMS`. The newest 30 are kept.
- `restore.sh` checks the checksums first, then loads the data with triggers off, so rows come back exactly as they were.
- Tested: back up → wipe to an empty database → restore gave identical counts and totals, and sign-in still worked.
- Once hosted on Supabase, their daily backups also apply. Still run `db:backup` weekly and copy the folder somewhere off the laptop (cloud drive or USB). A backup on the same machine is not a backup.
- **Restore drill** (once a month, takes 2 minutes locally): `pnpm db:backup`, `supabase db reset --no-seed`, `scripts/restore.sh backups/<stamp>`, then open the dashboard and check yesterday's numbers.

## Watching the tablets

Backoffice → **Location settings → Tablets** shows each tablet's last contact, last good sync, how many records are waiting to upload, records the server rejected, and the app version.

| You see | Meaning | What to do |
|---|---|---|
| Online, 0 waiting | All good | Nothing |
| Offline, some waiting | No internet at the tablet | Sales are safe on the tablet; they upload by themselves when it reconnects |
| *N need attention* | The server refused a record (e.g. a refund for items already refunded on another tablet) | On that tablet tap the sync badge → see the reason → fix the cause → **Retry** |
| Last good sync long ago, but seen recently | Tablet reaches the server but uploads fail | Open the sync badge on the tablet for the exact error |

## On the tablet

- **Sync badge** (top bar and lock screen): tap it for details, items needing attention, *Retry*, and *Sync now*.
- **"Sign in again"**: the tablet's sign-in expired (e.g. password changed). An owner/admin signs in from the sync badge. Nothing stored on the tablet is lost.
- **"Tablet not registered"**: the tablet was revoked, or the database was rebuilt. Check the Tablets page first. Resetting a tablet that still has unsent sales deletes them, and the reset screen says how many before it lets you.
- **PIN lockout**: 5 wrong PINs lock the pad for 30 s, then 60 s, 120 s … (max 15 min). Survives app restarts.

## Lost, stolen or replaced tablet

Backoffice → Tablets → **Revoke**. From that moment it can't upload or download anything, including staff PIN data. Its past sales stay in the reports. Then set up the new tablet as usual. Also change any PINs you think were seen.

## Before you change things

- Check the **Tablets** page shows **0 waiting** on every tablet before resetting a tablet, rebuilding a database, or restoring a backup.
- Menu, price and settings changes in the backoffice reach tablets within ~5 minutes (or immediately with *Sync now*). Bills already open keep the prices they were rung up with.

## Checks for developers

```bash
pnpm db:test            # database: isolation, catalog, sales, shifts/refunds, reports, hardening, tables
pnpm test               # unit: money, pricing, receipts, CSV, refunds/shifts, sync decisions
pnpm test:integration   # two simulated tablets against the running local Supabase
pnpm typecheck
pnpm --filter backoffice build
```
