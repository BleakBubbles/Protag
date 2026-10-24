import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Modal, Pressable, StyleSheet, useWindowDimensions, View, type ViewInstance } from 'react-native';

import { colors, radius, spacing } from './theme';

/** The screen's edge margin, which a popover keeps clear of. */
const EDGE = spacing.lg;
const POINTER = 10;
/** Between the anchor and a popover without a pointer. */
const NUDGE = spacing.xs;
/** Its own quick fade in: the system's own for a Modal is slow enough to feel sluggish. */
const APPEAR_MS = 120;

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * Something a popover floats beside: put `ref` on it, call `open` to measure
 * it and show the popover, `close` to hide it. `rect` is null while closed.
 */
export function useAnchor() {
  const ref = useRef<ViewInstance>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  return {
    ref,
    rect,
    open: () => ref.current?.measureInWindow((x, y, width, height) => setRect({ x, y, width, height })),
    close: () => setRect(null),
  };
}

export interface PopoverProps {
  /** Where it points; null while closed. */
  anchor: Rect | null;
  onClose: () => void;
  width: number;
  /** A pointer at the anchor (an explanation, a picker); menus go without. */
  pointer?: boolean;
  /** Dims the app behind it, for something to read rather than a quick pick. */
  dim?: boolean;
  /** Darker, with a fine edge (menus), rather than the lighter bubble (an explanation, a picker). */
  dark?: boolean;
  children: ReactNode;
}

/**
 * A small panel floating beside what opened it: the (i) bubble, menus, the
 * colour picker. Right-aligned under its anchor; above it instead when it
 * doesn't fit below and there's more room above. That covers large system
 * fonts and short screens; anything taller than either side isn't worth more
 * machinery, since what goes in one is short. Tap outside (or back) to close.
 */
export function Popover({ anchor, onClose, width: wanted, pointer = false, dim = false, dark = false, children }: PopoverProps) {
  return (
    <Modal visible={anchor !== null} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close">
        {anchor && (
          <Placed anchor={anchor} wanted={wanted} pointer={pointer} dark={dark} dim={dim}>
            {children}
          </Placed>
        )}
      </Pressable>
    </Modal>
  );
}

/** Hidden for the one frame it takes to measure itself. */
function Placed({
  anchor,
  wanted,
  pointer,
  dark,
  dim,
  children,
}: {
  anchor: Rect;
  wanted: number;
  pointer: boolean;
  dark: boolean;
  dim: boolean;
  children: ReactNode;
}) {
  const screen = useWindowDimensions();
  const [natural, setNatural] = useState<number | null>(null);
  // Fades in (with the dimming behind) once it's measured where it goes.
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (natural !== null) Animated.timing(appear, { toValue: 1, duration: APPEAR_MS, useNativeDriver: true }).start();
  }, [natural === null, appear]);

  const gap = pointer ? POINTER : NUDGE;
  const width = Math.min(wanted, screen.width - EDGE * 2);
  const centre = anchor.x + anchor.width / 2;
  // With a pointer, its tip sits near the panel's right end; without, the panel lines up with the anchor's right edge.
  const right = pointer ? centre + POINTER * 2 : anchor.x + anchor.width;
  const left = Math.min(Math.max(EDGE, right - width), screen.width - EDGE - width);
  const below = anchor.y + anchor.height + gap;
  const roomBelow = screen.height - EDGE - below;
  const roomAbove = anchor.y - gap - EDGE;
  const placeBelow = natural === null || natural <= roomBelow || roomBelow >= roomAbove;
  const top = placeBelow ? below : anchor.y - gap - (natural ?? 0);

  return (
    <>
      {dim && <Animated.View pointerEvents="none" style={[styles.scrim, styles.dimmed, { opacity: appear }]} />}
      <Animated.View
        style={[styles.panel, dark && styles.dark, { width, left, top, opacity: appear }]}
        onLayout={(e) => setNatural(e.nativeEvent.layout.height)}
      >
        {pointer && (
          <View style={[styles.pointer, { left: centre - left - POINTER }, placeBelow ? styles.pointerUp : styles.pointerDown]} />
        )}
        {children}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  // Catches a tap anywhere outside, to close.
  scrim: {
    ...StyleSheet.absoluteFill,
  },
  // The app dimmed behind it, so it stands out.
  dimmed: {
    backgroundColor: colors.scrim,
  },
  // A step lighter than the cards it sits over.
  panel: {
    position: 'absolute',
    borderRadius: radius.lg,
    backgroundColor: colors.raised,
    elevation: 12,
  },
  dark: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  // A square turned on its corner, half of it showing past the panel's edge.
  pointer: {
    position: 'absolute',
    width: POINTER * 2,
    height: POINTER * 2,
    backgroundColor: colors.raised,
    transform: [{ rotate: '45deg' }],
  },
  pointerUp: {
    top: -POINTER,
  },
  pointerDown: {
    bottom: -POINTER,
  },
});
