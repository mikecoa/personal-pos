// Checks that every English text the backoffice shows has an Indonesian translation with the same
// {placeholders}: t("…") / tx("…") calls, server error messages, and the permission lists from
// @pos/core. Run: pnpm --filter backoffice i18n:check   (add --list to print what's missing as JSON)
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = [];
const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => {
  if (e.name.startsWith(".") || e.name === "node_modules") return;
  e.isDirectory() ? walk(join(d, e.name)) : /\.tsx?$/.test(e.name) && !e.name.startsWith("i18n") && files.push(join(d, e.name));
});
["app", "components", "lib"].forEach((d) => walk(join(root, d)));
const core = ["backoffice.ts", "permissions.ts"].map((f) => join(root, "../../packages/core/src", f));

const dict = readFileSync(join(root, "lib/i18n.id.ts"), "utf8");
const id = new Map([...dict.matchAll(/^\s*("(?:[^"\\]|\\.)*"): ("(?:[^"\\]|\\.)*"),$/gm)].map((m) => [JSON.parse(m[1]), JSON.parse(m[2])]));
const holes = (s) => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort().join(",");

const S = String.raw`("(?:[^"\\]|\\.)*")`;
const patterns = [
  new RegExp(String.raw`\b(?:t|tx|tr|tt|docT)\(\s*` + S, "g"),
  new RegExp(String.raw`\bfail\(\s*` + S, "g"),
  new RegExp(String.raw`\berror: ` + S, "g"),
  new RegExp(String.raw`\bsetError\(\s*` + S, "g"),
];
const corePatterns = [new RegExp(String.raw`\b(?:label|hint): ` + S, "g")];

const missing = new Map(), problems = [];
const scan = (f, pats) => {
  const src = readFileSync(f, "utf8");
  for (const p of pats) for (const m of src.matchAll(p)) {
    const en = JSON.parse(m[1]);
    if (!/[A-Za-z]{2}/.test(en)) continue;
    if (!id.has(en)) missing.set(en, f.replace(root, ""));
    else if (holes(en) !== holes(id.get(en))) problems.push(`placeholders differ: ${JSON.stringify(en)}`);
  }
};
files.forEach((f) => scan(f, patterns));
core.forEach((f) => scan(f, corePatterns));

if (process.argv.includes("--list")) { console.log(JSON.stringify([...missing.keys()], null, 1)); process.exit(0); }
for (const [en, f] of missing) problems.push(`missing: ${JSON.stringify(en)}  (${f})`);
if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
console.log(`i18n ok: ${id.size} Indonesian texts`);
