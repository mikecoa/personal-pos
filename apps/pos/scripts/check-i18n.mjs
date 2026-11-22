// Checks that every t("…") text in the tablet app has an Indonesian translation with the same
// {placeholders}. Run: pnpm --filter pos i18n:check
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../src/", import.meta.url));
const files = [];
const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) =>
  e.isDirectory() ? walk(join(d, e.name)) : /\.tsx?$/.test(e.name) && !e.name.startsWith("i18n") && files.push(join(d, e.name)));
walk(src);

const dict = readFileSync(join(src, "lib/i18n.id.ts"), "utf8");
const id = new Map([...dict.matchAll(/^\s*("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),$/gm)].map((m) => [JSON.parse(m[1]), JSON.parse(m[2])]));
const holes = (s) => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort().join(",");

const problems = [];
for (const f of files) {
  for (const m of readFileSync(f, "utf8").matchAll(/\bt\(\s*("(?:[^"\\]|\\.)*")/g)) {
    const en = JSON.parse(m[1]);
    if (!id.has(en)) problems.push(`missing: ${JSON.stringify(en)}  (${f.slice(src.length)})`);
    else if (holes(en) !== holes(id.get(en))) problems.push(`placeholders differ: ${JSON.stringify(en)}`);
  }
}
if (problems.length) { console.error([...new Set(problems)].join("\n")); process.exit(1); }
console.log(`i18n ok: ${id.size} Indonesian texts`);
