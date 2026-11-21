"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavGroup = { label: string; items: { label: string; href: string }[] };

export function Nav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  return (
    <nav className="flex gap-4 overflow-x-auto md:flex-col md:gap-5">
      {groups.map((g) => (
        <div key={g.label} className="shrink-0">
          <p className="mb-1 hidden px-3 text-[11px] font-semibold tracking-wide text-ink-2/80 md:block">{g.label}</p>
          <ul className="flex gap-1 md:flex-col">
            {g.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={isActive(i.href) ? "page" : undefined}
                  className={`block whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition ${
                    isActive(i.href) ? "bg-accent-soft font-semibold text-accent" : "text-ink-2 hover:bg-surface hover:text-ink"
                  }`}
                >
                  {i.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
