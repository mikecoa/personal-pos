import { getSession } from "@/lib/session";
import { LocationSwitcher } from "@/components/location-switcher";
import { Nav, type NavGroup } from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, membership, role, isOwner, canManage, locations, location } = await getSession();

  const groups: NavGroup[] = [{ label: "OVERVIEW", items: [{ label: canManage ? "Dashboard" : "Home", href: "/" }] }];
  if (canManage) {
    groups.push({
      label: "REPORTS",
      items: [
        { label: "Sales", href: "/reports/sales" },
        { label: "Transactions", href: "/reports/transactions" },
        { label: "Shifts", href: "/reports/shifts" },
      ],
    });
    groups.push({
      label: "LIBRARY",
      items: [
        { label: "Items", href: "/library/items" },
        { label: "Categories", href: "/library/categories" },
        { label: "Modifiers", href: "/library/modifiers" },
        { label: "Sales types", href: "/library/sales-types" },
        { label: "Discounts", href: "/library/discounts" },
        { label: "Quick notes", href: "/library/quick-notes" },
      ],
    });
    groups.push({
      label: "LOCATION SETTINGS",
      items: [
        { label: "Checkout", href: "/settings/checkout" },
        { label: "Payment methods", href: "/settings/payments" },
        { label: "Receipt", href: "/settings/receipt" },
        { label: "Tables", href: "/settings/tables" },
        { label: "PIN approval", href: "/settings/pin-approval" },
        { label: "POS tablets", href: "/settings/tablets" },
      ],
    });
  }
  if (isOwner) {
    groups.push({
      label: "BUSINESS",
      items: [
        { label: "Locations", href: "/settings/locations" },
        { label: "Employees", href: "/employees" },
        { label: "Roles", href: "/employees/roles" },
      ],
    });
  }

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
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
