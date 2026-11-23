"use client";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { checkForm } from "@/components/controls";
import { OrdaLogo } from "@/components/brand";
import { Button, ErrorNote, Field } from "@/components/ui";
import { createBusiness } from "./actions";
import { useT } from "@/components/lang";

export function OnboardingForm() {
  const t = useT();
  const [state, action, pending] = useActionState(createBusiness, undefined);
  const [invalid, setInvalid] = useState<string | null>(null);
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const problem = checkForm(e.currentTarget);
    setInvalid(problem);
    if (problem) return;
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-6"><OrdaLogo size={44} /></div>
        <h1 className="text-2xl font-bold tracking-tight">{t("Set up your business")}</h1>
        <p className="mt-1 mb-6 text-ink-2">{t("You can add more locations later. Each location keeps its own menu, sales and shifts.")}</p>
        <form onSubmit={submit} noValidate className="anim-rise space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <Field label={t("Business name")} name="business" placeholder={t("e.g. Kopi Senja")} required />
          <Field label={t("First location")} name="location" placeholder={t("e.g. Sudirman branch")} required />
          <ErrorNote message={invalid ?? state?.error} />
          <Button type="submit" disabled={pending} className="w-full">{pending ? t("Creating…") : t("Create business")}</Button>
        </form>
      </div>
    </main>
  );
}
