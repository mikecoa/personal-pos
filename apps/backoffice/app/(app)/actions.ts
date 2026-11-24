"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { LOCATION_COOKIE, PREVIEW_COOKIE, getSession } from "@/lib/session";

export async function selectLocation(form: FormData) {
  const id = String(form.get("location") ?? "");
  const { locations } = await getSession();
  // Only accept a location this user can actually see (RLS already filtered the list).
  if (!locations.some((l) => l.id === id)) return;
  (await cookies()).set(LOCATION_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

/** Look at the backoffice as a role below you (view only). The database decides who may preview what. */
export async function startPreview(roleId: string) {
  const { supabase } = await getSession();
  const { data } = await supabase.rpc("role_preview", { p_role: roleId });
  if (!data) return;
  (await cookies()).set(PREVIEW_COOKIE, roleId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 4 });
  redirect("/");
}

export async function endPreview() {
  (await cookies()).delete(PREVIEW_COOKIE);
  redirect("/employees/access");
}
