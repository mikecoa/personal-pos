"use client";
import { useActionState } from "react";
import { Button, ErrorNote, Field } from "@/components/ui";
import { createBusiness } from "./actions";

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createBusiness, undefined);
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-bold tracking-tight">Set up your business</h1>
        <p className="mt-1 mb-6 text-ink-2">You can add more locations later. Each location keeps its own menu, sales and shifts.</p>
        <form action={action} className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <Field label="Business name" name="business" placeholder="e.g. Kopi Senja" required />
          <Field label="First location" name="location" placeholder="e.g. Sudirman branch" required />
          <ErrorNote message={state?.error} />
          <Button type="submit" disabled={pending} className="w-full">{pending ? "Creating…" : "Create business"}</Button>
        </form>
      </div>
    </main>
  );
}
