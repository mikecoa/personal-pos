"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { GUIDES, SHOT_H, SHOT_W } from "@/lib/permission-guides";
import { useT } from "./lang";

/**
 * A small "?" next to a tablet permission. Opens a pop-up with what the permission does and a
 * screenshot from the tablet with the button(s) it controls outlined.
 */
export function PermissionGuide({ k }: { k: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const g = GUIDES[k];
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); } };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [open]);
  if (!g) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t("What is “{name}”?", { name: t(g.title) })}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line bg-surface text-xs font-bold text-ink-2 transition hover:border-accent hover:text-accent">
        ?
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[90] grid place-items-center bg-ink/40 p-4" onPointerDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div role="dialog" aria-modal aria-label={t(g.title)}
            className="anim-pop flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
              <div>
                <p className="text-xs font-semibold text-ink-2">{t("Tablet permission")}</p>
                <h2 className="text-lg font-bold">{t(g.title)}</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("Close")}
                className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-2 hover:text-ink">✕</button>
            </div>
            <div className="space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-accent-soft/60 p-3">
                  <p className="text-xs font-semibold text-accent">{t("With this permission")}</p>
                  <p className="mt-1 text-sm">{t(g.what)}</p>
                </div>
                <div className="rounded-xl bg-surface-2 p-3">
                  <p className="text-xs font-semibold text-ink-2">{t("Without it")}</p>
                  <p className="mt-1 text-sm">{t(g.without)}</p>
                </div>
              </div>
              {g.image && (
                <figure>
                  <div className="relative overflow-hidden rounded-xl border border-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/guides/${g.image}.jpg`} alt={t("The tablet screen where this is used")} className="block w-full" width={SHOT_W} height={SHOT_H} />
                    {g.boxes?.map(([x, y, w, h], i) => (
                      <span key={i} aria-hidden className="pointer-events-none absolute rounded-lg bg-danger/10 ring-[3px] ring-danger"
                        style={{ left: `${(x / SHOT_W) * 100}%`, top: `${(y / SHOT_H) * 100}%`, width: `${(w / SHOT_W) * 100}%`, height: `${(h / SHOT_H) * 100}%` }} />
                    ))}
                  </div>
                  <figcaption className="mt-2 text-xs text-ink-2">{t("On the tablet: the outlined part is what this permission controls.")}</figcaption>
                </figure>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
