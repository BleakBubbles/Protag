import { useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View, type ViewInstance } from 'react-native';

import { colors, radius, spacing } from './theme';

/** The screen's edge margin, which a popover keeps clear of. */
const EDGE = spacing.lg;
const POINTER = 10;
/** Between the anchor and a popover without a pointer. */
const NUDGE = spacing.xs;

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
  children: ReactNode;
}

/**
 * A small panel floating beside what opened it: the (i) bubble, menus, the
 * colour picker. Right-aligned under its anchor; above it instead when it
 * doesn't fit below and there's more room above. That covers large system
 * fonts and short screens; anything taller than either side isn't worth more
 * machinery, since what goes in one is short. Tap outside (or back) to close.
 */
export function Popover({ anchor, onClose, width: wanted, pointer = false, dim = false, children }: PopoverProps) {
  return (
    <Modal visible={anchor !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={[styles.scrim, dim && styles.dimmed]} onPress={onClose} accessibilityLabel="Close">
        {anchor && (
          <Placed anchor={anchor} wanted={wanted} pointer={pointer}>
            {children}
          </Placed>
        )}
      </Pressable>
    </Modal>
  );
}

/** Hidden for the one frame it takes to measure itself. */
function Placed({ anchor, wanted, pointer, children }: { anchor: Rect; wanted: number; pointer: boolean; children: ReactNode }) {
  const screen = useWindowDimensions();
  const [natural, setNatural] = useState<number | null>(null);

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
    <View
      style={[styles.panel, { width, left, top, opacity: natural === null ? 0 : 1 }]}
      onLayout={(e) => setNatural(e.nativeEvent.layout.height)}
    >
      {pointer && (
        <View style={[styles.pointer, { left: centre - left - POINTER }, placeBelow ? styles.pointerUp : styles.pointerDown]} />
      )}
      {children}
    </View>
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
