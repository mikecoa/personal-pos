"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Right-hand slide-over editor, opened by URL (?edit=… / ?new=1). Slides in, closes on Escape,
 * the ✕ or a click outside, and keeps the page behind it from scrolling.
 */
export function Panel({ title, closeHref, children }: { title: string; closeHref: string; children: ReactNode }) {
  const router = useRouter();
  // A different row (or New) starts a fresh form, even though the panel itself stays open.
  const formKey = useSearchParams().toString();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Let open dropdowns / dialogs handle their own Escape first.
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector('[role="listbox"],[role="alertdialog"],[role="dialog"][aria-label="Choose dates"]')) return;
      router.replace(closeHref, { scroll: false });
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [closeHref, router]);

  // Rendered into <body> so no animated parent can change where it sits.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end">
      <Link href={closeHref} aria-label="Close" className="anim-fade absolute inset-0 bg-ink/25 backdrop-blur-[2px]" scroll={false} replace />
      <aside className="anim-slide relative flex h-full w-full max-w-xl flex-col bg-surface shadow-[-12px_0_40px_-12px_rgba(1,33,51,0.25)]" role="dialog" aria-modal aria-label={title}>
        <header className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <h2 className="truncate text-lg font-semibold">{title}</h2>
          <Link href={closeHref} scroll={false} replace aria-label="Close"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-2 transition hover:bg-surface-2 hover:text-ink">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </Link>
        </header>
        <div key={formKey} className="min-h-0 flex-1 overflow-y-auto px-6 pt-6">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
