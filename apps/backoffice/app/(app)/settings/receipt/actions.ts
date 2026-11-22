"use server";
import { revalidatePath } from "next/cache";
import { requireManage } from "@/lib/session";
import { receiptLinks } from "@pos/core";
import { bool, fail, ok, str, type ActionState } from "@/lib/actions";

const okLogo = (v: string) => v.length <= 300_000 && /^data:image\/(png|jpeg|webp);base64,/.test(v);

export async function saveReceipt(_: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, location, isOwner } = await requireManage();
  const header = str(form, "header_name");
  if (!header) return fail("Business name on receipt is required");
  // People paste full profile links; keep just the handle for Instagram and TikTok.
  const handle = (v: string, site: RegExp) => v.replace(site, "").replace(/[/?#].*$/, "").replace(/^@/, "").slice(0, 80) || null;
  const links = {
    instagram: handle(str(form, "instagram"), /^(https?:\/\/)?(www\.)?instagram\.com\//i),
    tiktok: handle(str(form, "tiktok"), /^(https?:\/\/)?(www\.)?tiktok\.com\//i),
    website: str(form, "website").replace(/^https?:\/\//i, "").replace(/\/$/, "").slice(0, 80) || null,
  };
  const { error } = await supabase.from("receipt_profiles").update({
    header_name: header.slice(0, 60),
    address: str(form, "address").slice(0, 200) || null,
    phone: str(form, "phone").slice(0, 40) || null,
    instagram: links.instagram,
    website: links.website,
    tiktok: links.tiktok,
    // Older tablet app versions print this single line; keep it in step with the three links.
    social: receiptLinks({ header_name: header, ...links }).join(" · ").slice(0, 200) || null,
    footer: str(form, "footer").slice(0, 200) || null,
    show_server: bool(form, "show_server"),
    show_cashier: bool(form, "show_cashier"),
  }).eq("location_id", location.id);
  if (error) return fail(error);

  // A receipt-only logo, or none (= use the location's logo).
  const receiptLogo = str(form, "logo_mode") === "own" ? str(form, "receipt_logo") || null : null;
  if (receiptLogo && !okLogo(receiptLogo)) return fail("That logo can't be used. Try a PNG, JPG or WebP image.");
  if (str(form, "logo_mode") === "own" && !receiptLogo) return fail("Upload the receipt logo, or choose “Same as location”.");
  const { error: rlError } = await supabase.from("receipt_profiles").update({ logo: receiptLogo }).eq("location_id", location.id);
  if (rlError) return fail(rlError);

  // The location logo lives on the location (the tablets show it too); only the owner may change it.
  if (form.has("logo") && isOwner) {
    const logo = str(form, "logo") || null;
    if (logo && !okLogo(logo)) return fail("That logo can't be used. Try a PNG, JPG or WebP image.");
    const { error: logoError } = await supabase.from("locations").update({ logo }).eq("id", location.id);
    if (logoError) return fail(logoError);
    revalidatePath("/", "layout");
  }
  revalidatePath("/settings/receipt");
  return ok();
}
