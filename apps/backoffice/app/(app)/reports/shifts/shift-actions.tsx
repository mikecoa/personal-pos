"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast, useConfirm } from "@/components/controls";
import { MoneyBox } from "@/components/money-input";
import { Button } from "@/components/ui";
import { useT } from "@/components/lang";
import { closeShift, deleteShift } from "./actions";

/** Bottom of the shift panel: close an open shift, or (owner) remove a closed one from the history. */
export function ShiftActions({ id, open, isOwner, closeHref }: { id: string; open: boolean; isOwner: boolean; closeHref: string }) {
  const t = useT();
  const router = useRouter();
  const confirm = useConfirm();
  const [counted, setCounted] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string }>, done: string) => start(async () => {
    const r = await fn();
    if (r.error) { toast(r.error, "error"); return; }
    toast(t(done)); router.replace(closeHref, { scroll: false }); router.refresh();
  });

  if (open) return (
    <div className="mt-8 space-y-3 rounded-xl border border-line p-4">
      <p className="font-semibold">{t("Close this shift")}</p>
      <p className="text-sm text-ink-2">{t("For a shift a tablet left open. Count the cash in the drawer and enter it; the expected cash is worked out from the sales.")}</p>
      <MoneyBox value={counted} onChange={setCounted} ariaLabel={t("Counted cash")} placeholder="0" />
      <Button disabled={pending || counted === null} onClick={async () => {
        if (counted !== null && await confirm({ title: t("Close this shift?"), body: t("The tablet starts a new shift next time it opens one."), confirmLabel: t("Close shift") }))
          run(() => closeShift(id, counted), "Shift closed");
      }}>{pending ? t("Closing…") : t("Close shift")}</Button>
    </div>
  );
  if (!isOwner) return null;
  return (
    <div className="mt-8 border-t border-line pt-4">
      <Button variant="danger" disabled={pending} onClick={async () => {
        if (await confirm({ title: t("Remove this shift from the history?"), body: t("Its cash count and cash in / out are deleted for good. Sales and refunds stay in the reports."), confirmLabel: t("Remove"), danger: true }))
          run(() => deleteShift(id), "Shift removed");
      }}>{pending ? t("Removing…") : t("Remove from history")}</Button>
    </div>
  );
}
