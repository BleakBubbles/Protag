import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';
import { useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';

import { colors, font, spacing } from '../theme';
import { POT_ROW, trayHeight } from './Pot';

/** The strip it sits in: thin, so what's below barely moves for it. */
const STRIP = 32;
/** The divider's height, for working out how much room is left around it. */
export const DIVIDER_HEIGHT = STRIP;
const BAR = 36;
/** Pulled this far past the pot's largest size (or flicked down there), letting go folds the tags. */
const FOLD_PULL = 80;
const FOLD_FLICK = 0.5;
/**
 * A flick down folds the tags at any pot size: this fast (px/ms) and this far
 * down. Both, so a careful resize or a wobbly tap never folds.
 */
const DISMISS_FLICK = 1.1;
const DISMISS_DISTANCE = 24;
/** Longer than the tags take to go down, so the pull resets out of sight. */
const RESET_AFTER_MS = 400;

export interface DividerProps {
  /** What a tap switches the area below to: "Tags" at rest, "Mixes" while building. */
  label: string;
  onTap: () => void;
  /** The pot's tray height, which a drag moves directly. */
  tray: Animated.Value;
  rows: number;
  minRows: number;
  maxRows: number;
  /** The row count it settled on after a resize, to keep. */
  onSettle: (rows: number) => void;
  /**
   * While building: a quick flick down folds the tags away (`onPullFold`) at
   * any pot size; so does pulling past the pot's largest size, which slides
   * them down (`pull`) and folds them if let go far enough on. `fast` says
   * the finger was moving, so the fold should carry on at speed.
   */
  pull?: Animated.Value;
  onPullFold?: (fast: boolean) => void;
}

/**
 * The divider between the pot and what's below it (your mixes at rest, your
 * tags while building). Tap it to switch between the two. Drag it and the
 * pot's tray follows the finger, giving the pot more rows of tiles or the area
 * below more room; let go and it settles on the nearest whole row, with a tick
 * at each row on the way, and the size is kept in both states. While
 * building, flick it down to fold the tags away; or keep pulling once the pot
 * is as big as it gets and the tags slide away with the finger: let go far
 * enough on (a firmer tick says where) and they fold, else they spring back.
 * Folding either way leaves the pot the size it was before the drag. In its
 * own strip, outside any scrolling list, so a drag is never mistaken for a
 * scroll.
 */
export function Divider({ label, onTap, tray, rows, minRows, maxRows, onSettle, pull, onPullFold }: DividerProps) {
  const latest = useRef({ onTap, rows, minRows, maxRows, onSettle, pull, onPullFold });
  latest.current = { onTap, rows, minRows, maxRows, onSettle, pull, onPullFold };
  const drag = useRef({ from: 0, tick: rows, folding: false });

  const nearest = (height: number) => {
    const { minRows: low, maxRows: high } = latest.current;
    return Math.min(high, Math.max(low, Math.round((height - trayHeight(1)) / POT_ROW) + 1));
  };
  const settle = (target: number) => {
    // Kept once it's landed, so the new row count can't cut the settling short.
    // (Not if a new drag interrupts it: that one settles in its turn.)
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

  const handlers = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // From where the tray actually is: it may still be settling from the last drag.
        drag.current = { from: trayHeight(latest.current.rows), tick: latest.current.rows, folding: false };
        tray.stopAnimation((height) => {
          drag.current = { from: height, tick: nearest(height), folding: false };
        });
      },
      onPanResponderMove: (_, { dy }) => {
        const { minRows: low, maxRows: high, pull: pulled } = latest.current;
        const wanted = drag.current.from + dy;
        const height = Math.min(trayHeight(high), Math.max(trayHeight(low), wanted));
        tray.setValue(height);
        if (pulled) {
          // Past the largest size, the tags follow the finger down instead.
          const past = Math.max(0, wanted - trayHeight(high));
          pulled.setValue(past);
          const folding = past > FOLD_PULL;
          if (folding !== drag.current.folding) {
            drag.current.folding = folding;
            if (folding) performAndroidHapticsAsync(AndroidHaptics.Confirm).catch(() => {});
          }
        }
        const row = nearest(height);
        if (row === drag.current.tick) return;
        drag.current.tick = row;
        performAndroidHapticsAsync(AndroidHaptics.Segment_Tick).catch(() => {});
      },
      onPanResponderRelease: (_, { dx, dy, vy }) => {
        const { maxRows: high, pull: pulled, onPullFold: fold } = latest.current;
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return latest.current.onTap();
        const past = drag.current.from + dy - trayHeight(high);
        const flicked = dy > DISMISS_DISTANCE && vy > DISMISS_FLICK;
        if (pulled && fold && (flicked || past > FOLD_PULL || (past > 0 && vy > FOLD_FLICK))) {
          fold(vy > FOLD_FLICK);
          // The tags carry on down from wherever the finger left them; once they're out of
          // sight, the pull resets (doing it on the way would push them back up mid-fall).
          Animated.sequence([
            Animated.delay(RESET_AFTER_MS),
            Animated.timing(pulled, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]).start();
          // The pot goes back to its size before the drag: passing through sizes isn't choosing one.
          return settle(nearest(drag.current.from));
        }
        springBack();
        settle(nearest(drag.current.from + dy));
      },
      onPanResponderTerminate: () => {
        springBack();
        settle(latest.current.rows);
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
      <View style={styles.bar} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    height: STRIP,
    alignSelf: 'center',
    minWidth: BAR * 3,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  bar: {
    width: BAR,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.raised,
  },
  label: {
    ...font.caption,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
