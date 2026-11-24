import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { ALL_BACKOFFICE_PAGES, pageForPath, type BackofficePage } from "@pos/core";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const LOCATION_COOKIE = "pos_location";
export const PREVIEW_COOKIE = "pos_preview_role";

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
  // Backoffice pages: owners (and admins not linked to an employee slot) see and change everything;
  // staff who signed in through their employee slot get what their role allows (Employee access):
  // pages to view, and the ones they may also change.
  let pages = new Set<BackofficePage>(ALL_BACKOFFICE_PAGES);
  let writes = new Set<BackofficePage>(ALL_BACKOFFICE_PAGES);
  let myRole: { id: string; name: string } | null = null;
  if (role !== "owner") {
    const { data: emp } = await supabase.from("employees").select("roles(id, name, backoffice_pages, backoffice_write)")
      .eq("account_id", membership.account_id).eq("user_id", user.id).maybeSingle();
    const r = emp?.roles as { id: string; name: string; backoffice_pages?: string[]; backoffice_write?: string[] } | null;
    if (emp) {
      pages = new Set((r?.backoffice_pages ?? []) as BackofficePage[]);
      writes = new Set((r?.backoffice_write ?? []) as BackofficePage[]);
      myRole = r ? { id: r.id, name: r.name } : null;
    }
  }

  // Preview: see the backoffice as a role below you (Employee access → Preview). View-only.
  let preview: { id: string; name: string } | null = null;
  const previewId = (await cookies()).get(PREVIEW_COOKIE)?.value;
  if (previewId) {
    const { data: below } = await supabase.rpc("role_preview", { p_role: previewId });
    const r = below as { id: string; name: string; backoffice_pages: string[] } | null;
    if (r?.id) {
      preview = { id: r.id, name: r.name };
      pages = new Set(r.backoffice_pages as BackofficePage[]);
      writes = new Set();
    }
  }
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
    /** Pages this person can open. */
    pages,
    /** Pages this person can also change (none while previewing a role). */
    writes,
    myRole,
    preview,
  };
});

/** Can this person change backoffice page `page`? */
export async function canWrite(page: BackofficePage) {
  const s = await getSession();
  return s.writes.has(page);
}

/**
 * For server actions that change a page's data: the person must be allowed to change that page
 * (the database checks again). Returns the session with the selected location.
 */
export async function requireWrite(page: BackofficePage) {
  const session = await requireLocation();
  if (!session.writes.has(page)) redirect("/");      // the page hides its edit controls, so only tampering gets here
  return session;
}
/** Same, for business-wide pages (employees, roles): no location needed. */
export async function requireWriteAccount(page: BackofficePage) {
  const session = await getSession();
  if (!session.writes.has(page)) redirect("/");
  return session;
}

/** Can this person open the backoffice page at `path`? */
export async function canOpen(path: string) {
  const s = await getSession();
  const key = pageForPath(path);
  if (key === "owner") return s.isOwner && !s.preview;
  if (key === null) return true;
  return s.pages.has(key);
}
/** Path of the page being rendered (set by the middleware). */
export async function currentPath() { return (await headers()).get("x-pathname") ?? "/"; }

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
