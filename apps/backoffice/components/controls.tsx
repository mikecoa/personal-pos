"use client";
/**
 * Our own form controls, so the backoffice never shows the browser's built-in pickers, checkboxes,
 * pop-up dialogs or validation bubbles. Each one still submits through a normal (hidden or visually
 * hidden) input, so server actions read FormData exactly as before.
 */
import {
  createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState,
  type InputHTMLAttributes, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { dateLocale, isLang, translate } from "@/lib/i18n";
import { useLang, useT } from "./lang";

/** Translator outside React (form checks): reads the page language from <html lang>. */
const docT = (en: string, vars?: Record<string, string | number>) => {
  const l = typeof document !== "undefined" ? document.documentElement.lang : "en";
  return translate(isLang(l) ? l : "en", en, vars);
};

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ───────────────────────── Icons ───────────────────────── */

export const Chevron = ({ className = "" }: { className?: string }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
const Check = ({ className = "" }: { className?: string }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

/* ───────────────────────── Popover position ───────────────────────── */

/** Places a floating list under (or above) its button, in a portal so panels can't clip it. */
/** `exact`: the pop-over is a fixed size (a calendar) — keep it whole on screen rather than shrinking it. */
function usePopover(open: boolean, anchor: React.RefObject<HTMLElement | null>, height = 288, exact = false) {
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number } | null>(null);
  const place = useCallback(() => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const vh = window.innerHeight;
    const below = vh - r.bottom - 12;
    const above = r.top - 12;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 220) - 8));
    // Below if it fits, else above if it fits, else wherever there's more room (lists scroll inside).
    if (below >= height || (below >= 160 && below >= above)) setPos({ left, width: r.width, top: r.bottom + 6, maxHeight: Math.min(height, below) });
    else if (above >= height) setPos({ left, width: r.width, bottom: vh - r.top + 6, maxHeight: height });
    else if (exact) setPos({ left, width: r.width, top: Math.max(8, vh - height - 8), maxHeight: vh - 16 });
    else if (above > below) setPos({ left, width: r.width, bottom: vh - r.top + 6, maxHeight: above });
    else setPos({ left, width: r.width, top: r.bottom + 6, maxHeight: below });
  }, [anchor, height, exact]);
  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open, place]);
  return pos;
}

function useOutside(open: boolean, refs: React.RefObject<HTMLElement | null>[], close: () => void) {
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!refs.some((r) => r.current?.contains(e.target as Node))) close(); };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open, refs, close]);
}

/* ───────────────────────── Select ───────────────────────── */

export type Option = { value: string; label: string; hint?: string };

/**
 * Dropdown list. Uncontrolled with `name` + `defaultValue` (submits through a hidden input) or
 * controlled with `value` + `onChange`. Keyboard: arrows, Home/End, Enter, Escape, type to jump.
 */
