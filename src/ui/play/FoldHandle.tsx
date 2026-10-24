import { useRef } from 'react';
import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../theme';
import { POT_ROW } from './Pot';

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
 * The handle between the pot and the tag list: a divider. Drag it to give the
 * pot more rows of tiles or the tags more room, a row at a time with a tick
 * for each; tap it to fold the tags away. (Dragging only ever resizes, so a
 * resize can never fold by accident.) In its own strip, outside the scrolling
 * list, so the drag is never mistaken for a scroll; its touch area reaches
 * well past the bar.
 */
export function FoldHandle({
  onFold,
  rows,
  minRows,
  maxRows,
  onRows,
  onSettle,
}: {
  onFold: () => void;
  rows: number;
  minRows: number;
  maxRows: number;
  /** While dragging, each time the row count changes. */
  onRows: (rows: number) => void;
  /** When let go after a resize, to keep it. */
  onSettle: (rows: number) => void;
}) {
  const latest = useRef({ onFold, rows, minRows, maxRows, onRows, onSettle });
  latest.current = { onFold, rows, minRows, maxRows, onRows, onSettle };
  const drag = useRef({ from: rows, at: rows });
  const handlers = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        drag.current = { from: latest.current.rows, at: latest.current.rows };
      },
      onPanResponderMove: (_, { dy }) => {
        const { minRows: low, maxRows: high } = latest.current;
        const next = Math.min(high, Math.max(low, drag.current.from + Math.round(dy / POT_ROW)));
        if (next === drag.current.at) return;
        drag.current.at = next;
        latest.current.onRows(next);
        performAndroidHapticsAsync(AndroidHaptics.Segment_Tick).catch(() => {});
      },
      onPanResponderRelease: (_, { dx, dy }) => {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return latest.current.onFold();
        if (drag.current.at !== drag.current.from) latest.current.onSettle(drag.current.at);
      },
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
        const next = Math.min(maxRows, Math.max(minRows, rows + (actionName === 'increment' ? 1 : -1)));
        if (next !== rows) {
          onRows(next);
          onSettle(next);
        }
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
