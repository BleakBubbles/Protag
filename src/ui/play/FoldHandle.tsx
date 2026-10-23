import { useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../theme';

/** The strip it sits in: thin, so the tags below barely move for it. */
const STRIP = 20;
const BAR = 36;
/** How far down a drag has to go, or how fast, to fold. */
const DRAG = 32;
const FLICK = 0.4;

/**
 * The handle at the top of the tag list: tap it or drag it down to fold the
 * browser away. In its own strip, outside the scrolling list, so the gesture
 * is never mistaken for a scroll; its touch area reaches well past the bar.
 */
export function FoldHandle({ onFold }: { onFold: () => void }) {
  const fold = useRef(onFold);
  fold.current = onFold;
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: (_, { dx, dy, vy }) => {
        const tap = Math.abs(dx) < 8 && Math.abs(dy) < 8;
        if (tap || dy > DRAG || vy > FLICK) fold.current();
      },
    })
  ).current;

  return (
    <View
      {...responder.panHandlers}
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
