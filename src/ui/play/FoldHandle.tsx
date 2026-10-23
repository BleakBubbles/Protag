import { useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../theme';

/** The strip it sits in: thin, so the tags below barely move for it. */
const STRIP = 20;
const BAR = 36;
/** How far down a drag has to go, or how fast, to fold. */
const DRAG = 32;
const FLICK = 0.4;
/** How much of the finger's travel the list follows: a little weight to it. */
const FOLLOW = 0.5;

/**
 * Lets something be dragged by the finger "somewhat": `offset` follows a
 * drag in one direction at half its distance, and on release either `act`s
 * (far or fast enough) or springs back. Both ways, `offset` returns to 0.
 */
export function useDragToAct({
  offset,
  direction,
  act,
  claimTaps,
}: {
  offset: Animated.Value;
  /** 1 for down, -1 for up. */
  direction: 1 | -1;
  act: () => void;
  /** Take every touch (a handle, where a tap acts too) rather than only a drag in `direction`. */
  claimTaps?: boolean;
}) {
  const latest = useRef(act);
  latest.current = act;
  return useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !!claimTaps,
      onMoveShouldSetPanResponderCapture: (_, { dx, dy }) => dy * direction > 6 && Math.abs(dy) > Math.abs(dx),
      onPanResponderMove: (_, { dy }) => offset.setValue(Math.max(0, dy * direction) * FOLLOW * direction),
      onPanResponderRelease: (_, { dx, dy, vy }) => {
        const tap = !!claimTaps && Math.abs(dx) < 8 && Math.abs(dy) < 8;
        const acted = tap || dy * direction > DRAG || vy * direction > FLICK;
        if (acted) latest.current();
        Animated.spring(offset, { toValue: 0, useNativeDriver: true, bounciness: acted ? 0 : 6 }).start();
      },
      onPanResponderTerminate: () => Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start(),
    })
  ).current.panHandlers;
}

/**
 * The handle at the top of the tag list: tap it, or drag it down (the list
 * follows), to fold the browser away. In its own strip, outside the scrolling
 * list, so the gesture is never mistaken for a scroll; its touch area reaches
 * well past the bar.
 */
export function FoldHandle({ onFold, offset }: { onFold: () => void; offset: Animated.Value }) {
  const handlers = useDragToAct({ offset, direction: 1, act: onFold, claimTaps: true });
  return (
    <View
      {...handlers}
      hitSlop={{ top: spacing.sm, bottom: spacing.md, left: spacing.xl * 2, right: spacing.xl * 2 }}
      accessible
      accessibilityRole="button"
      accessibilityLabel="Done adding"
      onAccessibilityTap={onFold}
      style={styles.strip}
    >
      <View style={styles.bar} />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    height: STRIP,
    alignSelf: 'center',
    width: BAR * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    width: BAR,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.raised,
  },
});
