"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function authenticate(_prev: { error?: string; notice?: string } | undefined, form: FormData) {
  const supabase = await createClient();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");

  if (form.get("mode") === "up") {
    // The confirmation email links back to this site's sign-in page.
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/login` } });
    if (error) return { error: error.message };
    // With email confirmation on there is no session yet: the owner confirms first, then signs in.
    if (!data.session) return { notice: `We sent a confirmation link to ${email}. Open it, then sign in here.` };
    redirect("/onboarding");
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Email or password is incorrect." };
  redirect("/");
}
