"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function authenticate(_prev: { error?: string } | undefined, form: FormData) {
  const supabase = await createClient();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");

  if (form.get("mode") === "up") {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    redirect("/onboarding");
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Email or password is incorrect." };
  redirect("/");
}
