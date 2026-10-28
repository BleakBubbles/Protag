import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';
import { useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

import { feelHold, HOLD_MS } from '../haptics';
import { spacing } from '../theme';
import { makeStyles } from '../ThemeContext';
import { POT_ROW, trayHeight } from './Pot';

/** The strip it sits in: thin, so what's below barely moves for it. */
const STRIP = 32;
/** The divider's height, for working out how much room is left around it. */
export const DIVIDER_HEIGHT = STRIP;
const BAR = 36;
/** Moving this far before then makes it a swipe instead. */
const SLOP = 8;
/** A swipe this far (or this fast, px/ms) switches what's below; less springs back. */
const SWIPE = 64;
const SWIPE_FLICK = 0.5;
/** Longer than the tags take to go down, so their swipe offset resets out of sight. */
const RESET_AFTER_MS = 400;

type Mode = 'undecided' | 'swipe' | 'resize';

export interface DividerProps {
  /** What a tap switches the area below to ("Tags" at rest, "Mixes" while building), for screen readers. */
  label: string;
  /** A tap, or a swipe towards it: switch what's below. */
  onTap: () => void;
  /** The pot's tray height, which a held drag moves directly. */
  tray: Animated.Value;
  rows: number;
  minRows: number;
  maxRows: number;
  /** The row count it settled on after a resize, to keep. */
  onSettle: (rows: number) => void;
  /**
   * While building: a swipe down takes the tags with the finger (`pull`) and,
   * let go far enough on or flicked, folds them away (`onSwipeFold`). `fast`
   * says the finger was moving, so the fold should carry on at speed.
   */
  pull?: Animated.Value;
  onSwipeFold?: (fast: boolean) => void;
}

/**
 * The divider between the pot and what's below it (your mixes at rest, your
 * tags while building). One gesture, one job:
 * - Tap: switch between the two.
 * - Swipe: move the "keyboard". Down while building, the tags follow the
 *   finger and fold away (else spring back); up at rest, they come up. The
 *   pot never changes size on a swipe.
 * - Hold, then drag: resize. A tick and a brighter bar say it's picked up;
 *   the pot's tray follows the finger and settles on the nearest whole row,
 *   with a tick at each row on the way. The size is kept, the same in both
 *   states.
 * In its own strip, outside any scrolling list, so a drag is never mistaken
 * for a scroll.
 */
export function Divider({ label, onTap, tray, rows, minRows, maxRows, onSettle, pull, onSwipeFold }: DividerProps) {
  const styles = useStyles();
  const latest = useRef({ onTap, rows, minRows, maxRows, onSettle, pull, onSwipeFold });
  latest.current = { onTap, rows, minRows, maxRows, onSettle, pull, onSwipeFold };
  const gesture = useRef<{ mode: Mode; from: number; tick: number; hold: ReturnType<typeof setTimeout> | null }>({
    mode: 'undecided',
    from: 0,
    tick: rows,
    hold: null,
  });
  /** Picked up to resize: the bar brightens. */
  const [holding, setHolding] = useState(false);

  const nearest = (height: number) => {
    const { minRows: low, maxRows: high } = latest.current;
    return Math.min(high, Math.max(low, Math.round((height - trayHeight(1)) / POT_ROW) + 1));
  };
  const settle = (target: number) => {
    // Kept once it's landed, so the new row count can't cut the settling short.
    // (Not if a new resize interrupts it: that one settles in its turn.)
    Animated.spring(tray, { toValue: trayHeight(target), useNativeDriver: false, bounciness: 0, speed: 8 }).start(
      ({ finished }) => {
        if (finished && target !== latest.current.rows) latest.current.onSettle(target);
      }
    );
  };
  const springBack = () => {
    const { pull: pulled } = latest.current;
    if (pulled) Animated.spring(pulled, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
  };
  const end = () => {
    const g = gesture.current;
    if (g.hold) clearTimeout(g.hold);
    g.hold = null;
    setHolding(false);
  };

  const handlers = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const g = gesture.current;
        g.mode = 'undecided';
        g.hold = setTimeout(() => {
          if (g.mode !== 'undecided') return;
          g.mode = 'resize';
          // From where the tray actually is: it may still be settling from the last resize.
          g.from = trayHeight(latest.current.rows);
          g.tick = latest.current.rows;
          tray.stopAnimation((height) => {
            g.from = height;
            g.tick = nearest(height);
          });
          setHolding(true);
          feelHold();
        }, HOLD_MS);
      },
      onPanResponderMove: (_, { dy }) => {
        const g = gesture.current;
        if (g.mode === 'undecided' && Math.abs(dy) > SLOP) {
          g.mode = 'swipe';
          if (g.hold) clearTimeout(g.hold);
        }
        if (g.mode === 'swipe') {
          // Down while building: the tags follow the finger.
          latest.current.pull?.setValue(Math.max(0, dy));
          return;
        }
        if (g.mode !== 'resize') return;
        const { minRows: low, maxRows: high } = latest.current;
        const height = Math.min(trayHeight(high), Math.max(trayHeight(low), g.from + dy));
        tray.setValue(height);
        const row = nearest(height);
        if (row === g.tick) return;
        g.tick = row;
        performAndroidHapticsAsync(AndroidHaptics.Segment_Tick).catch(() => {});
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        const g = gesture.current;
        const mode = g.mode;
        end();
        if (mode === 'undecided') return latest.current.onTap();
        if (mode === 'resize') return settle(nearest(g.from + dy));
        const { pull: pulled, onSwipeFold: fold } = latest.current;
        if (pulled && fold) {
          // Building: down far enough, or flicked, folds the tags.
          if (dy > SWIPE || (dy > SLOP && vy > SWIPE_FLICK)) {
            fold(vy > SWIPE_FLICK);
            // They carry on down from wherever the finger left them; the offset resets once
            // they're out of sight (doing it on the way would push them back up mid-fall).
            Animated.sequence([
              Animated.delay(RESET_AFTER_MS),
              Animated.timing(pulled, { toValue: 0, duration: 0, useNativeDriver: true }),
            ]).start();
            return;
          }
          return springBack();
        }
        // At rest: up far enough, or flicked, brings the tags up.
        if (dy < -SWIPE || (dy < -SLOP && vy < -SWIPE_FLICK)) latest.current.onTap();
      },
      onPanResponderTerminate: () => {
        const mode = gesture.current.mode;
        end();
        if (mode === 'resize') settle(latest.current.rows);
        else springBack();
      },
    })
  ).current.panHandlers;

  return (
    <View
      {...handlers}
      hitSlop={{ top: spacing.xs, bottom: spacing.sm, left: spacing.xl * 2, right: spacing.xl * 2 }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`Divider. Tap for ${label.toLowerCase()}`}
      accessibilityValue={{ text: `${rows} ${rows === 1 ? 'row' : 'rows'}` }}
      accessibilityActions={[
        { name: 'increment', label: 'Bigger mix' },
        { name: 'decrement', label: 'More room below' },
        { name: 'activate', label: `Show ${label.toLowerCase()}` },
      ]}
      onAccessibilityAction={(e) => {
        const { actionName } = e.nativeEvent;
        if (actionName === 'activate') return onTap();
        settle(Math.min(maxRows, Math.max(minRows, rows + (actionName === 'increment' ? 1 : -1))));
      }}
      style={styles.strip}
    >
      <View style={[styles.bar, holding && styles.barHeld]} />
    </View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  strip: {
    height: STRIP,
    alignSelf: 'center',
    minWidth: BAR * 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    width: BAR,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.raised,
  },
  // Picked up: brighter, so it's clear what the drag will do.
  barHeld: {
    backgroundColor: colors.textDim,
  },
}));
