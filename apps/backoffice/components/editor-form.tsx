"use client";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorNote } from "./ui";
import { checkForm, toast, useConfirm } from "./controls";

type State = { error?: string; ok?: boolean; at?: number } | undefined;
type Action = (prev: State, form: FormData) => Promise<State>;

/**
 * Form used inside a <Panel>. Checks fields itself (no browser bubbles), shows errors inline,
 * closes the panel with a "Saved" message on success, and offers a confirmed delete.
 */
export function EditorForm({
  action, deleteAction, closeHref, submitLabel = "Save", deleteLabel = "Delete",
  confirmDelete = "This cannot be undone.", hidden, children,
}: {
  action: Action; deleteAction?: Action; closeHref: string; submitLabel?: string; deleteLabel?: string;
  confirmDelete?: string; hidden?: Record<string, string | undefined>; children: ReactNode;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [state, formAction, pending] = useActionState(action, undefined);
  const [delState, delAction, deleting] = useActionState(deleteAction ?? (async () => undefined), undefined);
  const [invalid, setInvalid] = useState<string | null>(null);
  const delForm = useRef<HTMLFormElement>(null);

  // Submit via onSubmit (not the form `action` prop) so React 19 does not reset
  // the fields after the action: on an error the owner keeps what they typed.
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const problem = checkForm(e.currentTarget);
    setInvalid(problem);
    if (problem) return;
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };

  useEffect(() => {
    if (state?.ok || delState?.ok) {
      toast(delState?.ok ? "Deleted" : "Saved");
      router.replace(closeHref, { scroll: false });
      router.refresh();
    }
  }, [state, delState, closeHref, router]);

  const hiddenInputs = Object.entries(hidden ?? {}).map(([k, v]) => v !== undefined && <input key={k} type="hidden" name={k} value={v} />);

  return (
    <>
      <form onSubmit={submit} noValidate className="space-y-5">
        {hiddenInputs}
        {children}
        <ErrorNote message={invalid ?? state?.error ?? delState?.error} />
        <div className="sticky bottom-0 -mx-6 mt-6 flex items-center gap-2 border-t border-line bg-surface/95 px-6 py-4 backdrop-blur">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
          <Button type="button" variant="secondary" onClick={() => router.replace(closeHref, { scroll: false })}>Cancel</Button>
          {deleteAction && (
            <Button
              type="button" variant="danger" className="ml-auto" disabled={deleting}
              onClick={async () => {
                // "Delete "Kopi"? Past sales keep…" → title "Delete "Kopi"?", body "Past sales keep…"
                const q = confirmDelete.indexOf("?");
                const title = q > 0 && q < 80 ? confirmDelete.slice(0, q + 1) : `${deleteLabel}?`;
                const body = q > 0 && q < 80 ? confirmDelete.slice(q + 1).trim() : confirmDelete;
                if (await confirm({ title, body: body || undefined, confirmLabel: deleteLabel, danger: true })) delForm.current?.requestSubmit();
              }}
            >
              {deleting ? "Deleting…" : deleteLabel}
            </Button>
          )}
        </div>
      </form>
      {deleteAction && <form ref={delForm} action={delAction} className="hidden">{hiddenInputs}</form>}
    </>
  );
}
