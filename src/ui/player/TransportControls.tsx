import { StyleSheet, Text, View } from 'react-native';

import type { RepeatMode } from '../../player/queue';
import { IconButton } from '../IconButton';
import { colors, font, iconSize } from '../theme';

export interface TransportControlsProps {
  playing: boolean;
  shuffled: boolean;
  repeat: RepeatMode;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
}

const REPEAT_LABEL: Record<RepeatMode, string> = {
  off: 'Repeat off',
  all: 'Repeat all',
  one: 'Repeat one',
};

export function TransportControls({
  playing,
  shuffled,
  repeat,
  onTogglePlay,
  onNext,
  onPrevious,
  onToggleShuffle,
  onCycleRepeat,
}: TransportControlsProps) {
  return (
    <View style={styles.row}>
      <IconButton
        icon="shuffle"
        label={shuffled ? 'Shuffle on' : 'Shuffle off'}
        active={shuffled}
        color={shuffled ? undefined : colors.textFaint}
        onPress={onToggleShuffle}
      />
      <IconButton icon="play-skip-back" label="Previous" size={iconSize.lg} onPress={onPrevious} />
      <IconButton
        icon={playing ? 'pause-circle' : 'play-circle'}
        label={playing ? 'Pause' : 'Play'}
        size={iconSize.hero}
        color={colors.text}
        onPress={onTogglePlay}
      />
      <IconButton icon="play-skip-forward" label="Next" size={iconSize.lg} onPress={onNext} />
      <IconButton
        icon="repeat"
        label={REPEAT_LABEL[repeat]}
        active={repeat !== 'off'}
        color={repeat === 'off' ? colors.textFaint : undefined}
        onPress={onCycleRepeat}
        badge={repeat === 'one' ? <Text style={styles.badge}>1</Text> : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
  },
  badge: {
    ...font.caption,
    fontSize: 9,
    color: colors.accentFg,
  },
});
