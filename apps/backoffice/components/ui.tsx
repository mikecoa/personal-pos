import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const inputCls =
  "h-11 w-full rounded-lg border border-line bg-surface px-3.5 text-[15px] text-ink outline-none transition placeholder:text-ink-2/55 hover:border-ink-2/40 focus:border-accent focus:ring-3 focus:ring-accent/15 disabled:opacity-60";

export function Field({ label, hint, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <input {...props} className={inputCls} />
      {hint && <span className="mt-1 block text-xs text-ink-2">{hint}</span>}
    </label>
  );
}

export function TextArea({ label, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-2">{label}</span>
      <textarea {...props} className={`${inputCls} h-auto min-h-20 py-2`} />
    </label>
  );
}

export function Select({ label, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-2">{label}</span>
      <select {...props} className={`${inputCls} pr-8`}>{children}</select>
    </label>
  );
}

/** Checkbox styled as a switch; submits "on" when checked like a normal checkbox. */
export function Toggle({ label, description, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-2">
      <span>
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-sm text-ink-2">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" {...props} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-line transition peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 peer-disabled:opacity-50" />
        <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
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

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50 ${btn[variant]} ${className}`}
    />
  );
}

export function ButtonLink({ href, variant = "primary", className = "", children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition ${btn[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function ErrorNote({ message }: { message?: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{message}</p>;
}

export function SavedNote({ show, children = "Saved" }: { show?: boolean; children?: ReactNode }) {
  if (!show) return null;
  return <p role="status" className="text-sm font-medium text-accent">{children}</p>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold leading-tight tracking-[-0.01em] sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, description, children, className = "" }: { title?: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-xl border border-line bg-surface p-6 shadow-[0_1px_2px_rgba(1,33,51,0.04)] ${className}`}>
      {title && <h2 className="text-[17px] font-semibold">{title}</h2>}
      {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
      <div className={title || description ? "mt-4" : ""}>{children}</div>
    </section>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "danger" }) {
  const t = { neutral: "bg-surface-2 text-ink-2", accent: "bg-accent-soft text-accent", danger: "bg-danger/10 text-danger" }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${t}`}>{children}</span>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface-2/50 px-6 py-14 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-2">{children}</div>}
    </div>
  );
}

/** Right-hand slide-over editor, opened by URL (?edit=… / ?new=1) so it works without client state. */
export function Panel({ title, closeHref, children }: { title: string; closeHref: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <Link href={closeHref} aria-label="Close" className="absolute inset-0 bg-ink/30 backdrop-blur-[1px]" scroll={false} />
      <aside className="relative flex h-full w-full max-w-xl flex-col bg-surface shadow-2xl" role="dialog" aria-label={title}>
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Link href={closeHref} scroll={false} className="rounded-lg px-2 py-1 text-ink-2 hover:bg-surface-2" aria-label="Close">✕</Link>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
      </aside>
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(1,33,51,0.04)]">
      <table className={`w-full text-left text-sm ${head.length >= 5 ? "min-w-[640px]" : head.length === 4 ? "min-w-[520px]" : ""}`}>
        <thead className="border-b border-line bg-surface-2 text-[13px] font-semibold text-ink">
          <tr>{head.map((h, i) => <th key={i} className="px-4 py-3.5">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
