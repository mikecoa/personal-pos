"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import { useT } from "@/components/lang";

/** Settings tabs with an underline that slides to the open tab. */
export function SettingsTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const t = useT();
  const path = usePathname();
  const active = [...tabs].reverse().find((t) => path === t.href || path.startsWith(`${t.href}/`))?.href ?? tabs[0]!.href;
  const nav = useRef<HTMLElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>(`[data-href="${active}"]`);
    if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
  }, [active, tabs]);
  return (
    <nav ref={nav} className="relative flex gap-1 overflow-x-auto border-b border-line" aria-label={t("Settings sections")}>
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} data-href={t.href} aria-current={t.href === active ? "page" : undefined}
          className={`whitespace-nowrap px-3 py-2.5 text-sm font-medium transition-colors ${t.href === active ? "text-accent" : "text-ink-2 hover:text-ink"}`}>
          {t.label}
        </Link>
      ))}
      {bar && <span aria-hidden className="absolute bottom-0 h-0.5 rounded-full bg-accent transition-all duration-300 ease-out" style={{ left: bar.left, width: bar.width }} />}
    </nav>
  );
}
