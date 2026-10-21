import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { nextRepeatMode, nextShuffleMode, type RepeatMode, type ShuffleMode } from '../../player/queue';
import { IconButton } from '../IconButton';
import { colors, font, iconSize, radius, spacing } from '../theme';

export interface TransportControlsProps {
  playing: boolean;
  shuffle: ShuffleMode;
  repeat: RepeatMode;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  /** Cycles off → songs → albums → off. */
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
}

const REPEAT_LABEL: Record<RepeatMode, string> = {
  off: 'Repeat off',
  all: 'Repeat all',
  one: 'Repeat one',
};

const SHUFFLE_LABEL: Record<ShuffleMode, string> = {
  off: 'Shuffle off',
  songs: 'Shuffle: songs',
  albums: 'Shuffle: albums',
};

/** How long a mode's name stays up after a tap, in ms. */
const SAY_MS = 1400;

export function TransportControls({
  playing,
  shuffle,
  repeat,
  onTogglePlay,
  onNext,
  onPrevious,
  onToggleShuffle,
  onCycleRepeat,
}: TransportControlsProps) {
  const { said, say } = useSaying();
  const shuffled = shuffle !== 'off';

  return (
    <View style={styles.wrap}>
      <Said text={said} />
      <View style={styles.row}>
        <IconButton
          icon="shuffle"
          label={SHUFFLE_LABEL[shuffle]}
          active={shuffled}
          color={shuffled ? undefined : colors.textFaint}
          onPress={() => {
            onToggleShuffle();
            say(SHUFFLE_LABEL[nextShuffleMode(shuffle)]);
          }}
          badge={shuffle === 'albums' ? <Ionicons name="disc" size={10} color={colors.accentFg} /> : null}
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
          onPress={() => {
            onCycleRepeat();
            say(REPEAT_LABEL[nextRepeatMode(repeat)]);
          }}
          badge={repeat === 'one' ? <Text style={styles.badge}>1</Text> : null}
        />
      </View>
    </View>
  );
}

/**
 * A mode's name, shown briefly after a tap: the shuffle and repeat buttons
 * cycle through several modes, and this says which one you landed on.
 */
function useSaying() {
  const [said, setSaid] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const say = (text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setSaid(text);
    timer.current = setTimeout(() => setSaid(null), SAY_MS);
  };
  return { said, say };
}

/** Floats above the controls (never shifting them), fading in and out. */
function Said({ text }: { text: string | null }) {
  const opacity = useRef(new Animated.Value(0)).current;
  // Keeps the last words on screen while they fade out.
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (text) setShown(text);
    Animated.timing(opacity, { toValue: text ? 1 : 0, duration: 150, useNativeDriver: true }).start();
  }, [text, opacity]);

  return (
    <Animated.View pointerEvents="none" style={[styles.said, { opacity }]} accessibilityLiveRegion="polite">
      <Text style={styles.saidText}>{shown}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'stretch',
  },
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
  said: {
    position: 'absolute',
    top: -spacing.xl - spacing.sm,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.raised,
  },
  saidText: {
    ...font.label,
    color: colors.text,
  },
});
