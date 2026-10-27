import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Rect } from './Popover';
import { colors, radius, spacing } from './theme';

// Android's own app-launch motion (Material's emphasized curves): out fast and a
// long settle on the way in, a quicker fall back into what opened it.
const OPEN_MS = 400;
const CLOSE_MS = 300;
const OPEN_EASING = Easing.bezier(0.05, 0.7, 0.1, 1);
const CLOSE_EASING = Easing.bezier(0.3, 0, 0.8, 0.15);

export interface ExpandWindowProps {
  /** What opened it (measured with `useAnchor` or `measureInWindow`); null while closed. */
  anchor: Rect | null;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A window floating over the app that grows out of what opened it, and
 * shrinks back into it, rather than sliding up from the bottom, the way an app
 * opens from its icon: the frame stretches from the anchor's rect to the
 * window's, and the contents, laid out at full size, are scaled down to its
 * width and grow with it, there from the start. Tap outside or press back to close.
 */
export function ExpandWindow({ anchor, onClose, children }: ExpandWindowProps) {
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const grow = useRef(new Animated.Value(0)).current;
  // Kept while it shrinks away, after `anchor` has gone.
  const [shown, setShown] = useState<Rect | null>(null);

  useEffect(() => {
    if (anchor) {
      setShown(anchor);
      grow.setValue(0);
      Animated.timing(grow, { toValue: 1, duration: OPEN_MS, easing: OPEN_EASING, useNativeDriver: false }).start();
    } else if (shown) {
      Animated.timing(grow, { toValue: 0, duration: CLOSE_MS, easing: CLOSE_EASING, useNativeDriver: false }).start(
        ({ finished }) => finished && setShown(null)
      );
    }
    // Not on `shown`: it's what's closing, and following it would reopen it.
  }, [anchor, grow]);

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
        style={[
          styles.frame,
          {
            left: between(shown.x, to.x),
            top: between(shown.y, to.y),
            width: between(shown.width, to.width),
            height: between(shown.height, to.height),
            borderRadius: between(Math.min(shown.height / 2, radius.lg), radius.lg),
          },
        ]}
      >
        {/* Scaled with the frame's width from its corner, so it shrinks whole rather than being cut off. */}
        <Animated.View
          style={{
            width: to.width,
            height: to.height,
            transformOrigin: 'top left',
            transform: [{ scale: between(shown.width / to.width, 1) }],
            opacity: grow.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] }),
          }}
        >
          {children}
        </Animated.View>
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
    backgroundColor: colors.surface,
  },
});
