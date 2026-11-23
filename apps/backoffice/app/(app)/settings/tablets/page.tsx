import { requireManage } from "@/lib/session";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { RevokeButton } from "./revoke-button";
import { getT } from "@/lib/prefs";
import type { T } from "@/lib/i18n";

const ago = (iso: string | null, t: T) => {
  if (!iso) return t("never");
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return t("just now");
  if (m < 60) return t("{n} min ago", { n: m });
  if (m < 48 * 60) return t("{n} h ago", { n: Math.round(m / 60) });
  return t("{n} days ago", { n: Math.round(m / 1440) });
};

export default async function TabletsPage() {
  const t = await getT();
  const { supabase, location } = await requireManage();
  const { data: devices, error } = await supabase.from("devices")
    .select("id, name, receipt_prefix, created_at, last_seen_at, last_sync_ok_at, app_version, pending_count, rejected_count, last_error, revoked_at")
    .eq("location_id", location.id).order("created_at");
  if (error) throw error;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("Tablets")} description={<>{t("POS tablets set up at")} <b>{location.name}</b>{t(", and whether their sales are reaching the server.")}</>} />
      {!devices.length ? <EmptyState title={t("No tablets yet")}>{t("Install the POS app and sign in with an owner or admin account to set one up.")}</EmptyState> : (
        <ul className="space-y-3">
          {devices.map((d) => {
            const seenMin = d.last_seen_at ? (Date.now() - new Date(d.last_seen_at).getTime()) / 60_000 : Infinity;
            const status = d.revoked_at ? <Badge>{t("Revoked")}</Badge>
              : d.rejected_count > 0 ? <Badge tone="danger">{t("{n} need attention", { n: d.rejected_count })}</Badge>
              : seenMin <= 2 ? <Badge tone="accent">{t("Online")}</Badge>
              : <Badge>{t("Offline")}</Badge>;
            return (
              <li key={d.id} className={`rounded-2xl border border-line bg-surface p-5 ${d.revoked_at ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{d.name} <span className="ml-1 text-sm font-normal text-ink-2">{t("receipts {prefix}-…", { prefix: d.receipt_prefix })}</span></p>
                    <div className="mt-1">{status}</div>
                  </div>
                  {!d.revoked_at && <RevokeButton id={d.id} name={d.name} unsent={d.pending_count + d.rejected_count} />}
                </div>
                <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                  <div><dt className="text-ink-2">{t("Last seen")}</dt><dd>{ago(d.last_seen_at, t)}</dd></div>
                  <div><dt className="text-ink-2">{t("Last good sync")}</dt><dd>{ago(d.last_sync_ok_at, t)}</dd></div>
                  <div><dt className="text-ink-2">{t("Waiting to upload")}</dt><dd className={d.pending_count > 0 ? "font-semibold text-danger" : ""}>{d.pending_count}</dd></div>
                  <div><dt className="text-ink-2">{t("App version")}</dt><dd>{d.app_version ?? "—"}</dd></div>
                </dl>
                {d.last_error && !d.revoked_at && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">Last problem: {d.last_error}</p>}
                {d.revoked_at && <p className="mt-3 text-sm text-ink-2">{t("Revoked {when}. Past sales stay in the reports.", { when: ago(d.revoked_at, t) })}</p>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-6 text-sm text-ink-2">
        {t("A tablet that was offline keeps its sales and uploads them when it reconnects. If one shows")} <b>{t("need attention")}</b>{t(", open the sync status on that tablet to see why and retry.")}
      </p>
    </div>
  );
}
