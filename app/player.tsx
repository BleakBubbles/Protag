import { router } from 'expo-router';
import { useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SongRow } from '@/db/types';
import { albumArtUri } from '@/library/assets';
import { openSongTags } from '@/navigation';
import { useNowPlaying, usePlaybackStatus, usePlayerActions } from '@/player/PlayerProvider';
import type { QueueState } from '@/player/queue';
import { EmptyState } from '@/ui/EmptyState';
import { formatCount } from '@/ui/format';
import { IconButton } from '@/ui/IconButton';
import { ArtworkSlot } from '@/ui/player/ArtworkSlot';
import { SeekBar } from '@/ui/player/SeekBar';
import { TrackInfo } from '@/ui/player/TrackInfo';
import { TransportControls } from '@/ui/player/TransportControls';
import { colors, font, spacing } from '@/ui/theme';

/** How far, or how fast, a downward drag must go to close the player. */
const CLOSE_DISTANCE = 120;
const CLOSE_VELOCITY = 1;

/**
 * The full player. Composition only: playback lives in PlayerProvider and the
 * pieces live in src/ui/player, so the layout can be rearranged freely.
 */
export default function PlayerScreen() {
  const { song, queue } = useNowPlaying();
  const insets = useSafeAreaInsets();

  if (!song) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <EmptyState icon="musical-notes-outline" title="Nothing playing" />
      </View>
    );
  }
  return <NowPlaying song={song} queue={queue} />;
}

function NowPlaying({ song, queue }: { song: SongRow; queue: QueueState }) {
  const status = usePlaybackStatus();
  const actions = usePlayerActions();
  const insets = useSafeAreaInsets();
  // Until the engine reports a duration, MediaStore's is close enough.
  const durationSec = status.durationSec > 0 ? status.durationSec : song.duration_ms / 1000;
  const sourceLabel = queue.source?.label ?? 'Songs';

  // Drag down from the top half to close, the way it slid up. Only the top half,
  // so it never fights the seek bar.
  const offset = useRef(new Animated.Value(0)).current;
  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_, g) => offset.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > CLOSE_DISTANCE || g.vy > CLOSE_VELOCITY) router.back();
        else Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: () => Animated.spring(offset, { toValue: 0, useNativeDriver: true }).start(),
    })
  ).current;

  return (
    // Not a ScrollView: everything but the artwork has a fixed height, and the
    // artwork takes the rest, so the screen always fits exactly.
    <Animated.View
      style={[
        styles.screen,
        styles.nowPlaying,
        { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xl },
        { transform: [{ translateY: offset }] },
      ]}
    >
      <View style={styles.dragArea} {...responder.panHandlers}>
        <View style={styles.topRow}>
          <IconButton icon="chevron-down" label="Close player" onPress={() => router.back()} />
          <Text style={styles.source} numberOfLines={1}>
            {queue.shuffled ? 'Shuffling' : 'Playing'} · {sourceLabel}
            <Text style={styles.position}>
              {'  '}
              {formatCount(queue.index + 1)} of {formatCount(queue.order.length)}
            </Text>
          </Text>
          {/* Tag while listening — the moment the opinion is fresh. */}
          <IconButton icon="pricetag-outline" label="Edit tags for this song" onPress={() => openSongTags(song.id)} />
        </View>
        <ArtworkSlot uri={albumArtUri(song.album_id)} />
      </View>

      <TrackInfo title={song.title} artist={song.artist} album={song.album} />
      <SeekBar positionSec={status.positionSec} durationSec={durationSec} onSeek={actions.seekTo} />
      <TransportControls
        playing={status.playing}
        shuffled={queue.shuffled}
        repeat={queue.repeat}
        onTogglePlay={actions.togglePlay}
        onNext={actions.next}
        onPrevious={actions.previous}
        onToggleShuffle={actions.toggleShuffle}
        onCycleRepeat={actions.cycleRepeat}
      />

      {status.error && <Text style={styles.error}>Couldn't play this song: {status.error}</Text>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  nowPlaying: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  dragArea: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  source: {
    ...font.label,
    color: colors.textDim,
    flex: 1,
    textAlign: 'center',
  },
  position: {
    ...font.numeric,
    color: colors.textFaint,
  },
  error: {
    ...font.body,
    color: colors.danger,
    textAlign: 'center',
  },
});
