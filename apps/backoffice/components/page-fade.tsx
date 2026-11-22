"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Fades each page up gently when you move to another page (not when a panel opens). */
export function PageFade({ children }: { children: ReactNode }) {
  return <div key={usePathname()} className="anim-rise">{children}</div>;
}
