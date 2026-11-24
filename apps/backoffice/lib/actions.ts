import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import type { ZodError } from "zod";

export type ActionState = { error?: string; ok?: boolean; at?: number; copied?: number } | undefined;

export const ok = (): ActionState => ({ ok: true, at: Date.now() });

/** Turns database / validation errors into short messages for the owner. */
export function fail(e: PostgrestError | ZodError | Error | string): ActionState {
  if (typeof e === "string") return { error: e };
  if ("issues" in e) return { error: e.issues[0]?.message ?? "Please check the form." };
  const code = (e as PostgrestError).code;
  if (code === "23505") return { error: "That name is already used here. Pick another one." };
  // Our own refusals explain themselves ("You can only give roles below your own"); RLS ones don't.
  if (code === "42501") return { error: /^(not allowed|permission denied|new row violates)/i.test(e.message) ? "You don't have permission to change this." : e.message };
  if (code === "23503") return { error: "This is still used elsewhere, or refers to something that no longer exists." };
  return { error: e.message };
}

export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const bool = (f: FormData, k: string) => f.get(k) === "on";
export const int = (f: FormData, k: string) => {
  const v = str(f, k);
  return v === "" ? null : Number.parseInt(v, 10);
};
