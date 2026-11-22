"use client";
import { useRef, useState } from "react";

const MAX = 256;            // longest side, px
const LIMIT = 300_000;      // characters, matches the database check

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
  const box = contentBox(fctx, img.width, img.height);
  const scale = Math.min(1, MAX / Math.max(box.w, box.h));
  const out = document.createElement("canvas");
  out.width = Math.round(box.w * scale); out.height = Math.round(box.h * scale);
  out.getContext("2d")!.drawImage(full, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);
  const png = out.toDataURL("image/png");
  return png.length <= LIMIT ? png : out.toDataURL("image/jpeg", 0.85);
}

/** Logo picker for a location: preview, replace, remove. Sends the resized image as `logo`. */
export function LogoInput({ initial }: { initial: string | null }) {
  const [logo, setLogo] = useState(initial ?? "");
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
      <span className="mb-1.5 block text-sm font-medium text-ink">Logo</span>
      <input type="hidden" name="logo" value={logo} />
      <div className="flex items-center gap-4 rounded-xl border border-line bg-surface-2/50 p-4">
        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white">
          {logo ? <img src={logo} alt="Logo preview" className="h-full w-full object-contain p-1.5" />
            : <span className="text-xs text-ink-2">No logo</span>}
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => file.current?.click()}
              className="h-10 rounded-lg border border-line bg-surface px-4 text-sm font-semibold hover:bg-surface-2">
              {logo ? "Replace" : "Upload logo"}
            </button>
            {logo && (
              <button type="button" onClick={() => setLogo("")} className="h-10 rounded-lg px-3 text-sm font-semibold text-danger hover:bg-surface-2">
                Remove
              </button>
            )}
          </div>
          <p className="text-sm text-ink-2">Shown on the POS tablets. PNG, JPG or WebP; white edges are trimmed and it&apos;s resized automatically.</p>
          {error && <p className="text-sm font-medium text-danger">{error}</p>}
        </div>
      </div>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
