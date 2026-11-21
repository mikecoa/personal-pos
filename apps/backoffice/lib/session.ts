import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const LOCATION_COOKIE = "pos_location";

export type Role = "owner" | "admin" | "staff";

/**
 * Signed-in user, their business, the locations RLS lets them see, and the
 * selected location (cookie, validated against that list). Cached per request.
 */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships, error } = await supabase
    .from("members")
    .select("account_id, role, accounts(name)")
    .eq("user_id", user.id);
  if (error) throw error;
  const membership = memberships?.[0];
  if (!membership) redirect("/onboarding");

  const { data: locations, error: locError } = await supabase
    .from("locations")
    .select("id, name, account_id, address, phone, is_active")
    .eq("account_id", membership.account_id)
    .order("name");
  if (locError) throw locError;

  const active = locations.filter((l) => l.is_active);
  const chosen = (await cookies()).get(LOCATION_COOKIE)?.value;
  const location = active.find((l) => l.id === chosen) ?? active[0] ?? null;

  const role = membership.role as Role;
  return {
    supabase,
    user,
    membership,
    role,
    isOwner: role === "owner",
    /** Owners and admins can edit the selected location's setup. */
    canManage: role === "owner" || role === "admin",
    locations: active,
    allLocations: locations,
    location,
  };
});

/** For pages that need a selected location. */
export async function requireLocation() {
  const session = await getSession();
  if (!session.location) redirect("/");
  return { ...session, location: session.location };
}

/** For setup pages: owner or admin of the selected location. */
export async function requireManage() {
  const session = await requireLocation();
  if (!session.canManage) redirect("/");
  return session;
}

/** For business-wide pages: owner only. */
export async function requireOwner() {
  const session = await getSession();
  if (!session.isOwner) redirect("/");
  return session;
}
