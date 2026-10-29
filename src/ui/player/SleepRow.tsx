import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSleepTimer, type Sleep } from '@/player/sleepTimer';
import { feelStep } from '@/ui/haptics';
import { Icon } from '@/ui/Icon';
import { timing } from '@/ui/motion';
import { font, iconSize, radius, spacing, touchTarget } from '@/ui/theme';
import { makeStyles, useColors } from '@/ui/ThemeContext';

/**
 * The bar's stops, evenly spaced: off, then minutes, then the end of the song
 * last. Off to an hour is a time line, so a running timer's thumb slides back
 * along it towards Off as the time runs down.
 */
const STOPS = [
  { label: 'Off', minutes: 0 },
  { label: '15', minutes: 15 },
  { label: '30', minutes: 30 },
  { label: '45', minutes: 45 },
  { label: '1 h', minutes: 60 },
  { label: 'End of song', minutes: null },
] as const;
const LAST = STOPS.length - 1;
/** Where an hour sits on the bar, 0 to 1. */
const HOUR_AT = (LAST - 1) / LAST;
const THUMB = 18;
const TRACK = 4;
/** From the bar's touch edge (the card's edge) to its first and last stops. */
const INSET = spacing.md + THUMB / 2;

const minutesLeft = (endsAt: number) => Math.max(1, Math.ceil((endsAt - Date.now()) / 60_000));

/** What the row says on its right: off, or how long is left. */
function status(sleep: Sleep): string {
  if (sleep.kind === 'end-of-song') return 'End of song';
  if (sleep.kind === 'timer') return `${minutesLeft(sleep.endsAt)} min left`;
  return 'Off';
}

/** Where the timer's thumb is, 0 to 1: at the end for the song's end, along the hour by the time left. */
function placeOf(sleep: Sleep): number {
  if (sleep.kind === 'end-of-song') return 1;
  if (sleep.kind === 'timer') return (Math.min(60, Math.max(0, sleep.endsAt - Date.now()) / 60_000) / 60) * HOUR_AT;
  return 0;
}

/**
 * The sleep timer, at the top of the queue: when the music stops is part of
 * what's coming up. One line until it's tapped, as the queue is what's mostly
 * looked at here; then it opens in place to a bar to drag or tap, snapping to its stops (off, a
 * quarter hour at a time to an hour, the end of the song), set on letting go.
 * While a timer runs, the thumb slides back towards Off as it counts down.
 * The player's queue button wears a moon meanwhile, so it shows with the
 * queue closed too.
 */
