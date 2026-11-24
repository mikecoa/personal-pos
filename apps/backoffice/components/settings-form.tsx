"use client";
import { useCanWrite } from "./access";
import { startTransition, useActionState, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Button, ErrorNote } from "./ui";
import { checkForm, toast } from "./controls";
import { useT } from "./lang";

type State = { error?: string; ok?: boolean; at?: number } | undefined;

/** Full-page settings form with a sticky Save bar. Checks fields itself and confirms with a toast. */
export function SettingsForm({ action, children }: { action: (p: State, f: FormData) => Promise<State>; children: ReactNode }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [invalid, setInvalid] = useState<string | null>(null);
  const t = useT();
  const canWrite = useCanWrite();          // view-only role: fields shown, nothing can be saved
  // onSubmit instead of `action` so React 19 keeps the entered values after saving.
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const problem = checkForm(e.currentTarget);
    setInvalid(problem);
    if (problem) return;
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };
  useEffect(() => { if (state?.ok) toast(t("Changes saved")); }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <fieldset disabled={!canWrite} className="contents">{children}</fieldset>
      {canWrite && <div className="sticky bottom-0 -mx-4 flex items-center gap-3 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <Button type="submit" disabled={pending}>{pending ? t("Saving…") : t("Save changes")}</Button>
        <div className="flex-1"><ErrorNote message={invalid ?? state?.error} /></div>
      </div>}
    </form>
  );
}
