import { type BackofficePage } from "@pos/core";
import { redirect } from "next/navigation";
import { canOpen, currentPath, getSession } from "@/lib/session";
import { LocationSwitcher } from "@/components/location-switcher";
import { Nav, type NavGroup } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, membership, role, isOwner, canManage, locations, location, pages } = await getSession();
  const path = await currentPath();
  const allowedHere = await canOpen(path);
  const has = (k: BackofficePage) => pages.has(k);
  const keep = (items: { label: string; href: string; page: BackofficePage }[]) => items.filter((i) => has(i.page)).map(({ label, href }) => ({ label, href }));

  const groups: NavGroup[] = [];
  if (!canManage || has("dashboard")) groups.push({ label: "OVERVIEW", items: [{ label: canManage ? "Dashboard" : "Home", href: "/" }] });
  if (canManage) {
    const add = (label: string, items: { label: string; href: string; page: BackofficePage }[]) => {
      const visible = keep(items);
      if (visible.length) groups.push({ label, items: visible });
    };
    add("REPORTS", [
      { label: "Sales", href: "/reports/sales", page: "reports_sales" },
      { label: "Transactions", href: "/reports/transactions", page: "reports_transactions" },
      { label: "Shifts", href: "/reports/shifts", page: "reports_shifts" },
    ]);
    add("LIBRARY", [
      { label: "Items", href: "/library/items", page: "library_items" },
      { label: "Categories", href: "/library/categories", page: "library_categories" },
      { label: "Modifiers", href: "/library/modifiers", page: "library_modifiers" },
      { label: "Sales types", href: "/library/sales-types", page: "library_sales_types" },
      { label: "Discounts", href: "/library/discounts", page: "library_discounts" },
      { label: "Quick notes", href: "/library/quick-notes", page: "library_quick_notes" },
    ]);
    add("LOCATION SETTINGS", [
      { label: "Checkout", href: "/settings/checkout", page: "settings_checkout" },
      { label: "Payment methods", href: "/settings/payments", page: "settings_payments" },
      { label: "Receipt", href: "/settings/receipt", page: "settings_receipt" },
      { label: "Tables", href: "/settings/tables", page: "settings_tables" },
      { label: "POS tablets", href: "/settings/tablets", page: "settings_tablets" },
    ]);
  }
  if (isOwner) {
    groups.push({
      label: "EMPLOYEES",
      items: [
        { label: "Employee slots", href: "/employees" },
        { label: "Employee access", href: "/employees/access" },
        { label: "PIN access", href: "/employees/pin" },
      ],
    });
    groups.push({ label: "BUSINESS", items: [{ label: "Locations", href: "/settings/locations" }] });
  }

  // Without the dashboard, the home page opens the first page this person may use.
  if (path === "/" && !allowedHere && groups[0]?.items[0]) redirect(groups[0].items[0].href);

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-5 border-b border-line bg-surface-2 p-4 md:sticky md:top-0 md:h-dvh md:w-60 md:overflow-y-auto md:border-r md:border-b-0">
        <div className="flex items-center gap-2.5 px-1">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent font-bold text-accent-ink">K</div>
          <div className="min-w-0">
            <p className="truncate font-bold leading-tight">{membership.accounts?.name}</p>
            <p className="text-xs capitalize text-ink-2">{role}</p>
          </div>
        </div>
        <LocationSwitcher key={location?.id} locations={locations} current={location?.id} />
        <Nav groups={groups} />
        <form action="/auth/signout" method="post" className="flex items-center gap-2 md:mt-auto md:block">
          <p className="min-w-0 flex-1 truncate px-1 text-xs text-ink-2 md:pb-2">{user.email}</p>
          <button className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface md:w-full">Sign out</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {allowedHere ? children : (
          <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
            <p className="font-semibold">You don’t have access to this page</p>
            <p className="mt-1 text-sm text-ink-2">Your role doesn’t include it. Ask the owner to change your access under Employees → Employee access.</p>
            {groups[0]?.items[0] && <a href={groups[0].items[0].href} className="mt-4 inline-block text-sm font-semibold text-accent underline-offset-4 hover:underline">Go to {groups[0].items[0].label}</a>}
          </div>
        )}
      </main>
    </div>
  );
}
