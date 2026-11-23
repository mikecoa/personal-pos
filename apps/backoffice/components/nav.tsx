"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavGroup = { label: string; items: { label: string; href: string }[] };

/** Simple line icons for the menu, by page address. */
const ICON: Record<string, string> = {
  "/": "M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 4v3h6V4z",
  "/reports/sales": "M4 20V10M10 20V4M16 20v-7M22 20H2",
  "/reports/transactions": "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  "/reports/shifts": "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  "/library/items": "M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10",
  "/library/categories": "M4 5h7v7H4zM13 5h7v7h-7zM4 14h7v6H4zM13 14h7v6h-7z",
  "/library/modifiers": "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
  "/library/sales-types": "M3 9l2-5h14l2 5M3 9v11h18V9M3 9h18M9 20v-6h6v6",
  "/library/discounts": "M19 5L5 19M7 7h.01M17 17h.01M9 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM19 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z",
  "/library/quick-notes": "M5 4h14v12l-4 4H5zM15 20v-4h4M9 9h6M9 13h3",
  "/settings/checkout": "M3 6h18v12H3zM3 10h18M7 15h3",
  "/settings/payments": "M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4zM4 7V5a1 1 0 0 1 1-1h11M16 13h.01",
  "/settings/receipt": "M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21zM10 8h4M10 12h4",
  "/settings/tables": "M4 9h16M6 9v10M18 9v10M8 5h8",
  "/settings/tablets": "M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2",
  "/employees": "M16 19a4 4 0 0 0-8 0M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM20 19a3 3 0 0 0-3-3M17 5a3 3 0 0 1 0 6",
  "/employees/access": "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6zM9 12l2 2 4-4",
  "/employees/pin": "M8 11V7a4 4 0 0 1 8 0v4M5 11h14v10H5zM12 15v2",
  "/settings/locations": "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
};

export function NavIcon({ href, className = "" }: { href: string; className?: string }) {
  const d = ICON[href];
  if (!d) return <span className={`inline-block h-[18px] w-[18px] ${className}`} />;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={`shrink-0 ${className}`}>
      <path d={d} />
    </svg>
  );
}

export function Nav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  return (
    <nav className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-[0.06em] text-ink-2/75">{g.label}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((i) => {
              const on = isActive(i.href);
              return (
                <li key={i.href}>
                  <Link
                    href={i.href}
                    aria-current={on ? "page" : undefined}
                    className={`group relative flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-[14px] transition-all duration-200 ${
                      on ? "bg-accent-soft font-semibold text-accent" : "font-medium text-ink/80 hover:translate-x-0.5 hover:bg-surface hover:text-ink"
                    }`}
                  >
                    <span aria-hidden className={`absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent transition-all duration-300 ${on ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0"}`} />
                    <NavIcon href={i.href} className={on ? "" : "text-ink-2 transition-colors group-hover:text-ink"} />
                    {i.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
