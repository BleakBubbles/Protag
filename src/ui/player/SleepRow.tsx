import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSleepTimer, type Sleep } from '@/player/sleepTimer';
import { Icon } from '@/ui/Icon';
import { useAnchor } from '@/ui/Popover';
import { PopupMenu, type MenuAction } from '@/ui/PopupMenu';
import { font, iconSize, radius, spacing, touchTarget } from '@/ui/theme';
import { makeStyles, useColors } from '@/ui/ThemeContext';

const CHOICES = [
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  { label: '45 minutes', minutes: 45 },
  { label: '1 hour', minutes: 60 },
];

const minutesLeft = (endsAt: number) => Math.max(1, Math.ceil((endsAt - Date.now()) / 60_000));

/** What the menu says above its choices: what a pick will do, or what's already set. */
function describe(sleep: Sleep): string {
  if (sleep.kind === 'end-of-song') return 'Pausing after this song';
  if (sleep.kind === 'timer') return `Pausing in ${minutesLeft(sleep.endsAt)} min`;
  return 'Pause the music after';
}

/** What the row says on its right: off, or how long is left. */
function status(sleep: Sleep): string {
  if (sleep.kind === 'end-of-song') return 'End of song';
  if (sleep.kind === 'timer') return `${minutesLeft(sleep.endsAt)} min left`;
  return 'Off';
}

/**
 * The sleep timer, at the top of the queue: when the music stops is part of
 * what's coming up. Tapping it opens a menu of how long to play on (or to the
 * end of the song); while one is set, it counts down. The player's queue
 * button wears a moon meanwhile, so it shows with the queue closed too.
 */
export function SleepRow() {
  const colors = useColors();
  const styles = useStyles();
  const anchor = useAnchor();
  const { sleep, sleepIn, sleepAtEndOfSong, cancel } = useSleepTimer();
  const on = sleep.kind !== 'off';

  // The minutes left tick down while it shows.
  const [, tick] = useState(0);
  useEffect(() => {
    if (sleep.kind !== 'timer') return;
    const timer = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(timer);
  }, [sleep.kind]);

  const actions: MenuAction[] = [
    ...(on ? [{ label: 'Turn off timer', onPress: cancel }] : []),
    ...CHOICES.map(({ label, minutes }) => ({ label, onPress: () => sleepIn(minutes) })),
    { label: 'End of song', onPress: sleepAtEndOfSong },
  ];

  return (
    <>
      <View ref={anchor.ref} collapsable={false}>
        <Pressable
          onPress={anchor.open}
          accessibilityRole="button"
          accessibilityLabel={on ? `Sleep timer, ${describe(sleep)}` : 'Sleep timer, off'}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Icon name={on ? 'moon' : 'moon-outline'} size={iconSize.sm} color={on ? colors.accentFg : colors.textDim} />
          <Text style={styles.label} numberOfLines={1}>
            Sleep timer
          </Text>
          <Text style={[styles.status, on && styles.statusOn]} numberOfLines={1}>
            {status(sleep)}
          </Text>
        </Pressable>
      </View>
      <PopupMenu
        anchor={anchor.rect}
        actions={actions}
        onClose={anchor.close}
        header={<Text style={styles.header}>{describe(sleep)}</Text>}
      />
    </>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
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
  header: {
    ...font.caption,
    color: colors.textDim,
  },
}));
