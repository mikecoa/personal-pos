"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/**
 * Side menu that stays put on laptops (lg and up) and becomes a slide-in drawer behind a top bar
 * with a Menu button on phones and tablets. The drawer closes when a page is picked.
 */
export function AppShell({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:hidden">
        <div className="min-w-0 flex-1">{brand}</div>
        <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="app-menu"
          className="flex h-10 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold hover:bg-surface-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          Menu
        </button>
      </header>
      {open && <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside id="app-menu" aria-label="Main menu"
        className={`fixed inset-y-0 left-0 z-50 flex w-[85vw] max-w-[300px] flex-col gap-5 overflow-y-auto border-r border-line bg-surface-2 px-4 py-5 shadow-xl transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-dvh lg:w-64 lg:max-w-none lg:shrink-0 lg:translate-x-0 lg:shadow-none ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between gap-2">
          {brand}
          <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-lg text-ink-2 hover:bg-surface lg:hidden" aria-label="Close menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
