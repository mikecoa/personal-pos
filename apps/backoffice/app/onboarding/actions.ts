"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createBusiness(_prev: { error?: string } | undefined, form: FormData) {
  const name = String(form.get("business") ?? "").trim();
  const location = String(form.get("location") ?? "").trim();
  if (!name || !location) return { error: "Both names are required." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { count } = await supabase.from("members").select("*", { count: "exact", head: true }).eq("user_id", user.id);
  if (count) redirect("/");

  const { error } = await supabase.rpc("create_account", { p_name: name, p_first_location: location });
  if (error) return { error: error.message };
  redirect("/");
}
