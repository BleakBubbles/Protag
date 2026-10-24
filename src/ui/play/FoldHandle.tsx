import { useRef } from 'react';
import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../theme';
import { POT_ROW, trayHeight } from './Pot';

/** The strip it sits in: thin, so the tags below barely move for it. */
const STRIP = 20;
const BAR = 36;
/** How far a drag has to go, or how fast, to act. */
const DRAG = 32;
const FLICK = 0.4;
/** How much of the finger's travel the dragged thing follows: a little weight to it. */
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
 * The handle between the pot and the tag list: a divider. Drag it and the
 * pot's tray follows the finger, giving the pot more rows of tiles or the
 * tags more room; let go and it settles on the nearest whole row, with a tick
 * at each row on the way. Tap it to fold the tags away. (Dragging only ever
 * resizes, so a resize can never fold by accident.) In its own strip, outside
 * the scrolling list, so the drag is never mistaken for a scroll; its touch
 * area reaches well past the bar.
 */
export function FoldHandle({
  onFold,
  tray,
  rows,
  minRows,
  maxRows,
  onSettle,
}: {
  onFold: () => void;
  /** The tray's height, which the drag moves directly. */
  tray: Animated.Value;
  rows: number;
  minRows: number;
  maxRows: number;
  /** The row count it settled on after a resize, to keep. */
  onSettle: (rows: number) => void;
}) {
  const latest = useRef({ onFold, rows, minRows, maxRows, onSettle });
  latest.current = { onFold, rows, minRows, maxRows, onSettle };
  const drag = useRef({ from: 0, tick: rows });

  const nearest = (height: number) => {
    const { minRows: low, maxRows: high } = latest.current;
    return Math.min(high, Math.max(low, Math.round((height - trayHeight(1)) / POT_ROW) + 1));
  };
  const settle = (target: number) => {
    // Kept once it's landed, so the new row count can't cut the settling short.
    Animated.spring(tray, { toValue: trayHeight(target), useNativeDriver: false, bounciness: 0, speed: 8 }).start(() => {
      if (target !== latest.current.rows) latest.current.onSettle(target);
    });
  };

  const handlers = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        // From where the tray actually is: it may still be settling from the last drag.
        drag.current = { from: trayHeight(latest.current.rows), tick: latest.current.rows };
        tray.stopAnimation((height) => {
          drag.current = { from: height, tick: nearest(height) };
        });
      },
      onPanResponderMove: (_, { dy }) => {
        const { minRows: low, maxRows: high } = latest.current;
        const height = Math.min(trayHeight(high), Math.max(trayHeight(low), drag.current.from + dy));
        tray.setValue(height);
        const row = nearest(height);
        if (row === drag.current.tick) return;
        drag.current.tick = row;
        performAndroidHapticsAsync(AndroidHaptics.Segment_Tick).catch(() => {});
      },
      onPanResponderRelease: (_, { dx, dy }) => {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return latest.current.onFold();
        settle(nearest(drag.current.from + dy));
      },
      onPanResponderTerminate: () => settle(latest.current.rows),
    })
  ).current.panHandlers;

  return (
    <View
      {...handlers}
      hitSlop={{ top: spacing.sm, bottom: spacing.md, left: spacing.xl * 2, right: spacing.xl * 2 }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Divider between the mix and your tags"
      accessibilityValue={{ text: `${rows} ${rows === 1 ? 'row' : 'rows'}` }}
      accessibilityActions={[
        { name: 'increment', label: 'Bigger mix' },
        { name: 'decrement', label: 'More room for tags' },
        { name: 'activate', label: 'Done adding' },
      ]}
      onAccessibilityAction={(e) => {
        const { actionName } = e.nativeEvent;
        if (actionName === 'activate') return onFold();
        settle(Math.min(maxRows, Math.max(minRows, rows + (actionName === 'increment' ? 1 : -1))));
      }}
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