export function Select({
  label, name, options, value, defaultValue, onChange, ariaLabel, size = "md", className = "", disabled, hint,
}: {
  label?: string; name?: string; options: Option[]; value?: string; defaultValue?: string; onChange?: (v: string) => void;
  ariaLabel?: string; size?: "sm" | "md"; className?: string; disabled?: boolean; hint?: string;
}) {
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value ?? "");
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const pos = usePopover(open, btn);
  const typed = useRef({ text: "", at: 0 });
  const t = useT();
  const close = useCallback(() => setOpen(false), []);
  useOutside(open, [btn, list], close);

  const chosen = options.find((o) => o.value === current);
  const openList = () => { setActive(Math.max(0, options.findIndex((o) => o.value === current))); setOpen(true); };
  const pick = (i: number) => {
    const o = options[i]; if (!o) return;
    if (value === undefined) setInner(o.value);
    onChange?.(o.value);
    setOpen(false);
    btn.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    // Escape closes the list (not the panel behind it), wherever focus is.
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    document.addEventListener("keydown", k, true);
    return () => document.removeEventListener("keydown", k, true);
  }, [open]);
  useEffect(() => { if (open && pos) list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [open, active, pos]);

  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(k)) { e.preventDefault(); openList(); }
      return;
    }
    if (k === "Escape") { e.preventDefault(); setOpen(false); }
    else if (k === "Tab") setOpen(false);
    else if (k === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (k === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (k === "Home") { e.preventDefault(); setActive(0); }
    else if (k === "End") { e.preventDefault(); setActive(options.length - 1); }
    else if (k === "Enter" || k === " ") { e.preventDefault(); pick(active); }
    else if (k.length === 1) {
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + k.toLowerCase(), at: now };
      const i = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
      if (i >= 0) setActive(i);
    }
  };

  const h = size === "sm" ? "h-9 text-sm" : "h-11 text-[15px]";
  const control = (
    <>
      {name && <input type="hidden" name={name} value={current} />}
      <button
        ref={btn} type="button" disabled={disabled} onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKey}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={ariaLabel ?? label}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        className={cx("flex w-full items-center justify-between gap-2 rounded-lg border bg-surface px-3.5 text-left text-ink outline-none transition",
          "hover:border-ink-2/40 focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/15 disabled:opacity-60",
          open ? "border-accent ring-3 ring-accent/15" : "border-line", h, className)}
      >
        <span className="truncate">{chosen?.label ?? t("Choose…")}</span>
        <Chevron className={cx("shrink-0 text-ink-2 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && pos && createPortal(
        <ul
          ref={list} id={id} role="listbox" aria-label={ariaLabel ?? label}
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, minWidth: Math.max(pos.width, 200), maxHeight: pos.maxHeight }}
          className={cx("anim-pop fixed z-[70] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-[0_12px_32px_-8px_rgb(var(--shadow)/0.28)]",
            pos.bottom !== undefined && "origin-bottom")}
        >
          {options.map((o, i) => {
            const sel = o.value === current;
            return (
              <li
                key={o.value} id={`${id}-${i}`} data-i={i} role="option" aria-selected={sel}
                onPointerEnter={() => setActive(i)} onClick={() => pick(i)}
                className={cx("flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-[15px] transition-colors",
                  i === active ? "bg-surface-2" : "", sel && "font-semibold text-accent")}
              >
                <span className="min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && <span className="block truncate text-xs font-normal text-ink-2">{o.hint}</span>}
                </span>
                {sel && <Check className="shrink-0" />}
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </>
  );
  if (!label) return <div className="relative">{control}</div>;
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {control}
      {hint && <span className="mt-1 block text-xs text-ink-2">{hint}</span>}
    </div>
  );
}

/* ───────────────────────── Search picker ───────────────────────── */

export type PickOption = { value: string; label: string; group?: string };

/**
 * A button that opens a searchable, grouped list and reports the picked value (it keeps no value
 * itself), e.g. "+ Add an item…". Keyboard: type to search, arrows, Enter, Escape.
 */
export function SearchPicker({ placeholder, options, onPick, ariaLabel, emptyText }: {
  placeholder: string; options: PickOption[]; onPick: (value: string) => void; ariaLabel?: string; emptyText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();
  const pos = usePopover(open, btn, 340);
  const t = useT();
  const close = useCallback(() => { setOpen(false); setQ(""); }, []);
  useOutside(open, [btn, box], close);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = options.filter((o) => words.every((w) => `${o.label} ${o.group ?? ""}`.toLowerCase().includes(w)));
  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { if (open && pos) box.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [open, active, pos]);
  const pick = (i: number) => { const o = shown[i]; if (!o) return; onPick(o.value); close(); btn.current?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); btn.current?.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); pick(active); }
  };
  let lastGroup: string | undefined;
  return (
    <div className="relative">
      <button ref={btn} type="button" onClick={() => (open ? close() : setOpen(true))} aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel ?? placeholder}
        className={cx("flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-dashed bg-surface px-3 text-left text-sm text-ink-2 outline-none transition",
          "hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/15", open ? "border-accent" : "border-line")}>
        <span className="truncate">{placeholder}</span>
        <Chevron className={cx("shrink-0 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && pos && createPortal(
        <div ref={box} onKeyDown={onKey}
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom, width: Math.max(pos.width, 260), maxHeight: pos.maxHeight }}
          className={cx("anim-pop fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[0_12px_32px_-8px_rgb(var(--shadow)/0.28)]",
            pos.bottom !== undefined && "origin-bottom")}>
          <div className="border-b border-line p-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search…")} aria-label={t("Search")}
              aria-controls={id} aria-activedescendant={shown.length ? `${id}-${active}` : undefined}
              className="h-9 w-full rounded-lg bg-surface-2 px-3 text-sm text-ink outline-none placeholder:text-ink-2/70 focus:ring-2 focus:ring-accent/25" />
          </div>
          <ul id={id} role="listbox" aria-label={ariaLabel ?? placeholder} className="min-h-0 flex-1 overflow-y-auto p-1">
            {shown.length === 0 && <li className="px-3 py-3 text-sm text-ink-2">{emptyText ?? t("Nothing matches")}</li>}
            {shown.map((o, i) => {
              const head = o.group && o.group !== lastGroup ? o.group : null;
              lastGroup = o.group;
              return (
                <li key={o.value} role="presentation">
                  {head && <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold tracking-[0.04em] text-ink-2/80">{head}</p>}
                  <div id={`${id}-${i}`} data-i={i} role="option" aria-selected={i === active}
                    onPointerEnter={() => setActive(i)} onClick={() => pick(i)}
                    className={cx("cursor-pointer truncate rounded-lg px-3 py-2 text-[15px] transition-colors", i === active && "bg-surface-2")}>
                    {o.label}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ───────────────────────── Tooltip ───────────────────────── */

/** Small label shown on hover or keyboard focus (instead of the browser's `title` bubble). */
export function Tip({ label, children, side = "top", className = "" }: { label: string; children: ReactNode; side?: "top" | "bottom" | "left" | "right"; className?: string }) {
  const place = {
    top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
    bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
    left: "right-full top-1/2 mr-2 -translate-y-1/2",
    right: "left-full top-1/2 ml-2 -translate-y-1/2",
  }[side];
  return (
    <span className={cx("group/tip relative inline-flex", className)}>
      {children}
      <span role="tooltip"
        className={cx("pointer-events-none absolute z-[80] whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-bg opacity-0 shadow-md transition-opacity duration-150",
          "group-hover/tip:opacity-100 group-hover/tip:delay-300 group-focus-within/tip:opacity-100", place)}>
        {label}
      </span>
    </span>
  );
}

/* ───────────────────────── Checkbox ───────────────────────── */

/** Checkbox with our own box and tick. The real input is visually hidden and still submits. */
export function Checkbox({
  label, description, indeterminate, className = "", ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { label?: ReactNode; description?: ReactNode; indeterminate?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  const box = (
    <span className="relative inline-flex shrink-0">
      <input ref={ref} type="checkbox" {...props} className="peer sr-only" />
      <span className={cx(
        "grid h-[18px] w-[18px] place-items-center rounded-[5px] border-[1.5px] border-ink-2/45 bg-surface text-accent-ink transition duration-150",
        "peer-hover:border-ink-2/70 peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:ring-3 peer-focus-visible:ring-accent/20",
        "peer-disabled:opacity-50 peer-checked:[&>svg]:scale-100 peer-checked:[&>svg]:opacity-100",
        indeterminate && "!border-accent !bg-accent",
      )}>
        {indeterminate
          ? <span className="h-0.5 w-2 rounded bg-accent-ink" />
          : <Check className="scale-50 opacity-0 transition duration-150" />}
      </span>
    </span>
  );
  if (!label) return <label className={cx("inline-flex cursor-pointer p-1", className)} onClick={(e) => e.stopPropagation()}>{box}</label>;
  return (
    <label className={cx("flex cursor-pointer items-start gap-3", className)}>
      <span className="mt-[3px]">{box}</span>
      <span className="min-w-0">
        <span className="block">{label}</span>
        {description && <span className="block text-xs text-ink-2">{description}</span>}
      </span>
    </label>
  );
}

/* ───────────────────────── Switch ───────────────────────── */

/** On/off switch button (no form input). Use <Toggle> in ui.tsx for a switch inside a form. */
export function Switch({ checked, onChange, label, disabled, size = "md" }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; size?: "sm" | "md";
}) {
  const s = size === "sm" ? { track: "h-5 w-9", thumb: "h-4 w-4", move: "translate-x-4" } : { track: "h-6 w-11", thumb: "h-5 w-5", move: "translate-x-5" };
  return (
    <button
      type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={cx("relative inline-flex shrink-0 items-center rounded-full p-0.5 outline-none transition-colors duration-200",
        "focus-visible:ring-3 focus-visible:ring-accent/25 disabled:opacity-60", s.track, checked ? "bg-accent" : "bg-ink-2/25")}
    >
      <span className={cx("rounded-full bg-white shadow-sm transition-transform duration-200 ease-out", s.thumb, checked && s.move)} />
    </button>
  );
}

/* ───────────────────────── Toasts ───────────────────────── */

type Toast = { id: number; text: string; tone: "ok" | "error" };
let push: ((t: Omit<Toast, "id">) => void) | null = null;
/** Small message in the bottom corner, e.g. "Saved". */
export const toast = (text: string, tone: Toast["tone"] = "ok") => push?.({ text, tone });

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  const tt = useT();
  useEffect(() => {
    let n = 0;
    push = (t) => {
      const id = ++n;
      setItems((x) => [...x.slice(-2), { ...t, id }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), t.tone === "error" ? 5000 : 2400);
    };
    return () => { push = null; };
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} role={t.tone === "error" ? "alert" : "status"}
          className={cx("anim-toast pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg",
            t.tone === "error" ? "bg-danger text-white" : "bg-ink text-bg")}>
          {t.tone === "ok" && <Check className="text-[#8fd3ae]" />}
          {tt(t.text)}
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Confirm dialog ───────────────────────── */

type ConfirmOpts = { title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
/** `const confirm = useConfirm(); if (await confirm({ title })) …` — our dialog instead of window.confirm. */
export const useConfirm = () => useContext(ConfirmCtx);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const t = useT();
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setReq({ ...o, resolve })), []);
  const done = (v: boolean) => { req?.resolve(v); setReq(null); };
  useEffect(() => {
    if (!req) return;
    cancelRef.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); req.resolve(false); setReq(null); } };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [req]);
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      {req && createPortal(
        <div className="fixed inset-0 z-[90] grid place-items-center p-4">
          <div className="anim-fade absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => done(false)} />
          <div role="alertdialog" aria-modal aria-labelledby="confirm-title"
            className="anim-dialog relative w-full max-w-sm rounded-2xl bg-surface p-6 shadow-2xl">
            <h2 id="confirm-title" className="text-lg font-semibold">{req.title}</h2>
            {req.body && <div className="mt-1.5 text-[15px] text-ink-2">{req.body}</div>}
            <div className="mt-6 flex justify-end gap-2">
              <button ref={cancelRef} type="button" onClick={() => done(false)}
                className="h-10 rounded-lg border border-line px-4 text-sm font-semibold transition hover:bg-surface-2 active:scale-[0.98]">{t("Cancel")}</button>
              <button type="button" onClick={() => done(true)}
                className={cx("h-10 rounded-lg px-4 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98]",
                  req.danger ? "bg-danger" : "bg-accent !text-accent-ink")}>{req.confirmLabel ?? t("Confirm")}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </ConfirmCtx.Provider>
  );
}

/* ───────────────────────── Form validation ───────────────────────── */

type Field = HTMLInputElement | HTMLTextAreaElement;
const fieldName = (el: Field) =>
  el.getAttribute("aria-label") ?? el.closest("label")?.querySelector("span")?.textContent?.trim() ?? docT("This field");

/**
 * Checks a form ourselves (forms use noValidate, so the browser shows no bubbles). Marks bad
 * fields with aria-invalid (red border), focuses the first one and returns a message, or null.
 */
export function checkForm(form: HTMLFormElement): string | null {
  let first: Field | null = null;
  let message: string | null = null;
  for (const el of Array.from(form.elements) as Field[]) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || el.type === "hidden" || el.disabled) continue;
    const v = el.value.trim();
    const name = fieldName(el);
    let err: string | null = null;
    if (el.required && !v && !(el instanceof HTMLInputElement && el.type === "checkbox")) err = docT("{name} is required.", { name });
    else if (v && el.validity.typeMismatch && el.type === "email") err = `${name}: ${docT("enter a valid email address.")}`;
    else if (v && el.validity.patternMismatch) err = `${name}: ${el.title || docT("check the format.")}`;
    else if (v && el.validity.tooShort) err = `${name}: ${docT("use at least {n} characters.", { n: (el as HTMLInputElement).minLength })}`;
    else if (v && el.dataset.number !== undefined) {
      const n = Number(v);
      if (!Number.isFinite(n)) err = `${name}: ${docT("enter a number.")}`;
      else if (el.dataset.min !== undefined && n < Number(el.dataset.min)) err = `${name}: ${docT("must be {n} or more.", { n: el.dataset.min })}`;
      else if (el.dataset.max !== undefined && n > Number(el.dataset.max)) err = `${name}: ${docT("must be {n} or less.", { n: el.dataset.max })}`;
    }
    if (err) {
      el.setAttribute("aria-invalid", "true");
      el.addEventListener("input", () => el.removeAttribute("aria-invalid"), { once: true });
      if (!first) { first = el; message = err; }
    } else el.removeAttribute("aria-invalid");
  }
  first?.focus();
  return message;
}

/* ───────────────────────── Disclosure ───────────────────────── */

export function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 text-sm">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs font-medium text-ink-2 transition hover:text-ink">
        <Chevron className={cx("transition-transform duration-200", open ? "rotate-0" : "-rotate-90")} />{summary}
      </button>
      {open && <div className="anim-fade">{children}</div>}
    </div>
  );
}

