"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavGroup = { label: string; items: { label: string; href: string }[] };

export function Nav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  return (
    <nav className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-[0.06em] text-ink-2/75">{g.label}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={isActive(i.href) ? "page" : undefined}
                  className={`block whitespace-nowrap rounded-lg px-3 py-2 text-[14px] transition ${
                    isActive(i.href) ? "bg-accent-soft font-semibold text-accent" : "font-medium text-ink/80 hover:bg-surface hover:text-ink"
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
