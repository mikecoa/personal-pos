/**
 * Orda colours: clean neutral greys with the Orda green, the same family as the backoffice website.
 */
export const c = {
  bg: "#f3f5f3", surface: "#ffffff", surface2: "#eef1ee", ink: "#17211c", ink2: "#5c6862", line: "#e2e7e3",
  accent: "#2f6b4f", accentInk: "#ffffff", accentSoft: "#e3f0e8", danger: "#c0392b", dangerSoft: "#fbe7e4", warn: "#a86b12",
};
export const r = { sm: 10, md: 14, lg: 20 };
/** Soft drop shadow for cards and pop-ups (Android elevation + iOS shadow). */
export const shadow = { elevation: 3, shadowColor: "#0b1a12", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } };
/** Soft tile colours for items without photos, picked from the name so they stay stable. */
const tiles = ["#e3eee7", "#e6ebf3", "#efe9f4", "#f4ece2", "#e2eef0", "#f1efe0", "#f3e6ea"];
export const tileColor = (name: string) => tiles[[...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % tiles.length]!;
