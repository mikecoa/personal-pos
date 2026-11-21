export const c = {
  bg: "#f7f4ef", surface: "#ffffff", surface2: "#f1ece4", ink: "#2a211b", ink2: "#6b5d52", line: "#e4dcd1",
  accent: "#2f6b4f", accentInk: "#ffffff", accentSoft: "#e3efe8", danger: "#b4412f", dangerSoft: "#f6e3df", warn: "#a86b12",
};
export const r = { sm: 8, md: 12, lg: 16 };
/** Soft tile colours for items without photos, picked from the name so they stay stable. */
const tiles = ["#e9dfd2", "#dfe8e2", "#e6e0ee", "#f0e2d6", "#dde6ee", "#ece6d3", "#e8dbe0"];
export const tileColor = (name: string) => tiles[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % tiles.length]!;
