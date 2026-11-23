"use client";
import { useTransition } from "react";
import { Button } from "@/components/ui";
import { useConfirm } from "@/components/controls";
import { useT } from "@/components/lang";

export function SignOutEverywhere({ action }: { action: () => Promise<void> }) {
  const t = useT();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  return (
    <Button variant="danger" disabled={pending} onClick={async () => {
      if (await confirm({ title: t("Sign out everywhere?"), body: t("You'll need to sign in again on this computer too."), confirmLabel: t("Sign out"), danger: true })) start(() => action());
    }}>{pending ? t("Signing out…") : t("Sign out everywhere")}</Button>
  );
}
