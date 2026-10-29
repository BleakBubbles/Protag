import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

/**
 * Reduced motion: Android's "Remove animations" (Accessibility settings). When
 * it's on, things the app moves by itself stop moving — they're simply where
 * they end up — while what follows a finger (dragging a tile, pulling the
 * player down) still does, which tracks the gesture rather than adding motion
 * to it. Fades stay: they're the stand-in for movement, not movement.
 *
 * Animate with `timing` and `spring` from here instead of `Animated`'s own, and
 * that comes for free. A bigger transition that would feel abrupt snapping
 * (the player opening) can ask `useReduceMotion()` and fade instead.
 */
let reduced = false;
const listeners = new Set<() => void>();
const set = (on: boolean) => {
  if (on === reduced) return;
  reduced = on;
  listeners.forEach((listener) => listener());
};
AccessibilityInfo.isReduceMotionEnabled().then(set, () => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', set);

export const reduceMotion = () => reduced;

export function useReduceMotion(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reduceMotion
  );
}

type Value = Animated.Value | Animated.ValueXY;

/** `Animated.timing`, done at once when motion is reduced. */
export function timing(value: Value, config: Animated.TimingAnimationConfig): Animated.CompositeAnimation {
  return Animated.timing(value, reduced ? { ...config, duration: 0, delay: 0 } : config);
}

/** `Animated.spring`, done at once (no bounce) when motion is reduced. */
export function spring(value: Value, config: Animated.SpringAnimationConfig): Animated.CompositeAnimation {
  if (!reduced) return Animated.spring(value, config);
  return Animated.timing(value, { toValue: config.toValue, duration: 0, useNativeDriver: config.useNativeDriver });
}
