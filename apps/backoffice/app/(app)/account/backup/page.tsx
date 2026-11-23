import { requireOwner } from "@/lib/session";
import { getPrefs, getT } from "@/lib/prefs";
import { dateLocale } from "@/lib/i18n";
import { Badge, ButtonLink, Card } from "@/components/ui";

const ACTIONS_URL = "https://github.com/mikecoa/personal-pos/actions/workflows/telegram-backup.yml";
const kb = (n: number | null) => (n == null ? "—" : n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.round(n / 1000)} KB`);

export default async function BackupSettings() {
  const { supabase } = await requireOwner();
  const t = await getT();
  const { lang } = await getPrefs();
  const { data: runs } = await supabase.from("backup_runs").select("id, ran_at, ok, size_bytes, note").order("ran_at", { ascending: false }).limit(14);
  const last = runs?.[0];
  const lastOk = runs?.find((r) => r.ok);
  const hoursSince = lastOk ? (Date.now() - new Date(lastOk.ran_at).getTime()) / 3_600_000 : Infinity;
  const healthy = !!last?.ok && hoursSince < 36;
  const when = (iso: string) => new Date(iso).toLocaleString(dateLocale(lang), { timeZone: "Asia/Jakarta", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-start gap-4">
          <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${healthy ? "bg-accent-soft text-accent" : "bg-danger/10 text-danger"}`}>
            {healthy
              ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden><path d="M12 7v6M12 17h.01" /></svg>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold">
              {healthy ? t("Backups are running") : last ? t("The last backup needs a look") : t("No backup recorded yet")}
            </p>
            <p className="mt-0.5 text-sm text-ink-2">
              {lastOk ? t("Last backup: {when} · {size} · sent to Telegram", { when: when(lastOk.ran_at), size: kb(lastOk.size_bytes) }) : t("Backups are recorded here after the first nightly run.")}
            </p>
            <p className="mt-2 text-sm">{t("Every night at 23:30 WIB, everything (menu, sales, shifts, staff and sign-ins) is backed up, encrypted with your backup passphrase and sent to your Telegram bot.")}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <ButtonLink href={ACTIONS_URL} variant="secondary">{t("Back up now (on GitHub)")}</ButtonLink>
          <a href="/account/backup/export" className="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-surface px-4 text-sm font-semibold transition hover:bg-surface-2 active:scale-[0.98]">{t("Download my data")}</a>
        </div>
        <p className="mt-2 text-xs text-ink-2">{t("“Back up now” opens GitHub: press Run workflow there. “Download my data” saves this business's data as one file (not encrypted, keep it safe).")}</p>
      </Card>

      {runs && runs.length > 0 && (
        <Card title={t("Recent backups")}>
          <ul className="divide-y divide-line">
            {runs.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-4 py-2.5 text-[15px]">
                <span>{when(r.ran_at)}</span>
                <span className="flex items-center gap-3 text-sm text-ink-2">
                  {r.ok ? kb(r.size_bytes) : null}
                  {r.ok ? <Badge tone="accent">{t("Sent")}</Badge> : <Badge tone="danger">{t("Failed")}</Badge>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={t("Restoring a backup")}>
        <ol className="list-decimal space-y-1.5 pl-5 text-[15px] text-ink-2">
          <li>{t("Download the backup file from your Telegram bot chat.")}</li>
          <li>{t("On the computer with the Orda code, run scripts/restore-telegram-backup.sh with that file.")}</li>
          <li>{t("Enter your backup passphrase. Without it, nobody can open the backups, including you.")}</li>
        </ol>
      </Card>
    </>
  );
}
