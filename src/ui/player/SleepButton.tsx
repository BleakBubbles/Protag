import { StyleSheet, Text, View } from 'react-native';

import { useSleepTimer, type Sleep } from '@/player/sleepTimer';
import { IconButton } from '@/ui/IconButton';
import { useAnchor } from '@/ui/Popover';
import { PopupMenu, type MenuAction } from '@/ui/PopupMenu';
import { font } from '@/ui/theme';
import { makeStyles } from '@/ui/ThemeContext';

const CHOICES = [
  { label: '15 minutes', minutes: 15 },
  { label: '30 minutes', minutes: 30 },
  { label: '45 minutes', minutes: 45 },
  { label: '1 hour', minutes: 60 },
];

/** What the menu says above its choices: what a pick will do, or what's already set. */
function describe(sleep: Sleep): string {
  if (sleep.kind === 'end-of-song') return 'Pausing after this song';
  if (sleep.kind === 'timer') {
    const minutes = Math.max(1, Math.ceil((sleep.endsAt - Date.now()) / 60_000));
    return `Pausing in ${minutes} min`;
  }
  return 'Pause the music after';
}

/**
 * The sleep timer, in the player's top row: a moon, filled while a timer is
 * set, opening a menu of how long to play on (or to the end of the song).
 */
export function SleepButton() {
  const styles = useStyles();
  const anchor = useAnchor();
  const { sleep, sleepIn, sleepAtEndOfSong, cancel } = useSleepTimer();
  const on = sleep.kind !== 'off';

  const actions: MenuAction[] = [
    ...(on ? [{ label: 'Turn off timer', onPress: cancel }] : []),
    ...CHOICES.map(({ label, minutes }) => ({ label, onPress: () => sleepIn(minutes) })),
    { label: 'End of song', onPress: sleepAtEndOfSong },
  ];

  return (
    <>
      <View ref={anchor.ref} collapsable={false}>
        <IconButton
          icon={on ? 'moon' : 'moon-outline'}
          label={on ? describe(sleep) : 'Sleep timer'}
          active={on}
          onPress={anchor.open}
        />
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
  header: {
    ...font.caption,
    color: colors.textDim,
  },
}));
