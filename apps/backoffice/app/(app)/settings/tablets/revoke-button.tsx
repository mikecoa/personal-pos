"use client";
import { useActionState } from "react";
import { revokeTablet } from "./actions";

export function RevokeButton({ id, name, unsent }: { id: string; name: string; unsent: number }) {
  const [state, action, pending] = useActionState(revokeTablet, undefined);
  return (
    <form action={action} onSubmit={(e) => {
      const msg = `Revoke "${name}"? It stops syncing immediately and can't be used again until it is reset and set up.`
        + (unsent ? `\n\nIt still has ${unsent} record(s) waiting to upload; those will never arrive.` : "");
      if (!window.confirm(msg)) e.preventDefault();
    }}>
      <input type="hidden" name="id" value={id} />
      <button disabled={pending} className="rounded-lg border border-danger/40 px-3 py-1.5 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-50">
        {pending ? "Revoking…" : "Revoke"}
      </button>
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </form>
  );
}
