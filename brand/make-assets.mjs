// Orda brand assets: the "cup" mark (an O drawn as a coffee cup seen from above) in every size the
// tablet app and backoffice need. Run: node brand/make-assets.mjs   (uses sharp, already installed)
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const GREEN = "#2f6b4f";   // pandan green (backoffice --accent, tablet c.accent)
const AMBER = "#e0a23b";   // coffee
const WHITE = "#ffffff";

/** The cup on a 1024 canvas, centred: rim, coffee and handle. `ink` colours the rim and handle. */
const cup = (ink = WHITE, coffee = AMBER) => `
  <path d="M690 404 H772 A108 108 0 0 1 772 620 H690" fill="none" stroke="${ink}" stroke-width="58" stroke-linecap="round"/>
  <circle cx="452" cy="512" r="246" fill="none" stroke="${ink}" stroke-width="84"/>
  <circle cx="452" cy="512" r="122" fill="${coffee}"/>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${body}</svg>`;

/** Full mark: cup on a rounded pandan-green square. */
const mark = svg(`<rect width="1024" height="1024" rx="256" fill="${GREEN}"/>${cup()}`);
/** Cup only, shrunk into Android's adaptive-icon safe zone (the launcher adds the shape). */
const inSafeZone = (body) => svg(`<g transform="translate(512 512) scale(0.68) translate(-512 -512)">${body}</g>`);

const out = (rel, data) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, data); console.log("wrote", rel); };
const png = async (rel, src, size) => out(rel, await sharp(Buffer.from(src), { density: 300 }).resize(size, size).png().toBuffer());

out("brand/orda-mark.svg", mark);
out("apps/backoffice/app/icon.svg", mark);                                               // browser tab icon
await png("apps/pos/assets/icon.png", mark, 1024);                                        // launcher icon
await png("apps/pos/assets/android-icon-foreground.png", inSafeZone(cup()), 1024);        // adaptive: cup…
await png("apps/pos/assets/android-icon-background.png", svg(`<rect width="1024" height="1024" fill="${GREEN}"/>`), 1024); // …on green
await png("apps/pos/assets/android-icon-monochrome.png", inSafeZone(cup(WHITE, WHITE)), 1024); // themed icons (Android tints it)
await png("apps/pos/assets/splash-icon.png", mark, 1024);
await png("apps/pos/assets/favicon.png", mark, 48);
await png("brand/orda-mark-512.png", mark, 512);
