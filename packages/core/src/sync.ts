/**
 * How the tablet reacts to an upload error. Pure and shared so it can be unit-tested.
 *
 *   retry         network / server trouble: stop this pass, try again later with backoff
 *   auth          the sign-in expired or was revoked: stop; ask an owner/admin to sign in again
 *   unregistered  the server no longer knows this tablet: stop; it must be reset
 *   skip          depends on something not uploaded yet (missing parent row): leave it queued,
 *                 continue with the rest, try again next pass
 *   reject        the server will never accept this record as is: keep it on the tablet,
 *                 flag it for attention, continue with the rest (never block the queue)
 */
export type SyncDecision = "retry" | "auth" | "unregistered" | "skip" | "reject";
export type SyncErrorLike = { code?: string | null; message?: string | null; status?: number | null; name?: string | null } | null | undefined;

export function classifySyncError(e: SyncErrorLike): SyncDecision {
  if (!e) return "retry";
  const code = e.code ?? "";
  const msg = (e.message ?? "").toLowerCase();
  if (msg.includes("device not registered")) return "unregistered";
  if (e.status === 401 || code === "PGRST301" || code === "PGRST302" || msg.includes("jwt") || msg.includes("refresh token")) return "auth";
  if (code === "23503") return "skip";                                    // foreign key: parent not uploaded yet
  if (/^(22|23)/.test(code) || code === "P0001") return "reject";         // data / constraint errors
  if (code === "42501") return "auth";                                    // permission lost (e.g. role changed)
  return "retry";                                                         // fetch failed, timeouts, 5xx, unknown
}

/** Wait before the next automatic attempt after `failures` consecutive transient failures. */
export function backoffMs(failures: number, base = 10_000, max = 5 * 60_000): number {
  if (failures <= 0) return 0;
  return Math.min(max, base * 2 ** (failures - 1));
}

/** Records still waiting after this many "skip"s are flagged too, so nothing waits forever unseen. */
export const MAX_SKIPS = 20;
