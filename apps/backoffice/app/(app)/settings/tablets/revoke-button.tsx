"use client";
import { startTransition, useActionState, useEffect } from "react";
import { toast, useConfirm } from "@/components/controls";
import { revokeTablet } from "./actions";

export function RevokeButton({ id, name, unsent }: { id: string; name: string; unsent: number }) {
  const [state, action, pending] = useActionState(revokeTablet, undefined);
  const confirm = useConfirm();
  useEffect(() => { if (state?.ok) toast(`${name} revoked`); }, [state, name]);
  return (
    <div>
      <button type="button" disabled={pending}
        onClick={async () => {
          const yes = await confirm({
            title: `Revoke "${name}"?`,
            body: <>It stops syncing immediately and can&apos;t be used again until it is reset and set up.
              {unsent > 0 && <span className="mt-2 block font-medium text-danger">It still has {unsent} record(s) waiting to upload; those will never arrive.</span>}</>,
            confirmLabel: "Revoke", danger: true,
          });
          if (!yes) return;
          const f = new FormData(); f.set("id", id);
          startTransition(() => action(f));
        }}
        className="h-9 rounded-lg border border-danger/40 px-3 text-sm font-semibold text-danger transition hover:bg-danger/10 active:scale-[0.98] disabled:opacity-50">
        {pending ? "Revoking…" : "Revoke"}
      </button>
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </div>
  );
}
