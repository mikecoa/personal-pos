import { useEffect, useRef, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";

/**
 * Small, quick animations that make the app feel responsive without slowing staff down.
 * Everything is skipped when the tablet's "Remove animations / reduce motion" setting is on.
 */
let reduceMotion = false;
void AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduceMotion = v; });
AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => { reduceMotion = v; });

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** A Pressable that shrinks a little while pressed (instant feedback under the finger). */
export function Tap({ style, scaleTo = 0.96, children, onPressIn, onPressOut, ...rest }:
  Omit<PressableProps, "style" | "children"> & { style?: StyleProp<ViewStyle>; scaleTo?: number; children?: ReactNode }) {
  const v = useRef(new Animated.Value(1)).current;
  const to = (x: number) => {
    if (reduceMotion) return v.setValue(1);
    Animated.spring(v, { toValue: x, useNativeDriver: true, speed: 50, bounciness: x < 1 ? 0 : 6 }).start();
  };
  return (
    <AnimatedPressable {...rest} onPressIn={(e) => { to(scaleTo); onPressIn?.(e); }} onPressOut={(e) => { to(1); onPressOut?.(e); }}
      style={[style, { transform: [{ scale: v }] }]}>
      {children}
    </AnimatedPressable>
  );
}

/** Fades (and slightly slides / grows) its content in when it first appears. */
export function FadeIn({ children, style, from = 8, scale = 1, duration = 200, delay = 0 }:
  { children: ReactNode; style?: StyleProp<ViewStyle>; from?: number; scale?: number; duration?: number; delay?: number }) {
  const v = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, duration, delay]);
  return (
    <Animated.View style={[style, {
      opacity: v,
      transform: [
        { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [from, 0] }) },
        { scale: v.interpolate({ inputRange: [0, 1], outputRange: [scale, 1] }) },
      ],
    }]}>{children}</Animated.View>
  );
}

/** Gives its content a quick "pop" whenever `value` changes (e.g. a count going up). */
export function Pop({ value, children, style }: { value: unknown; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (reduceMotion) return;
    v.setValue(1.25);
    Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 12 }).start();
  }, [value, v]);
  return <Animated.View style={[style, { transform: [{ scale: v }] }]}>{children}</Animated.View>;
}
