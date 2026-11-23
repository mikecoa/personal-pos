-- Results of the nightly Telegram backup (.github/workflows/telegram-backup.yml writes a row after
-- each run with the database owner's connection). Owners can read them on Settings > Backup.
create table public.backup_runs (
  id          bigint generated always as identity primary key,
  ran_at      timestamptz not null default now(),
  ok          boolean not null,
  size_bytes  bigint,
  note        text check (char_length(note) <= 200)
);
create index backup_runs_ran_at_idx on public.backup_runs (ran_at desc);
alter table public.backup_runs enable row level security;

-- Business owners may see the backup history; nobody writes through the API.
create policy backup_runs_select on public.backup_runs for select to authenticated
  using (exists (select 1 from public.members m where m.user_id = auth.uid() and m.role = 'owner'));
revoke insert, update, delete on public.backup_runs from anon, authenticated;
