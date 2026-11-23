"use client";
import { useEffect, useState } from "react";

/**
 * Headline number that counts up quickly when the page opens (about half a second), then shows
 * the exact server-formatted text. People who prefer less motion see the final value at once.
 */
export function CountUp({ to, text, money }: { to: number; text: string; money?: boolean }) {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => {
    if (!Number.isFinite(to) || to <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now(), dur = 550;
    const fmt = (n: number) => (money ? `Rp ${Math.round(n).toLocaleString("id-ID")}` : Math.round(n).toLocaleString("id-ID"));
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - (1 - p) ** 3;
      if (p < 1) { setShown(fmt(to * eased)); raf = requestAnimationFrame(step); } else setShown(null);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, money]);
  return <>{shown ?? text}</>;
}
