"use client";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button, ErrorNote } from "./ui";
import { checkForm, toast } from "./controls";

type State = { error?: string; ok?: boolean; at?: number } | undefined;

/** A small form inside a card: our own validation, an inline error, and a toast when it worked. */
export function ActionForm({ action, submitLabel, pendingLabel, done, clearOnDone, children }: {
  action: (p: State, f: FormData) => Promise<State>; submitLabel: string; pendingLabel: string; done: string;
  clearOnDone?: boolean; children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [invalid, setInvalid] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state?.ok) return;
    toast(done);
    if (clearOnDone) ref.current?.reset();
  }, [state, done, clearOnDone]);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const problem = checkForm(e.currentTarget);
    setInvalid(problem);
    if (problem) return;
    const data = new FormData(e.currentTarget);
    startTransition(() => formAction(data));
  };
  return (
    <form ref={ref} onSubmit={submit} noValidate className="space-y-4">
      {children}
      <ErrorNote message={invalid ?? state?.error} />
      <Button type="submit" disabled={pending}>{pending ? pendingLabel : submitLabel}</Button>
    </form>
  );
}
