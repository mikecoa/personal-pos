import Link from "next/link";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

export { Select, Checkbox } from "./controls";
export { Panel } from "./panel";
export { RowLink } from "./row-link";

export const inputCls =
  "h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-[15px] text-ink outline-none transition placeholder:text-ink-2/55 " +
  "hover:border-ink-2/40 focus:border-accent focus:ring-3 focus:ring-accent/15 disabled:opacity-60 " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:ring-3 aria-[invalid=true]:ring-danger/15";

/**
 * Text field. `type="number"` renders a plain text box with a number keyboard (no browser spinner);
 * min / max are checked by our own form validation.
 */
export function Field({ label, hint, type, min, max, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const num = type === "number";
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <input
        autoComplete="off"
        {...props}
        type={num ? "text" : type}
        {...(num ? { inputMode: "numeric" as const, "data-number": "", "data-min": min, "data-max": max } : { min, max })}
        className={inputCls}
      />
      {hint && <span className="mt-1 block text-xs text-ink-2">{hint}</span>}
    </label>
  );
}

export function TextArea({ label, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <textarea {...props} className={`${inputCls} h-auto min-h-20 py-2.5`} />
    </label>
  );
}

/** Switch inside a form; submits "on" when checked like a checkbox. */
export function Toggle({ label, description, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-sm text-ink-2">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" {...props} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-ink-2/25 transition-colors duration-200 peer-checked:bg-accent peer-focus-visible:ring-3 peer-focus-visible:ring-accent/25 peer-disabled:opacity-50" />
        <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
const btn: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink shadow-sm hover:brightness-110",
  secondary: "border border-line bg-surface hover:bg-surface-2",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
  ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
};
const btnBase = "inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition duration-150 active:scale-[0.98]";

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button {...props} className={`${btnBase} disabled:pointer-events-none disabled:opacity-50 ${btn[variant]} ${className}`} />;
}

export function ButtonLink({ href, variant = "primary", className = "", children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return <Link href={href} scroll={false} className={`${btnBase} ${btn[variant]} ${className}`}>{children}</Link>;
}

export { ErrorNote } from "./error-note";

export function SavedNote({ show, children = "Saved" }: { show?: boolean; children?: ReactNode }) {
  if (!show) return null;
  return <p role="status" className="anim-fade text-sm font-medium text-accent">{children}</p>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight tracking-[-0.015em] sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[15px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, description, children, className = "" }: { title?: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`anim-rise min-w-0 rounded-2xl border border-line bg-surface p-6 ${className}`}>
      {title && <h2 className="text-[17px] font-semibold">{title}</h2>}
      {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
      <div className={title || description ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "danger" }) {
  const t = { neutral: "bg-surface-2 text-ink-2", accent: "bg-accent-soft text-accent", danger: "bg-danger/10 text-danger" }[tone];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${t}`}>{children}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="anim-rise rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-surface-2 text-ink-2" aria-hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13l2.5-7h11L20 13M4 13v5h16v-5M4 13h5l1 2h4l1-2h5" /></svg>
      </span>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-2">{children}</div>}
    </div>
  );
}

/**
 * List table. With `rows="link"` the last column is left for the row chevron (use <RowLink> rows,
 * which open the editor wherever the row is clicked).
 */
export function Table({ head, children, rows }: { head: ReactNode[]; children: ReactNode; rows?: "link" }) {
  const cols = head.length + (rows ? 1 : 0);
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className={`w-full text-left text-sm ${cols >= 5 ? "min-w-[640px]" : cols === 4 ? "min-w-[520px]" : ""}`}>
        <thead className="border-b border-line text-xs font-semibold text-ink-2">
          <tr>
            {head.map((h, i) => <th key={i} className="px-4 py-3 font-semibold">{h}</th>)}
            {rows && <th className="w-10" aria-hidden />}
          </tr>
        </thead>
        <tbody className="anim-rows divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
