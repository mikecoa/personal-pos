"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCATION_COOKIE, getSession } from "@/lib/session";

export async function selectLocation(form: FormData) {
  const id = String(form.get("location") ?? "");
  const { locations } = await getSession();
  // Only accept a location this user can actually see (RLS already filtered the list).
  if (!locations.some((l) => l.id === id)) return;
  (await cookies()).set(LOCATION_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}
