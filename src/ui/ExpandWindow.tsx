import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Rect } from './Popover';
import { radius, spacing } from './theme';
import { makeStyles } from './ThemeContext';

// Snappy enough that you barely see it grow: out fast and done, no long settle
// to catch the end of; back in quicker still.
const OPEN_MS = 200;
const CLOSE_MS = 200;
const OPEN_EASING = Easing.out(Easing.poly(4));
// Closing starts at once, heading back to the anchor, but only part of the way:
// it fades out as it goes and is gone by then, rather than dwindling all the way in.
const CLOSE_EASING = Easing.out(Easing.quad);
/** How far back towards the anchor it shrinks before it's gone (0 is all the way in). */
const CLOSE_TO = 0.75;

export interface ExpandWindowProps {
  /** What opened it (measured with `useAnchor` or `measureInWindow`); null while closed. */
  anchor: Rect | null;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A window floating over the app that grows out of what opened it, and
 * shrinks back into it, rather than sliding up from the bottom, the way an app
 * opens from its icon: the whole window, contents and all, starts shrunk to fit
 * inside the anchor, centred on it, and grows outwards from there to its place.
 * Closing, it heads back towards the anchor, fading as it goes. Only transforms and opacity move, on the
 * native side, so a busy JS thread can't stall it. It starts at once: the empty
 * window is laid out and growing before its contents are built, which happens
 * as it grows, so building them neither delays the start nor eats its first frames.
 * Tap outside or press back to close.
 */
export function ExpandWindow({ anchor, onClose, children }: ExpandWindowProps) {
  const styles = useStyles();
  const screen = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const grow = useRef(new Animated.Value(0)).current;
  /** Fully there while open; closing, it fades as it shrinks. */
  const fade = useRef(new Animated.Value(1)).current;
  // Kept while it shrinks away, after `anchor` has gone.
  const [shown, setShown] = useState<Rect | null>(null);
  /** Opened, waiting for the first layout to start growing. */
  const pending = useRef(false);
  /** The contents, built once it's growing. */
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    if (anchor) {
      grow.setValue(0);
      fade.setValue(1);
      pending.current = true;
      setFilled(false);
      setShown(anchor);
    } else if (shown) {
      pending.current = false;
      Animated.parallel([
        Animated.timing(grow, { toValue: CLOSE_TO, duration: CLOSE_MS, easing: CLOSE_EASING, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 0, duration: CLOSE_MS, easing: Easing.linear, useNativeDriver: true }),
      ]).start(({ finished }) => finished && setShown(null));
    }
    // Not on `shown`: it's what's closing, and following it would reopen it.
  }, [anchor, grow, fade]);

  // Growing starts as soon as the window is in place, without waiting on a layout event.
  useLayoutEffect(() => {
    if (!shown || !pending.current) return;
    pending.current = false;
    Animated.timing(grow, { toValue: 1, duration: OPEN_MS, easing: OPEN_EASING, useNativeDriver: true }).start();
    setFilled(true);
  }, [shown]);

  if (!shown) return null;
  // Inset on every side, clear of the status and navigation bars.
  const top = insets.top + spacing.lg;
  const bottom = insets.bottom + spacing.lg;
  const to = { x: spacing.md, y: top, width: screen.width - spacing.md * 2, height: screen.height - top - bottom };
  const between = (from: number, end: number) => grow.interpolate({ inputRange: [0, 1], outputRange: [from, end] });
  // Small enough to fit inside the anchor both ways, like an app in its icon.
  const fit = Math.min(shown.width / to.width, shown.height / to.height, 1);

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: Animated.multiply(grow, fade) }]}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <Animated.View
        style={[
          styles.frame,
          {
            left: to.x,
            top: to.y,
            width: to.width,
            height: to.height,
            // From inside the anchor, on its centre, to full size in its place, scaled about its own centre.
            transform: [
              { translateX: between(shown.x + shown.width / 2 - (to.x + to.width / 2), 0) },
              { translateY: between(shown.y + shown.height / 2 - (to.y + to.height / 2), 0) },
              { scale: between(fit, 1) },
            ],
            opacity: fade,
          },
        ]}
      >
        {filled && children}
      </Animated.View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  backdrop: {
    backgroundColor: colors.scrim,
  },
  frame: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
}));
