import { useRef, type ReactNode } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { albumArtUri } from '../../library/assets';
import { openPlayer, openSongTags } from '../../navigation';
import { useNowPlaying, usePlaybackStatus, usePlayerActions } from '../../player/PlayerProvider';
import { IconButton } from '../IconButton';
import { colors, font, iconSize, radius, spacing } from '../theme';
import { Artwork } from './Artwork';
import { useMiniPlayerVisibility } from './MiniPlayerVisibility';

export const MINI_PLAYER_HEIGHT = 64;
const THUMB = 44;
/** How far, or how fast, a downward swipe must go to put the mini-player away. */
const HIDE_DISTANCE = 32;
const HIDE_VELOCITY = 0.5;

/**
 * What's playing, from anywhere in the app: tap for the full player, tag the
 * song in place, or play/pause. Swipe it down to put it away while tagging;
 * the music keeps playing.
 */
export function MiniPlayer() {
  const { song } = useNowPlaying();
  const { visible, hintVisible, hide } = useMiniPlayerVisibility();

  if (hintVisible) {
    return (
      <View style={[styles.card, styles.hint]}>
        <Text style={styles.hintText}>Still playing. Open Play to bring the mini-player back.</Text>
      </View>
    );
  }
  if (!visible || !song) return null;

  return (
    <SwipeToHide onHide={hide}>
      <Pressable
        onPress={openPlayer}
        accessibilityRole="button"
        accessibilityLabel={`Now playing: ${song.title}. Open player`}
        accessibilityHint="Swipe down to hide"
        android_ripple={{ color: colors.border }}
        style={styles.row}
      >
        <Artwork uri={albumArtUri(song.album_id)} size={THUMB} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {song.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {song.artist ?? ' '}
          </Text>
        </View>
        {/* Tagging what's playing, from any screen, is the point of ProTag. */}
        <IconButton icon="pricetag-outline" label="Edit tags for this song" onPress={() => openSongTags(song.id)} />
        <PlayPause />
      </Pressable>
      <Progress fallbackDurationSec={song.duration_ms / 1000} />
    </SwipeToHide>
  );
}

/** Split out so twice-a-second status ticks only re-render the parts that change. */
function PlayPause() {
  const { playing } = usePlaybackStatus();
  const { togglePlay } = usePlayerActions();
  return (
    <IconButton
      icon={playing ? 'pause' : 'play'}
      label={playing ? 'Pause' : 'Play'}
      size={iconSize.md}
      color={colors.text}
      onPress={togglePlay}
    />
  );
}

function Progress({ fallbackDurationSec }: { fallbackDurationSec: number }) {
  const { positionSec, durationSec } = usePlaybackStatus();
  const total = durationSec > 0 ? durationSec : fallbackDurationSec;
  const fraction = total > 0 ? Math.min(1, positionSec / total) : 0;
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
    </View>
  );
}

/** Follows a downward drag, then either slides out and hides or springs back. */
function SwipeToHide({ onHide, children }: { onHide: () => void; children: ReactNode }) {
  const offset = useRef(new Animated.Value(0)).current;
  const responder = useRef(
    PanResponder.create({
      // Only clearly vertical, downward drags, taken from the row and buttons
      // underneath (capture phase); taps still reach them.
      onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => offset.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > HIDE_DISTANCE || g.vy > HIDE_VELOCITY) {
          Animated.timing(offset, { toValue: MINI_PLAYER_HEIGHT, duration: 150, useNativeDriver: true }).start(onHide);
        } else {
          Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start(),
    })
  ).current;

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        styles.card,
        {
          transform: [{ translateY: offset }],
          opacity: offset.interpolate({ inputRange: [0, MINI_PLAYER_HEIGHT], outputRange: [1, 0] }),
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    height: MINI_PLAYER_HEIGHT,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.sm + 2,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...font.listTitle,
    color: colors.text,
  },
  artist: {
    ...font.caption,
    color: colors.textDim,
  },
  track: {
    height: 2,
    backgroundColor: colors.border,
  },
  fill: {
    height: '100%',
    backgroundColor: colors.accentFg,
  },
  hint: {
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  hintText: {
    ...font.label,
    color: colors.textDim,
  },
});
