"use client";
import { useRef } from "react";
import { selectLocation } from "@/app/(app)/actions";

export function LocationSwitcher({ locations, current }: { locations: { id: string; name: string }[]; current?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form action={selectLocation} ref={formRef}>
      <label className="mb-1 block px-1 text-xs font-medium text-ink-2">Location</label>
      <select
        name="location"
        defaultValue={current}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-10 w-full rounded-lg border border-line bg-surface px-2.5 text-sm font-semibold outline-none focus:border-accent"
      >
        {locations.map((l) => (
          <option key={l.id} value={l.id}>{l.name}</option>
        ))}
      </select>
    </form>
  );
}
