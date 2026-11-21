"use client";
import { startTransition, useActionState, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorNote } from "./ui";

type State = { error?: string; ok?: boolean; at?: number } | undefined;
type Action = (prev: State, form: FormData) => Promise<State>;

/**
 * Form used inside a <Panel>. Shows errors inline, closes the panel on success,
 * and optionally offers a confirmed delete.
 */
export function EditorForm({
  action, deleteAction, closeHref, submitLabel = "Save", deleteLabel = "Delete",
  confirmDelete = "Delete this? This cannot be undone.", hidden, children,
}: {
  action: Action; deleteAction?: Action; closeHref: string; submitLabel?: string; deleteLabel?: string;
  confirmDelete?: string; hidden?: Record<string, string | undefined>; children: ReactNode;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, undefined);
  const [delState, delAction, deleting] = useActionState(deleteAction ?? (async () => undefined), undefined);
  const delForm = useRef<HTMLFormElement>(null);

  // Submit via onSubmit (not the form `action` prop) so React 19 does not reset
  // the fields after the action: on an error the owner keeps what they typed.
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };

  useEffect(() => {
    if (state?.ok || delState?.ok) {
      router.replace(closeHref, { scroll: false });
      router.refresh();
    }
  }, [state, delState, closeHref, router]);

  const hiddenInputs = Object.entries(hidden ?? {}).map(([k, v]) => v !== undefined && <input key={k} type="hidden" name={k} value={v} />);

  return (
    <>
      <form onSubmit={submit} className="space-y-5">
        {hiddenInputs}
        {children}
        <ErrorNote message={state?.error ?? delState?.error} />
        <div className="flex items-center gap-2 border-t border-line pt-5">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button>
          <Button type="button" variant="secondary" onClick={() => router.replace(closeHref, { scroll: false })}>Cancel</Button>
          {deleteAction && (
            <Button
              type="button" variant="danger" className="ml-auto" disabled={deleting}
              onClick={() => { if (window.confirm(confirmDelete)) delForm.current?.requestSubmit(); }}
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
