import { useWindowDimensions } from "react-native";

/**
 * Screen size classes for the POS app.
 *  - compact: phones (either way round) — bottom tab bar, full-width menu, order opens full screen
 *  - narrow:  tablets in portrait — side menu kept, slimmer order panel
 *  - wide:    tablets in landscape (the original layout)
 *  - short:   small tablets in landscape (8–9" like the Galaxy Tab A11): tighter menu and item tiles
 */
export function useLayout() {
  const { width: w, height: h } = useWindowDimensions();
  const compact = Math.min(w, h) < 520 || w < 700;
  const narrow = !compact && w < 1000;
  return {
    w, h, compact, narrow,
    short: !compact && h < 700,
    railW: compact ? 0 : 96,
    cartW: compact ? 0 : narrow ? 340 : 400,
    pad: compact ? 12 : 16,
  };
}
