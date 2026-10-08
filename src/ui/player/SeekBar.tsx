import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { formatTime } from '../format';
import { colors, font, radius, spacing, touchTarget } from '../theme';

export interface SeekBarProps {
  positionSec: number;
  durationSec: number;
  onSeek: (seconds: number) => void;
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));
/** Seconds moved by the accessibility increment/decrement actions. */
const A11Y_STEP_SEC = 10;
/** How long to keep showing a seek target while playback catches up. */
const PENDING_TIMEOUT_MS = 1500;

/**
 * Draggable progress bar, built on PanResponder rather than a slider library so
 * it needs no native module (no rebuild) and is fully restylable.
 */
export function SeekBar({ positionSec, durationSec, onSeek }: SeekBarProps) {
  const [width, setWidth] = useState(0);
  const [dragFraction, setDragFraction] = useState<number | null>(null);
  // After release, position lags until the next status update; hold the target
  // so the thumb doesn't snap back for half a second.
  const [pendingSec, setPendingSec] = useState<number | null>(null);

  // PanResponder is created once, so it reads the latest values through refs.
  const latest = useRef({ width, durationSec, onSeek });
  latest.current = { width, durationSec, onSeek };
  const grantX = useRef(0);
  const dragRef = useRef<number | null>(null);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => latest.current.durationSec > 0,
        onMoveShouldSetPanResponder: () => latest.current.durationSec > 0,
        onPanResponderGrant: (event) => {
          grantX.current = event.nativeEvent.locationX;
          dragRef.current = clamp(grantX.current / (latest.current.width || 1));
          setDragFraction(dragRef.current);
        },
        onPanResponderMove: (_, gesture) => {
          dragRef.current = clamp((grantX.current + gesture.dx) / (latest.current.width || 1));
          setDragFraction(dragRef.current);
        },
        onPanResponderRelease: () => {
          if (dragRef.current !== null) {
            const target = dragRef.current * latest.current.durationSec;
            setPendingSec(target);
            latest.current.onSeek(target);
          }
          dragRef.current = null;
          setDragFraction(null);
        },
        onPanResponderTerminate: () => {
          dragRef.current = null;
          setDragFraction(null);
        },
      }),
    []
  );

  useEffect(() => {
    if (pendingSec === null) return;
    if (Math.abs(positionSec - pendingSec) < 1) {
      setPendingSec(null);
      return;
    }
    const timer = setTimeout(() => setPendingSec(null), PENDING_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [positionSec, pendingSec]);

  const shownSec =
    dragFraction !== null ? dragFraction * durationSec : (pendingSec ?? positionSec);
  const fraction = durationSec > 0 ? clamp(shownSec / durationSec) : 0;

  return (
    <View style={styles.container}>
      <View
        style={styles.touchArea}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Seek"
        accessibilityValue={{ min: 0, max: Math.round(durationSec), now: Math.round(shownSec), text: formatTime(shownSec) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) =>
          onSeek(positionSec + (e.nativeEvent.actionName === 'increment' ? A11Y_STEP_SEC : -A11Y_STEP_SEC))
        }
        {...responder.panHandlers}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
        </View>
        <View
          style={[
            styles.thumb,
            dragFraction !== null && styles.thumbActive,
            { left: fraction * width - THUMB / 2 },
          ]}
        />
      </View>
      <View style={styles.times}>
        <Text style={styles.time}>{formatTime(shownSec)}</Text>
        <Text style={styles.time}>-{formatTime(durationSec - shownSec)}</Text>
      </View>
    </View>
  );
}

const THUMB = 14;

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    gap: spacing.xs,
  },
  touchArea: {
    height: touchTarget,
    justifyContent: 'center',
  },
  track: {
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accentFg,
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.text,
  },
  thumbActive: {
    transform: [{ scale: 1.3 }],
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    ...font.numeric,
    color: colors.textDim,
  },
});
