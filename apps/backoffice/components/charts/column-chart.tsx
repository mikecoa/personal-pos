"use client";
import { useEffect, useRef, useState } from "react";
import { Disclosure } from "../controls";

type Datum = { label: string; value: number; detail?: string };

/** Single-series column chart: thin rounded columns, recessive grid, hover tooltip, table view. */
const FORMATS = {
  money: (n: number) => `Rp ${n.toLocaleString("id-ID")}`,
  count: (n: number) => n.toLocaleString("id-ID"),
};

export function ColumnChart({ data, kind = "money", title, height = 220, labelEvery }: {
  data: Datum[]; kind?: keyof typeof FORMATS; title: string; height?: number; labelEvery?: number;
}) {
  const format = FORMATS[kind];
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0); // measured from the container; nothing drawn until known
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e!.contentRect.width));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const pad = { l: 56, r: 8, t: 12, b: 26 };
  const iw = Math.max(10, w - pad.l - pad.r), ih = height - pad.t - pad.b;
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const band = iw / Math.max(1, data.length);
  const bw = Math.min(24, Math.max(4, band * 0.6));
  const y = (v: number) => pad.t + ih - (v / top) * ih;
  const every = labelEvery ?? Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(iw / 56))));
  const h = hover !== null ? data[hover] : null;

  return (
    <figure className="m-0 min-w-0">
      <div ref={ref} className="relative w-full min-w-0" style={{ minHeight: height }} onMouseLeave={() => setHover(null)}>
        {w > 0 && <svg width={w} height={height} role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${format(d.value)}`).join(", ")}`}>
          {Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
              <text x={pad.l - 8} y={y(v)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--ink-2)">{compact(v)}</text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.l + i * band + (band - bw) / 2;
            const yt = y(d.value), hgt = pad.t + ih - yt, r = Math.min(4, hgt);
            return (
              <g key={i}>
                {d.value > 0 && (
                  <path d={`M${x},${pad.t + ih} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + bw - r} Q${x + bw},${yt} ${x + bw},${yt + r} V${pad.t + ih} Z`}
                    fill="var(--series-1)" opacity={hover === null || hover === i ? 1 : 0.45} />
                )}
                {i % every === 0 && (
                  <text x={pad.l + i * band + band / 2} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--ink-2)">{d.label}</text>
                )}
                {/* hit target: the whole band, taller than the mark */}
                <rect x={pad.l + i * band} y={pad.t} width={band} height={ih} fill="transparent"
                  onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
              </g>
            );
          })}
          <line x1={pad.l} x2={w - pad.r} y1={pad.t + ih} y2={pad.t + ih} stroke="var(--line)" />
        </svg>}
        {h && hover !== null && (
          <div role="status" className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-2 text-sm shadow-lg"
            style={{ left: Math.min(w - 170, Math.max(0, pad.l + hover * band + band / 2 - 80)), top: Math.max(0, y(h.value) - 64) }}>
            <p className="text-xs text-ink-2">{h.label}</p>
            <p className="font-semibold tabular-nums">{format(h.value)}</p>
            {h.detail && <p className="text-xs text-ink-2">{h.detail}</p>}
          </div>
        )}
      </div>
      <Disclosure summary="Show as table">
        <table className="mt-2 w-full text-left text-sm">
          <tbody className="divide-y divide-line">
            {data.map((d) => <tr key={d.label}><td className="py-1 pr-4">{d.label}</td><td className="py-1 text-right tabular-nums">{format(d.value)}</td><td className="py-1 pl-4 text-ink-2">{d.detail}</td></tr>)}
          </tbody>
        </table>
      </Disclosure>
    </figure>
  );
}

function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
export function compact(n: number) {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}jt`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(0)}rb`;
  return String(n);
}
