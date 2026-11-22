"use client";
import { useRef, useState } from "react";

const MAX = 256;            // longest side, px
const LIMIT = 300_000;      // characters, matches the database check

/**
 * Makes the plain background transparent. Starting from the image's edges, near-white pixels that
 * touch the outside are cleared (a flood fill), so white parts *inside* the logo are kept. A thin
 * outline around the artwork (like a sticker's cutting line, a few px wide) is crossed once and the
 * white inside it cleared too. Leftover specks are removed and light pixels on the final boundary
 * fade out instead of leaving a halo.
 */
function clearBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const SOLID = 228, FADE = 180, THIN = 6;      // min(r,g,b) at or above SOLID counts as background
  const light = (p: number) => Math.min(d[p * 4]!, d[p * 4 + 1]!, d[p * 4 + 2]!);
  const bg = (p: number) => d[p * 4 + 3]! <= 16 || light(p) >= SOLID;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (p: number) => { if (!seen[p]) { seen[p] = 1; stack.push(p); } };
  let edge: number[] = [];
  const fill = () => {
    while (stack.length) {
      const p = stack.pop()!;
      if (!bg(p)) { edge.push(p); continue; }   // part of the logo: stop here
      d[p * 4 + 3] = 0;
      const x = p % w, y = (p - x) / w;
      if (x > 0) push(p - 1); if (x < w - 1) push(p + 1);
      if (y > 0) push(p - w); if (y < h - 1) push(p + w);
    }
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  fill();

  // Cross thin outlines once: from each boundary pixel walk inwards; if background-white shows up
  // again within THIN pixels, clear the line and keep filling on the other side.
  const first = edge; edge = [];
  const steps: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  for (const p of first) {
    if (d[p * 4 + 3] === 0) continue;
    const x0 = p % w, y0 = (p - x0) / w;
    for (const [dx, dy] of steps) {
      const bx = x0 - dx, by = y0 - dy;           // the cleared side must be behind us
      if (bx < 0 || by < 0 || bx >= w || by >= h || d[(by * w + bx) * 4 + 3] !== 0) continue;
      const line: number[] = [];
      let x = x0, y = y0, hit = -1;
      while (x >= 0 && y >= 0 && x < w && y < h && line.length <= THIN) {
        const q = y * w + x;
        if (bg(q)) { hit = q; break; }
        line.push(q); x += dx; y += dy;
      }
      if (hit >= 0 && line.length <= THIN) { for (const q of line) { d[q * 4 + 3] = 0; seen[q] = 1; } seen[hit] = 0; push(hit); }
    }
  }
  fill();
  // Drop leftover specks: tiny opaque islands (bits of a broken outline), far smaller than any letter.
  const label = new Int32Array(w * h).fill(-1);
  const minSize = Math.max(24, Math.round(w * h * 0.00012));
  for (let s0 = 0; s0 < w * h; s0++) {
    if (label[s0] !== -1 || d[s0 * 4 + 3] === 0) continue;
    const comp = [s0]; label[s0] = s0;
    for (let k = 0; k < comp.length; k++) {
      const q = comp[k]!, x = q % w, y = (q - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (label[n] === -1 && d[n * 4 + 3] !== 0) { label[n] = s0; comp.push(n); }
      }
    }
    if (comp.length < minSize) for (const q of comp) d[q * 4 + 3] = 0;
  }
  for (const p of [...first, ...edge]) {         // soften the outline against the cleared area
    if (d[p * 4 + 3] === 0) continue;
    const l = light(p);
    if (l > FADE) d[p * 4 + 3] = Math.round(d[p * 4 + 3]! * (SOLID - l) / (SOLID - FADE));
  }
  ctx.putImageData(img, 0, 0);
}

/** Crops away plain white / transparent margins so the logo fills its space. */
function contentBox(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const d = ctx.getImageData(0, 0, w, h).data;
  let top = h, left = w, right = -1, bottom = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const blank = d[i + 3]! < 16 || (d[i]! > 245 && d[i + 1]! > 245 && d[i + 2]! > 245);
    if (blank) continue;
    if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y;
  }
  if (right < 0) return { x: 0, y: 0, w, h };
  const pad = Math.round(Math.max(right - left, bottom - top) * 0.03);
  const x = Math.max(0, left - pad), y = Math.max(0, top - pad);
  return { x, y, w: Math.min(w, right + pad + 1) - x, h: Math.min(h, bottom + pad + 1) - y };
}

async function toLogo(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const full = document.createElement("canvas");
  full.width = img.width; full.height = img.height;
  const fctx = full.getContext("2d", { willReadFrequently: true })!;
  fctx.drawImage(img, 0, 0);
  clearBackground(fctx, img.width, img.height);
  const box = contentBox(fctx, img.width, img.height);
  const scale = Math.min(1, MAX / Math.max(box.w, box.h));
  const out = document.createElement("canvas");
  out.width = Math.round(box.w * scale); out.height = Math.round(box.h * scale);
  out.getContext("2d")!.drawImage(full, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);
  const png = out.toDataURL("image/png");
  return png.length <= LIMIT ? png : out.toDataURL("image/webp", 0.9);   // WebP keeps the transparency
}

/** Logo picker for a location: preview, replace, remove. Sends the resized image as `logo`. */
export function LogoInput({ initial, onChange, label = "Logo", hint, name = "logo" }: {
  initial: string | null; onChange?: (url: string) => void; label?: string; hint?: string; name?: string;
}) {
  const [logo, setLogoState] = useState(initial ?? "");
  const setLogo = (url: string) => { setLogoState(url); onChange?.(url); };
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const pick = async (f: File | undefined) => {
    setError(null);
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return setError("Use a PNG, JPG or WebP image.");
    try {
      const url = await toLogo(f);
      if (url.length > LIMIT) return setError("That image is too detailed. Try a simpler or smaller file.");
      setLogo(url);
    } catch { setError("Couldn't read that image."); }
  };

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <input type="hidden" name={name} value={logo} />
      <div className="flex items-center gap-4 rounded-xl border border-line bg-surface-2/50 p-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line"
          style={{ backgroundColor: "#fff", backgroundImage: "conic-gradient(#e9edf0 25%, transparent 0 50%, #e9edf0 0 75%, transparent 0)", backgroundSize: "14px 14px" }}>
          {logo ? <img src={logo} alt="Logo preview" className="h-full w-full object-contain p-1.5" />
            : <span className="text-xs text-ink-2">No logo</span>}
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => file.current?.click()}
              className="h-10 rounded-lg border border-line bg-surface px-4 text-sm font-semibold transition hover:bg-surface-2 active:scale-[0.98]">
              {logo ? "Replace" : "Upload logo"}
            </button>
            {logo && (
              <button type="button" onClick={() => setLogo("")} className="h-10 rounded-lg px-3 text-sm font-semibold text-danger hover:bg-surface-2">
                Remove
              </button>
            )}
          </div>
          <p className="text-sm text-ink-2">{hint ?? "Shown on the POS tablets."} PNG, JPG or WebP. The white background is removed (made see-through), edges are trimmed and it&apos;s resized automatically.</p>
          {error && <p className="text-sm font-medium text-danger">{error}</p>}
        </div>
      </div>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
