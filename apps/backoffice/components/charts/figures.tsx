import type { ReactNode } from "react";
import { getT } from "@/lib/prefs";
import { CountUp } from "./count-up";

/** Headline number with change vs the previous period (arrow + text, never colour alone). */
export async function KpiTile({ label, value, current, previous, invert, hint, money }: {
  label: string; value: string; current: number; previous: number; invert?: boolean; hint?: string; money?: boolean;
}) {
  const t = await getT();
  const change = previous === 0 ? null : (current - previous) / previous;
  const good = change === null ? null : invert ? change < 0 : change > 0;
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-3.5 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgb(var(--shadow)/0.25)] sm:p-4">
      <p className="text-sm text-ink-2">{label}</p>
      <p className="mt-1 whitespace-nowrap text-[clamp(1.05rem,4.6vw,1.5rem)] font-bold tracking-tight tabular-nums"><CountUp to={current} text={value} money={money} /></p>
      <p className={`mt-1 text-xs font-medium ${change === null || Math.abs(change) < 0.005 ? "text-ink-2" : good ? "text-accent" : "text-danger"}`}>
        {change === null ? (hint ?? t("No earlier data")) : Math.abs(change) < 0.005 ? t("No change vs previous period")
          : `${change > 0 ? "▲" : "▼"} ${t("{pct}% vs previous period", { pct: Math.abs(change * 100).toFixed(change > 9.995 ? 0 : 1) })}`}
      </p>
    </div>
  );
}

/** Ranked list with thin share bars (a figure, not a chart: one hue, values in text). */
export async function BarList({ rows, format, empty }: {
  rows: { label: ReactNode; value: number; sub?: string }[]; format: (n: number) => string; empty?: string;
}) {
  const t = await getT();
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!rows.length) return <p className="text-sm text-ink-2">{empty ?? t("No data")}</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r, i) => (
        <li key={i}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{r.label}</span>
            <span className="shrink-0 tabular-nums">
              {format(r.value)}<span className="ml-2 text-xs text-ink-2">{total ? Math.round((r.value / total) * 100) : 0}%</span>
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-surface-2"><div className="bar-fill h-2 rounded-full bg-series-1" style={{ width: `${(r.value / max) * 100}%`, animationDelay: `${Math.min(i * 40, 400)}ms` }} /></div>
          {r.sub && <p className="mt-0.5 text-xs text-ink-2">{r.sub}</p>}
        </li>
      ))}
    </ul>
  );
}
