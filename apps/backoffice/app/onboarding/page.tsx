import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./form";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { count } = await supabase.from("members").select("*", { count: "exact", head: true }).eq("user_id", user.id);
  if (count) redirect("/"); // already belongs to a business
  // Staff whose employee slot has this email (and a role with backoffice access) join that business.
  const { data: joined } = await supabase.rpc("claim_employee_access");
  if (joined) redirect("/");
  return <OnboardingForm />;
}
