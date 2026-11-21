"use client";
import { startTransition, useActionState, type FormEvent, type ReactNode } from "react";
import { Button, ErrorNote, SavedNote } from "./ui";

type State = { error?: string; ok?: boolean; at?: number } | undefined;

/** Full-page settings form with a sticky Save bar. */
export function SettingsForm({ action, children }: { action: (p: State, f: FormData) => Promise<State>; children: ReactNode }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  // onSubmit instead of `action` so React 19 keeps the entered values after saving.
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };
  return (
    <form onSubmit={submit} className="space-y-5">
      {children}
      <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
        <SavedNote show={!!state?.ok && !pending} />
        <div className="flex-1"><ErrorNote message={state?.error} /></div>
      </div>
    </form>
  );
}
