"use client";
import { startTransition, useActionState, useEffect } from "react";
import { toast, useConfirm } from "@/components/controls";
import { revokeTablet } from "./actions";
import { useT } from "@/components/lang";

export function RevokeButton({ id, name, unsent, endsSignIn }: { id: string; name: string; unsent: number; endsSignIn: boolean }) {
  const t = useT();
  const [state, action, pending] = useActionState(revokeTablet, undefined);
  const confirm = useConfirm();
  useEffect(() => { if (state?.ok) toast(`${name} revoked`); }, [state, name]);
  return (
    <div>
      <button type="button" disabled={pending}
        onClick={async () => {
          const yes = await confirm({
            title: `Revoke "${name}"?`,
            body: <>{t("It stops syncing immediately, its sign-in is ended, and it can’t be used again until it is reset and set up.")}
              {!endsSignIn && <span className="mt-2 block">{t("This tablet was set up before sign-ins could be ended from here. If it was lost or stolen, also use Account › Sign out everywhere.")}</span>}
              {unsent > 0 && <span className="mt-2 block font-medium text-danger">{t("It still has {n} records waiting to upload; those will never arrive.", { n: unsent })}</span>}</>,
            confirmLabel: t("Revoke"), danger: true,
          });
          if (!yes) return;
          const f = new FormData(); f.set("id", id);
          startTransition(() => action(f));
        }}
        className="h-9 rounded-lg border border-danger/40 px-3 text-sm font-semibold text-danger transition hover:bg-danger/10 active:scale-[0.98] disabled:opacity-50">
        {pending ? t("Revoking…") : t("Revoke")}
      </button>
      {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </div>
  );
}
