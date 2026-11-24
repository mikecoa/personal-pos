"use client";
import { useEffect, useState, useTransition } from "react";
import { setActive, type StatusList } from "@/app/(app)/status-actions";
import { Switch, toast } from "./controls";
import { useT } from "./lang";
import { useCanWrite } from "./access";

/**
 * On/off switch for a list row (Active / Hidden …). Flips at once, saves in the background and
 * flips back with a message if saving fails.
 */
export function StatusSwitch({ list, id, active, name, on: onLabel, off: offLabel, disabled }: {
  list: StatusList; id: string; active: boolean; name: string; on?: string; off?: string; disabled?: boolean;
}) {
  const t = useT();
  const on = onLabel ?? t("Active"), off = offLabel ?? t("Hidden");
  const [value, setValue] = useState(active);
  const [pending, start] = useTransition();
  const canWrite = useCanWrite();
  useEffect(() => setValue(active), [active]);
  const change = (next: boolean) => {
    setValue(next);
    start(async () => {
      const r = await setActive(list, id, next);
      if (r.error) { setValue(!next); toast(r.error, "error"); }
      else toast(`${name}: ${next ? on : off}`);
    });
  };
  return (
    <span className="inline-flex items-center gap-2.5" data-row-ignore>
      <Switch checked={value} onChange={change} label={`${name}: ${value ? on : off}`} size="sm" disabled={pending || !canWrite || disabled} />
      <span className={`w-16 text-xs font-semibold transition-colors ${value ? "text-accent" : "text-ink-2"}`}>{value ? on : off}</span>
    </span>
  );
}
