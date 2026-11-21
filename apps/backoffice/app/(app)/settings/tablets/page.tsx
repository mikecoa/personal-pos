import { requireManage } from "@/lib/session";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { RevokeButton } from "./revoke-button";

const ago = (iso: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} days ago`;
};

export default async function TabletsPage() {
  const { supabase, location } = await requireManage();
  const { data: devices, error } = await supabase.from("devices")
    .select("id, name, receipt_prefix, created_at, last_seen_at, last_sync_ok_at, app_version, pending_count, rejected_count, last_error, revoked_at")
    .eq("location_id", location.id).order("created_at");
  if (error) throw error;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Tablets" description={<>POS tablets set up at <b>{location.name}</b>, and whether their sales are reaching the server.</>} />
      {!devices.length ? <EmptyState title="No tablets yet">Install the POS app and sign in with an owner or admin account to set one up.</EmptyState> : (
        <ul className="space-y-3">
          {devices.map((d) => {
            const seenMin = d.last_seen_at ? (Date.now() - new Date(d.last_seen_at).getTime()) / 60_000 : Infinity;
            const status = d.revoked_at ? <Badge>Revoked</Badge>
              : d.rejected_count > 0 ? <Badge tone="danger">{d.rejected_count} need{d.rejected_count === 1 ? "s" : ""} attention</Badge>
              : seenMin <= 2 ? <Badge tone="accent">Online</Badge>
              : <Badge>Offline</Badge>;
            return (
              <li key={d.id} className={`rounded-2xl border border-line bg-surface p-5 ${d.revoked_at ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{d.name} <span className="ml-1 text-sm font-normal text-ink-2">receipts {d.receipt_prefix}-…</span></p>
                    <div className="mt-1">{status}</div>
                  </div>
                  {!d.revoked_at && <RevokeButton id={d.id} name={d.name} unsent={d.pending_count + d.rejected_count} />}
                </div>
                <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                  <div><dt className="text-ink-2">Last seen</dt><dd>{ago(d.last_seen_at)}</dd></div>
                  <div><dt className="text-ink-2">Last good sync</dt><dd>{ago(d.last_sync_ok_at)}</dd></div>
                  <div><dt className="text-ink-2">Waiting to upload</dt><dd className={d.pending_count > 0 ? "font-semibold text-danger" : ""}>{d.pending_count}</dd></div>
                  <div><dt className="text-ink-2">App version</dt><dd>{d.app_version ?? "—"}</dd></div>
                </dl>
                {d.last_error && !d.revoked_at && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">Last problem: {d.last_error}</p>}
                {d.revoked_at && <p className="mt-3 text-sm text-ink-2">Revoked {ago(d.revoked_at)}. Past sales stay in the reports.</p>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-6 text-sm text-ink-2">
        A tablet that was offline keeps its sales and uploads them when it reconnects. If one shows <b>need attention</b>, open the sync status on that tablet to see why and retry.
      </p>
    </div>
  );
}
