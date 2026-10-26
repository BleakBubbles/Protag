import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Rect } from './Popover';
import { colors, radius, spacing } from './theme';

const OPEN_MS = 220;
const CLOSE_MS = 170;

export interface ExpandSheetProps {
  /** What opened it (measured with `useAnchor` or `measureInWindow`); null while closed. */
  anchor: Rect | null;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A tall panel that grows out of what opened it, and shrinks back into it,
 * rather than sliding up from the bottom: its frame stretches from the
 * anchor's rect to the panel's while its contents fade in late, the way the
 * folded pot opens. Tap outside or press back to close.
 */
export function ExpandSheet({ anchor, onClose, children }: ExpandSheetProps) {
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const grow = useRef(new Animated.Value(0)).current;
  // Kept while it shrinks away, after `anchor` has gone.
  const [shown, setShown] = useState<Rect | null>(null);

  useEffect(() => {
    if (anchor) {
      setShown(anchor);
      grow.setValue(0);
      Animated.timing(grow, { toValue: 1, duration: OPEN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    } else if (shown) {
      Animated.timing(grow, { toValue: 0, duration: CLOSE_MS, easing: Easing.in(Easing.cubic), useNativeDriver: false }).start(
        ({ finished }) => finished && setShown(null)
      );
    }
    // Not on `shown`: it's what's closing, and following it would reopen it.
  }, [anchor, grow]);

  if (!shown) return null;
  const top = insets.top + spacing.xl;
  const to = { x: 0, y: top, width: screen.width, height: screen.height - top };
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
        <Animated.View
          style={[
            { width: to.width, height: to.height, paddingBottom: insets.bottom },
            { opacity: grow.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] }) },
          ]}
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
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
});