export function SleepRow() {
  const colors = useColors();
  const styles = useStyles();
  const { sleep, sleepIn, sleepAtEndOfSong, cancel } = useSleepTimer();
  const [open, setOpen] = useState(false);
  const on = sleep.kind !== 'off';

  const shown = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    timing(shown, { toValue: open ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [open, shown]);

  // The minutes left tick down, and the thumb with them, while it shows.
  const [, tick] = useState(0);
  useEffect(() => {
    if (sleep.kind !== 'timer') return;
    const timer = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(timer);
  }, [sleep.kind]);

  /** The stop under the finger while it's down; null otherwise. */
  const [held, setHeld] = useState<number | null>(null);
  const width = useRef(0);
  const start = useRef(0);
  const stopAt = (x: number) => Math.round(Math.min(1, Math.max(0, (x - INSET) / Math.max(1, width.current - INSET * 2))) * LAST);

  const set = (i: number) => {
    const { minutes } = STOPS[i];
    if (minutes === null) sleepAtEndOfSong();
    else if (minutes === 0) cancel();
    else sleepIn(minutes);
  };
  // Latest for the gesture, which is made once.
  const latest = useRef({ set, held });
  latest.current = { set, held };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // The queue below mustn't take a sideways drag over.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        start.current = e.nativeEvent.locationX;
        setHeld(stopAt(start.current));
      },
      onPanResponderMove: (_, g) => {
        const i = stopAt(start.current + g.dx);
        setHeld((was) => {
          if (was !== i) feelStep();
          return i;
        });
      },
      onPanResponderRelease: (_, g) => {
        latest.current.set(stopAt(start.current + g.dx));
        setHeld(null);
      },
      onPanResponderTerminate: () => setHeld(null),
    })
  ).current;

  const place = held !== null ? held / LAST : placeOf(sleep);
  const current = STOPS.findIndex((s) => (sleep.kind === 'end-of-song' ? s.minutes === null : sleep.kind === 'off' && s.minutes === 0));
  const shownStop = held ?? (current >= 0 ? current : null);

  return (
    <View style={styles.box}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`Sleep timer, ${status(sleep)}`}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.top, pressed && styles.pressed]}
      >
        <Icon name={on ? 'moon' : 'moon-outline'} size={iconSize.sm} color={on ? colors.accentFg : colors.textDim} />
        <Text style={styles.label} numberOfLines={1}>
          Sleep timer
        </Text>
        <Text style={[styles.status, (on || held !== null) && styles.statusOn]} numberOfLines={1}>
          {held !== null ? (STOPS[held].minutes === null ? 'End of song' : STOPS[held].minutes === 0 ? 'Off' : `${STOPS[held].minutes} min`) : status(sleep)}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={iconSize.sm - 4} color={colors.textDim} />
      </Pressable>

      {open && (
        <Animated.View
          style={{ opacity: shown, transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [-spacing.sm, 0] }) }] }}
        >
          <View
            {...pan.panHandlers}
            onLayout={(e) => (width.current = e.nativeEvent.layout.width)}
            style={styles.bar}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Sleep timer"
            accessibilityValue={{ text: status(sleep) }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => {
              const from = Math.round(placeOf(sleep) * LAST);
              set(Math.min(LAST, Math.max(0, from + (e.nativeEvent.actionName === 'increment' ? 1 : -1))));
            }}
          >
            {/* None of it takes the touch, so the finger's place is the bar's, which reaches the card's edges. */}
            <View pointerEvents="none" style={styles.line}>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${place * 100}%` }]} />
              </View>
              {STOPS.map((stop, i) => (
                <View key={stop.label} style={[styles.dot, { left: `${(i / LAST) * 100}%` }, i / LAST <= place && styles.dotPassed]} />
              ))}
              <View style={[styles.thumb, { left: `${place * 100}%` }, held !== null && styles.thumbHeld]} />
            </View>
          </View>

          <View style={styles.labels} pointerEvents="none">
            {STOPS.map((stop, i) =>
              i === LAST ? (
                // The song's end is a note, centred under its stop rather than set in text.
                <View key={stop.label} style={[styles.stopNote, { left: '100%' }]}>
                  <Icon name="musical-note" size={NOTE} color={shownStop === i ? colors.accentFg : colors.textDim} />
                </View>
              ) : (
                <Text
                  key={stop.label}
                  numberOfLines={1}
                  style={[
                    styles.stopLabel,
                    i === 0 ? styles.alignStart : styles.alignMid,
                    { left: `${(i / LAST) * 100}%` },
                    shownStop === i && styles.stopLabelOn,
                  ]}
                >
                  {stop.label}
                </Text>
              )
            )}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const LABEL_W = 48;
const NOTE = 15;

const useStyles = makeStyles((colors) => StyleSheet.create({
  box: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 28,
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    ...font.label,
    flex: 1,
    color: colors.text,
  },
  status: {
    ...font.label,
    color: colors.textDim,
  },
  statusOn: {
    color: colors.accentFg,
  },
  // Tall enough to take a finger, and out to the card's edges so the end stops' thumbs are whole
  // to touch; the line itself is thin, in the middle.
  bar: {
    height: touchTarget - spacing.sm,
    justifyContent: 'center',
    marginHorizontal: -spacing.md,
    paddingHorizontal: INSET,
  },
  line: {
    justifyContent: 'center',
  },
  track: {
    height: TRACK,
    borderRadius: TRACK / 2,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accentFg,
  },
  dot: {
    position: 'absolute',
    width: 6,
    height: 6,
    marginLeft: -3,
    borderRadius: 3,
    backgroundColor: colors.textFaint,
  },
  dotPassed: {
    backgroundColor: colors.accentFg,
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    marginLeft: -THUMB / 2,
    borderRadius: THUMB / 2,
    backgroundColor: colors.accentFg,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  thumbHeld: {
    transform: [{ scale: 1.25 }],
  },
  labels: {
    height: 16,
    marginHorizontal: THUMB / 2,
  },
  stopLabel: {
    ...font.caption,
    position: 'absolute',
    width: LABEL_W,
    color: colors.textDim,
  },
  alignStart: {
    marginLeft: -THUMB / 2,
    textAlign: 'left',
  },
  alignMid: {
    marginLeft: -LABEL_W / 2,
    textAlign: 'center',
  },
  stopNote: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: NOTE,
    marginLeft: -NOTE / 2,
    justifyContent: 'center',
  },
  stopLabelOn: {
    color: colors.accentFg,
  },
}));
