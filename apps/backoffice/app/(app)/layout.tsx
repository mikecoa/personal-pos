import { type BackofficePage } from "@pos/core";
import { Tip } from "@/components/controls";
import Link from "next/link";
import { redirect } from "next/navigation";
import { canOpen, currentPath, getSession } from "@/lib/session";
import { getT } from "@/lib/prefs";
import { LocationSwitcher } from "@/components/location-switcher";
import { Nav, type NavGroup } from "@/components/nav";
import { AppShell } from "@/components/app-shell";
import { PageFade } from "@/components/page-fade";
import { OrdaMark } from "@/components/brand";
import { tx } from "@/lib/i18n";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, membership, role, isOwner, canManage, locations, location, pages } = await getSession();
  const t = await getT();
  const path = await currentPath();
  const allowedHere = await canOpen(path);
  const has = (k: BackofficePage) => pages.has(k);
  const keep = (items: { label: string; href: string; page: BackofficePage }[]) => items.filter((i) => has(i.page)).map(({ label, href }) => ({ label: t(label), href }));

  const groups: NavGroup[] = [];
  if (!canManage || has("dashboard")) groups.push({ label: t("Overview"), items: [{ label: t(canManage ? "Dashboard" : "Home"), href: "/" }] });
  if (canManage) {
    const add = (label: string, items: { label: string; href: string; page: BackofficePage }[]) => {
      const visible = keep(items);
      if (visible.length) groups.push({ label: t(label), items: visible });
    };
    add("Reports", [
      { label: "Sales", href: "/reports/sales", page: "reports_sales" },
      { label: "Transactions", href: "/reports/transactions", page: "reports_transactions" },
      { label: "Shifts", href: "/reports/shifts", page: "reports_shifts" },
    ]);
    add("Library", [
      { label: "Items", href: "/library/items", page: "library_items" },
      { label: "Categories", href: "/library/categories", page: "library_categories" },
      { label: "Modifiers", href: "/library/modifiers", page: "library_modifiers" },
      { label: "Sales types", href: "/library/sales-types", page: "library_sales_types" },
      { label: "Discounts", href: "/library/discounts", page: "library_discounts" },
      { label: "Quick notes", href: "/library/quick-notes", page: "library_quick_notes" },
    ]);
    add("Location settings", [
      { label: "Checkout", href: "/settings/checkout", page: "settings_checkout" },
      { label: "Payment methods", href: "/settings/payments", page: "settings_payments" },
      { label: "Receipt", href: "/settings/receipt", page: "settings_receipt" },
      { label: "Tables", href: "/settings/tables", page: "settings_tables" },
      { label: "POS tablets", href: "/settings/tablets", page: "settings_tablets" },
    ]);
  }
  if (isOwner) {
    groups.push({
      label: t("Employees"),
      items: [
        { label: t("Employee slots"), href: "/employees" },
        { label: t("Employee access"), href: "/employees/access" },
        { label: t("PIN access"), href: "/employees/pin" },
      ],
    });
    groups.push({ label: t("Business"), items: [{ label: t("Locations"), href: "/settings/locations" }] });
  }

  // Without the dashboard, the home page opens the first page this person may use.
  if (path === "/" && !allowedHere && groups[0]?.items[0]) redirect(groups[0].items[0].href);

  const email = user.email ?? "";
  const onSettings = path === "/account" || path.startsWith("/account/");
  return (
    <div className="min-h-dvh lg:flex">
      <AppShell menuLabel={t("Menu")} closeLabel={t("Close menu")} brand={
        <div className="flex min-w-0 items-center gap-2.5 px-1">
          <OrdaMark size={36} />
          <div className="min-w-0">
            <p className="truncate font-bold leading-tight">{membership.accounts?.name}</p>
            <p className="truncate text-xs text-ink-2">{location ? `${t(ROLE[role] ?? role)} · ${location.name}` : t(ROLE[role] ?? role)}</p>
          </div>
        </div>
      }>
        <LocationSwitcher key={location?.id} locations={locations} current={location?.id} />
        <Nav groups={groups} />
        <div className="mt-auto flex items-center gap-1 rounded-xl border border-line bg-surface p-1.5">
          <Link href="/account" aria-current={onSettings ? "page" : undefined}
            className={`group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors ${onSettings ? "bg-accent-soft" : "hover:bg-surface-2"}`}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-ink">{(email[0] ?? "?").toUpperCase()}</span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold leading-tight">{t("Settings")}</span>
              <span className="block truncate text-xs text-ink-2">{email}</span>
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="ml-auto shrink-0 text-ink-2 transition-transform duration-300 group-hover:rotate-45">
              <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
            </svg>
          </Link>
          <form action="/auth/signout" method="post">
            <Tip label={t("Sign out")}>
            <button aria-label={t("Sign out")} className="grid h-11 w-10 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-danger/10 hover:text-danger">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            </button>
            </Tip>
          </form>
        </div>
      </AppShell>
      <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-7 lg:px-10 lg:py-9">
        {allowedHere ? <PageFade>{children}</PageFade> : (
          <div className="anim-rise mx-auto max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
            <p className="font-semibold">{t("You don’t have access to this page")}</p>
            <p className="mt-1 text-sm text-ink-2">{t("Your role doesn’t include it. Ask the owner to change your access under Employees → Employee access.")}</p>
            {groups[0]?.items[0] && <Link href={groups[0].items[0].href} className="mt-4 inline-block text-sm font-semibold text-accent underline-offset-4 hover:underline">{t("Go to {page}", { page: groups[0].items[0].label })}</Link>}
          </div>
        )}
      </main>
    </div>
  );
}

const ROLE: Record<string, string> = { owner: tx("Owner"), admin: tx("Admin"), staff: tx("Staff") };
