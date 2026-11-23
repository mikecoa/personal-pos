"use client";
import { useT } from "./lang";

/** Inline form error. Messages from the server are written in English and shown in the reader's language. */
export function ErrorNote({ message }: { message?: string }) {
  const t = useT();
  if (!message) return null;
  return <p role="alert" className="anim-fade rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{t(message)}</p>;
}
