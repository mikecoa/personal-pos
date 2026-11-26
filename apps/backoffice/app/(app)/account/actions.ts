"use server";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSession, requireOwner } from "@/lib/session";
import { fail, ok, str, type ActionState } from "@/lib/actions";
import { isLang } from "@/lib/i18n";
import { LANG_COOKIE, THEME_COOKIE, getT } from "@/lib/prefs";

const YEAR = 60 * 60 * 24 * 365;

/** Sends a confirmation link to the new address; the email changes once it's clicked. */
export async function updateEmail(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, user } = await getSession();
  const t = await getT();
  const email = str(form, "email").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(t("Enter a valid email address."));
  if (email === user.email) return fail(t("That's already your email."));
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${origin}/login` });
  if (error) return fail(error.message);
  return ok();
}

export async function updatePassword(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await getSession();
  const t = await getT();
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return fail(t("Use at least 8 characters."));
  if (password !== String(form.get("confirm") ?? "")) return fail(t("The two passwords are different."));
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return fail(error.message);
  return ok();
}

/** Signs this account out everywhere: every browser, phone and POS tablet signed in with it (tablets must be set up again). */
export async function signOutEverywhere() {
  const { supabase } = await getSession();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login");
}

export async function renameBusiness(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, membership } = await requireOwner();
  const t = await getT();
  const name = str(form, "name");
  if (!name) return fail(t("Business name is required."));
  const { error } = await supabase.from("accounts").update({ name: name.slice(0, 80) }).eq("id", membership.account_id);
  if (error) return fail(error);
  revalidatePath("/", "layout");
  return ok();
}

/** Appearance is per browser (cookies), so each person picks their own. */
export async function setTheme(theme: string) {
  if (!["light", "dark", "system"].includes(theme)) return;
  (await cookies()).set(THEME_COOKIE, theme, { path: "/", maxAge: YEAR, sameSite: "lax" });
  revalidatePath("/", "layout");
}
export async function setLanguage(lang: string) {
  if (!isLang(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: YEAR, sameSite: "lax" });
  revalidatePath("/", "layout");
}
