import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Rect } from './Popover';
import { colors, radius, spacing } from './theme';

// Snappy enough that you barely see it grow: out fast and done, no long settle
// to catch the end of; back in quicker still.
const OPEN_MS = 200;
const CLOSE_MS = 150;
const OPEN_EASING = Easing.out(Easing.poly(4));
const CLOSE_EASING = Easing.in(Easing.quad);

export interface ExpandWindowProps {
  /** What opened it (measured with `useAnchor` or `measureInWindow`); null while closed. */
  anchor: Rect | null;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A window floating over the app that grows out of what opened it, and
 * shrinks back into it, rather than sliding up from the bottom, the way an app
 * opens from its icon: the whole window, contents and all, scales up from the
 * anchor's corner to its place. Only transforms and opacity move, on the
 * native side, so a busy JS thread can't stall it; and the clock starts once
 * the window is laid out, so building its contents doesn't eat the first frames.
 * Tap outside or press back to close.
 */
export function ExpandWindow({ anchor, onClose, children }: ExpandWindowProps) {
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const grow = useRef(new Animated.Value(0)).current;
  // Kept while it shrinks away, after `anchor` has gone.
  const [shown, setShown] = useState<Rect | null>(null);
  /** Opened, waiting for the first layout to start growing. */
  const pending = useRef(false);

  useEffect(() => {
    if (anchor) {
      grow.setValue(0);
      pending.current = true;
      setShown(anchor);
    } else if (shown) {
      pending.current = false;
      Animated.timing(grow, { toValue: 0, duration: CLOSE_MS, easing: CLOSE_EASING, useNativeDriver: true }).start(
        ({ finished }) => finished && setShown(null)
      );
    }
    // Not on `shown`: it's what's closing, and following it would reopen it.
  }, [anchor, grow]);

  const start = () => {
    if (!pending.current) return;
    pending.current = false;
    Animated.timing(grow, { toValue: 1, duration: OPEN_MS, easing: OPEN_EASING, useNativeDriver: true }).start();
  };

  if (!shown) return null;
  // Inset on every side, clear of the status and navigation bars.
  const top = insets.top + spacing.lg;
  const bottom = insets.bottom + spacing.lg;
  const to = { x: spacing.md, y: top, width: screen.width - spacing.md * 2, height: screen.height - top - bottom };
  const between = (from: number, end: number) => grow.interpolate({ inputRange: [0, 1], outputRange: [from, end] });

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: grow }]}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        onLayout={start}
        style={[
          styles.frame,
          {
            left: to.x,
            top: to.y,
            width: to.width,
            height: to.height,
            // From the anchor's corner at its width, to the window's place at full size.
            transformOrigin: 'top left',
            transform: [
              { translateX: between(shown.x - to.x, 0) },
              { translateY: between(shown.y - to.y, 0) },
              { scale: between(shown.width / to.width, 1) },
            ],
            opacity: grow.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }),
          },
        ]}
      >
        {children}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: colors.scrim,
  },
  frame: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
});
