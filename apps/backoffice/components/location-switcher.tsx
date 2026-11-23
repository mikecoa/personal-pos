"use client";
import { useTransition } from "react";
import { selectLocation } from "@/app/(app)/actions";
import { Select } from "./controls";
import { useT } from "./lang";

export function LocationSwitcher({ locations, current }: { locations: { id: string; name: string }[]; current?: string }) {
  const [pending, start] = useTransition();
  const t = useT();
  return (
    <div className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
      <span className="mb-1 block px-1 text-xs font-medium text-ink-2">{t("Location")}</span>
      <Select
        ariaLabel={t("Location")} size="sm" defaultValue={current} className="font-semibold"
        options={locations.map((l) => ({ value: l.id, label: l.name }))}
        onChange={(id) => start(async () => { const f = new FormData(); f.set("location", id); await selectLocation(f); })}
      />
    </div>
  );
}
