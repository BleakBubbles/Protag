import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSleepTimer, type Sleep } from '@/player/sleepTimer';
import { Icon } from '@/ui/Icon';
import { timing } from '@/ui/motion';
import { font, iconSize, radius, spacing, touchTarget } from '@/ui/theme';
import { makeStyles, useColors } from '@/ui/ThemeContext';

const CHOICES = [15, 30, 45, 60];
const MOON = iconSize.sm;
const CHIP = 32;

/**
 * How long the timer was set for, to show how much of it is left. Kept here,
 * not in the native player: set again in this run of the app, it's exact; if
 * the app was closed in between, the shortest choice that holds what's left
 * stands in.
 */
let setForMs: number | null = null;
const totalOf = (remainingMs: number) =>
  setForMs !== null && setForMs >= remainingMs
    ? setForMs
    : (CHOICES.find((m) => m * 60_000 >= remainingMs) ?? CHOICES[CHOICES.length - 1]) * 60_000;

const minutesLeft = (endsAt: number) => Math.max(1, Math.ceil((endsAt - Date.now()) / 60_000));

/** What the row says on its right: off, or how long is left. */
function status(sleep: Sleep): string {
  if (sleep.kind === 'end-of-song') return 'End of song';
  if (sleep.kind === 'timer') return `${minutesLeft(sleep.endsAt)} min left`;
  return 'Off';
}

/** How much of the timer is left, 0 to 1; a song's end counts as all of it. */
function leftOf(sleep: Sleep): number {
  if (sleep.kind === 'end-of-song') return 1;
  if (sleep.kind === 'timer') {
    const remaining = Math.max(0, sleep.endsAt - Date.now());
    return Math.min(1, remaining / totalOf(remaining));
  }
  return 0;
}

/**
 * The sleep timer, at the top of the queue: when the music stops is part of
 * what's coming up. Tapping it opens it in place to a row of choices; once
 * one's set, its moon wanes and a bar under it drains as the time runs down.
 * The player's queue button wears a moon meanwhile, so it shows with the
 * queue closed too.
 */
export function SleepRow() {
  const colors = useColors();
  const styles = useStyles();
  const { sleep, sleepIn, sleepAtEndOfSong, cancel } = useSleepTimer();
  const [open, setOpen] = useState(false);
  const on = sleep.kind !== 'off';

  // The minutes left tick down, and the moon wanes, while it shows.
  const [, tick] = useState(0);
  useEffect(() => {
    if (sleep.kind !== 'timer') return;
    const timer = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(timer);
  }, [sleep.kind]);

  const shown = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    timing(shown, { toValue: open ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [open, shown]);

  const pick = (choose: () => void) => {
    choose();
    setOpen(false);
  };
  const chosen = sleep.kind === 'timer' ? totalOf(Math.max(0, sleep.endsAt - Date.now())) / 60_000 : null;
  const left = leftOf(sleep);

  return (
    <View style={styles.box}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`Sleep timer, ${status(sleep)}`}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        {on ? <WaningMoon left={left} /> : <Icon name="moon-outline" size={MOON} color={colors.textDim} />}
        <Text style={styles.label} numberOfLines={1}>
          Sleep timer
        </Text>
        <Text style={[styles.status, on && styles.statusOn]} numberOfLines={1}>
          {status(sleep)}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={iconSize.sm - 4} color={colors.textDim} />
      </Pressable>

      {open && (
        <Animated.View
          style={[
            styles.choices,
            { opacity: shown, transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [-spacing.sm, 0] }) }] },
          ]}
        >
          {CHOICES.map((minutes) => (
            <Choice
              key={minutes}
              label={minutes === 60 ? '1 hour' : `${minutes} min`}
              selected={chosen === minutes}
              onPress={() =>
                pick(() => {
                  setForMs = minutes * 60_000;
                  sleepIn(minutes);
                })
              }
            />
          ))}
          <Choice label="End of song" selected={sleep.kind === 'end-of-song'} onPress={() => pick(sleepAtEndOfSong)} />
          {on && <Choice label="Off" selected={false} onPress={() => pick(cancel)} />}
        </Animated.View>
      )}

      {sleep.kind === 'timer' && (
        <View style={styles.drain}>
          <View style={[styles.drained, { width: `${left * 100}%` }]} />
        </View>
      )}
    </View>
  );
}

function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={(touchTarget - CHIP) / 2}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && styles.pressed]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

/**
 * A moon that wanes as the timer runs down: full when set, a thinning
 * crescent towards the end. A disc in the accent, with one in the row's own
 * colour sliding across it.
 */
function WaningMoon({ left }: { left: number }) {
  const colors = useColors();
  const styles = useStyles();
  // Never quite gone while it runs: the last sliver stays.
  const shift = MOON * (0.18 + 0.82 * left);
  return (
    <View style={styles.moon}>
      <View style={[styles.disc, { backgroundColor: colors.accentFg }]} />
      <View style={[styles.disc, { backgroundColor: colors.surface, transform: [{ translateX: shift }] }]} />
    </View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  box: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
  },
  pressed: {
    opacity: 0.7,
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
  choices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  chip: {
    height: CHIP,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: {
    backgroundColor: colors.accentFg,
    borderColor: colors.accentFg,
  },
  chipText: {
    ...font.label,
    color: colors.text,
  },
  chipTextOn: {
    color: colors.bg,
  },
  drain: {
    height: 3,
    backgroundColor: colors.border,
  },
  drained: {
    height: '100%',
    backgroundColor: colors.accentFg,
  },
  moon: {
    width: MOON,
    height: MOON,
    borderRadius: MOON / 2,
    overflow: 'hidden',
  },
  disc: {
    position: 'absolute',
    width: MOON,
    height: MOON,
    borderRadius: MOON / 2,
  },
}));
