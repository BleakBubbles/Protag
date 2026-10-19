import { useRef, type ReactNode } from 'react';
import { Animated, Dimensions, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { albumArtUri } from '../../library/assets';
import { openSongTags } from '../../navigation';
import { useNowPlaying, usePlaybackStatus, usePlayerActions } from '../../player/PlayerProvider';
import { IconButton } from '../IconButton';
import { colors, font, iconSize, radius, spacing } from '../theme';
import { Artwork } from './Artwork';
import { useMiniPlayerVisibility } from './MiniPlayerVisibility';
import { usePlayerSheet, type PlayerSheetControls } from './PlayerSheet';

export const MINI_PLAYER_HEIGHT = 64;
const THUMB = 44;
/** How far, or how fast, a swipe must go to count: sideways needs more room than vertical. */
const HIDE_DISTANCE = 64;
const VERTICAL_DISTANCE = 32;
const HIDE_VELOCITY = 0.5;
/** Slide-out distance: the card ends up past the screen edge. */
const SLIDE_OUT = Dimensions.get('window').width;

/**
 * What's playing, from anywhere in the app: tap for the full player, play/pause,
 * skip, or tag the song in place. Swipe it down, left or right to put it away
 * while tagging (the music keeps playing); swipe up for the full player.
 */
export function MiniPlayer() {
  const { song } = useNowPlaying();
  const { visible, hintVisible, hide } = useMiniPlayerVisibility();
  const sheet = usePlayerSheet();

  if (hintVisible) {
    return (
      <View style={[styles.card, styles.hint]}>
        <Text style={styles.hintText}>Still playing. Open Play to bring the mini-player back.</Text>
      </View>
    );
  }
  if (!visible || !song) return null;

  return (
    <SwipeGestures onHide={hide} sheet={sheet}>
      <Pressable
        onPress={sheet.expand}
        accessibilityRole="button"
        accessibilityLabel={`Now playing: ${song.title}. Open player`}
        accessibilityHint="Swipe up to expand, or down, left or right to hide"
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
        <PlayPause />
        <NextTrack />
        {/* Tagging what's playing, from any screen, is the point of ProTag. */}
        <IconButton icon="tag" label="Edit tags for this song" onPress={() => openSongTags(song.id)} />
      </Pressable>
      <Progress fallbackDurationSec={song.duration_ms / 1000} />
    </SwipeGestures>
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

function NextTrack() {
  const { next } = usePlayerActions();
  return <IconButton icon="play-skip-forward" label="Next track" size={iconSize.md} color={colors.text} onPress={next} />;
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

/**
 * Swipe down, left or right and the card follows your finger, then slides out
 * and hides (or springs back if you let go early). Swipe up and the full player
 * follows your finger instead, growing out of the card. The direction is locked
 * when the drag starts.
 */
function SwipeGestures({
  onHide,
  sheet,
  children,
}: {
  onHide: () => void;
  sheet: PlayerSheetControls;
  children: ReactNode;
}) {
  const offset = useRef(new Animated.ValueXY()).current;
  const direction = useRef<'sideways' | 'down' | 'up'>('down');
  const springBack = () => Animated.spring(offset, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
  const slideOut = (x: number, y: number) =>
    Animated.timing(offset, { toValue: { x, y }, duration: 150, useNativeDriver: true }).start(onHide);

  const responder = useRef(
    PanResponder.create({
      // Any clear drag, taken from the row and buttons underneath (capture
      // phase); taps still reach them.
      onMoveShouldSetPanResponderCapture: (_, g) => {
        if (Math.max(Math.abs(g.dx), Math.abs(g.dy)) <= 8) return false;
        direction.current = Math.abs(g.dx) > Math.abs(g.dy) ? 'sideways' : g.dy > 0 ? 'down' : 'up';
        return true;
      },
      onPanResponderGrant: () => {
        if (direction.current === 'up') sheet.beginDrag();
      },
      onPanResponderMove: (_, g) => {
        if (direction.current === 'up') sheet.dragBy(g.dy);
        else if (direction.current === 'sideways') offset.setValue({ x: g.dx, y: 0 });
        else offset.setValue({ x: 0, y: Math.max(0, g.dy) });
      },
      onPanResponderRelease: (_, g) => {
        if (direction.current === 'up') {
          sheet.endDrag(g.vy);
        } else if (direction.current === 'sideways' && (Math.abs(g.dx) > HIDE_DISTANCE || Math.abs(g.vx) > HIDE_VELOCITY)) {
          slideOut(g.dx > 0 ? SLIDE_OUT : -SLIDE_OUT, 0);
        } else if (direction.current === 'down' && (g.dy > VERTICAL_DISTANCE || g.vy > HIDE_VELOCITY)) {
          slideOut(0, MINI_PLAYER_HEIGHT);
        } else {
          springBack();
        }
      },
      onPanResponderTerminate: () => (direction.current === 'up' ? sheet.endDrag(0) : springBack()),
    })
  ).current;

  // Fade out as the card leaves in any direction.
  const opacity = Animated.multiply(
    offset.x.interpolate({ inputRange: [-SLIDE_OUT, 0, SLIDE_OUT], outputRange: [0, 1, 0] }),
    offset.y.interpolate({
      inputRange: [0, MINI_PLAYER_HEIGHT],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    })
  );

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[styles.card, { transform: offset.getTranslateTransform(), opacity }]}
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
