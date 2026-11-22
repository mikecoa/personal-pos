"use client";
import { useActionState, useState } from "react";
import { Button, ErrorNote, Field } from "@/components/ui";
import { authenticate } from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [state, action, pending] = useActionState(authenticate, undefined);

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-accent text-lg font-bold text-accent-ink">K</div>
          <h1 className="text-2xl font-bold tracking-tight">{mode === "in" ? "Sign in to your backoffice" : "Create your account"}</h1>
          <p className="mt-1 text-ink-2">{mode === "in" ? "Sales, menu and staff for all your locations." : "Owners set up their business next. Staff: use the email the owner added to your employee slot."}</p>
        </div>
        <form action={action} className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <input type="hidden" name="mode" value={mode} />
          <Field label="Email" name="email" type="email" autoComplete="email" required />
          <Field label="Password" name="password" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} minLength={8} required />
          <ErrorNote message={state?.error} />
          {state?.notice && <p role="status" className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-ink">{state.notice}</p>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Please wait…" : mode === "in" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
          className="mt-4 w-full text-center text-sm text-ink-2 underline-offset-4 hover:underline"
        >
          {mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </main>
  );
}