/* ───────────────────────── Date range picker ───────────────────────── */

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y!, (m ?? 1) - 1, d ?? 1); };
const niceIn = (loc: string) => (s: string) => parse(s).toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" });

/** Calendar pop-over: tap a start day, then an end day, then Apply. */
export function DateRangePicker({ from, to, onApply, max }: { from: string; to: string; onApply: (from: string, to: string) => void; max?: string }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  const loc = dateLocale(useLang());
  const nice = niceIn(loc);
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState<string | null>(to);
  const [month, setMonth] = useState(() => { const d = parse(to); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const pos = usePopover(open, btn, 372, true);
  const close = useCallback(() => setOpen(false), []);
  useOutside(open, [btn, pop], close);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false); document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [open]);

  const show = () => { setStart(from); setEnd(to); const d = parse(to); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setOpen(true); };
  const tap = (day: string) => {
    if (!end) { if (day < start) { setEnd(start); setStart(day); } else setEnd(day); }
    else { setStart(day); setEnd(null); }
  };
  const lead = (month.getDay() + 6) % 7; // weeks start on Monday
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => iso(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const today = iso(new Date());

  return (
    <>
      <button ref={btn} type="button" onClick={() => (open ? setOpen(false) : show())} aria-expanded={open} aria-haspopup="dialog"
        className={cx("inline-flex h-9 items-center gap-2 rounded-full border bg-surface px-3.5 text-sm font-medium transition hover:bg-surface-2",
          open ? "border-accent" : "border-line")}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="text-ink-2">
          <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
        {nice(from)} – {nice(to)}
      </button>
      {open && pos && createPortal(
        <div ref={pop} role="dialog" data-popover aria-label={t("Choose dates")} style={{ left: pos.left, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
          className="anim-pop fixed z-[70] w-[300px] overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-[0_12px_32px_-8px_rgb(var(--shadow)/0.28)]">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={() => shift(-1)} aria-label={t("Previous month")} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2"><Chevron className="rotate-90" /></button>
            <p className="text-sm font-semibold">{month.toLocaleDateString(loc, { month: "long", year: "numeric" })}</p>
            <button type="button" onClick={() => shift(1)} aria-label={t("Next month")} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-2"><Chevron className="-rotate-90" /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-ink-2">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => <span key={i} className="py-1">{new Date(2024, 0, 1 + i).toLocaleDateString(loc, { weekday: "short" }).slice(0, 2)}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5 text-sm">
            {cells.map((d, i) => {
              if (!d) return <span key={`e${i}`} />;
              const hi = end ?? start;
              const inRange = d >= start && d <= hi;
              const edge = d === start || d === end;
              const off = !!max && d > max;
              return (
                <button key={d} type="button" disabled={off} onClick={() => tap(d)} aria-pressed={edge}
                  className={cx("h-9 tabular-nums transition-colors disabled:opacity-30",
                    inRange && !edge && "bg-accent-soft text-accent",
                    edge ? "rounded-lg bg-accent font-semibold text-accent-ink" : "rounded-lg hover:bg-surface-2",
                    d === today && !edge && "font-bold")}>
                  {Number(d.slice(8))}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
            <p className="text-xs text-ink-2">{end ? `${nice(start)} – ${nice(end)}` : t("Now tap the last day")}</p>
            <button type="button" disabled={!end} onClick={() => { if (end) { onApply(start, end); setOpen(false); } }}
              className="h-8 rounded-lg bg-accent px-3 text-sm font-semibold text-accent-ink transition hover:brightness-110 disabled:opacity-40">{t("Apply")}</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
