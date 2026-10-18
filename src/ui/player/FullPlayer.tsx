import { StyleSheet, Text, View, type GestureResponderHandlers } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SongRow } from '@/db/types';
import { albumArtUri } from '@/library/assets';
import { openSongTags } from '@/navigation';
import { useNowPlaying, usePlaybackStatus, usePlayerActions } from '@/player/PlayerProvider';
import type { QueueState } from '@/player/queue';
import { EmptyState } from '@/ui/EmptyState';
import { formatCount } from '@/ui/format';
import { IconButton } from '@/ui/IconButton';
import { colors, font, spacing } from '@/ui/theme';
import { ArtworkSlot } from './ArtworkSlot';
import { SeekBar } from './SeekBar';
import { TrackInfo } from './TrackInfo';
import { TransportControls } from './TransportControls';

export interface FullPlayerProps {
  onClose: () => void;
  /** Drag-to-close, attached to the top half only so it never fights the seek bar. */
  dragHandlers: GestureResponderHandlers;
}

/**
 * The full player. Composition only: playback lives in PlayerProvider, the
 * pieces live alongside this file, and PlayerSheet moves it on and off screen.
 */
export function FullPlayer(props: FullPlayerProps) {
  const { song, queue } = useNowPlaying();
  const insets = useSafeAreaInsets();

  if (!song) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <EmptyState icon="musical-notes-outline" title="Nothing playing" />
      </View>
    );
  }
  return <NowPlaying song={song} queue={queue} {...props} />;
}

function NowPlaying({ song, queue, onClose, dragHandlers }: FullPlayerProps & { song: SongRow; queue: QueueState }) {
  const status = usePlaybackStatus();
  const actions = usePlayerActions();
  const insets = useSafeAreaInsets();
  // Until the engine reports a duration, MediaStore's is close enough.
  const durationSec = status.durationSec > 0 ? status.durationSec : song.duration_ms / 1000;
  const sourceLabel = queue.source?.label ?? 'Songs';

  return (
    // Not a ScrollView: everything but the artwork has a fixed height, and the
    // artwork takes the rest, so the screen always fits exactly.
    <View
      style={[
        styles.screen,
        styles.nowPlaying,
        { paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.xl },
      ]}
    >
      <View style={styles.dragArea} {...dragHandlers}>
        <View style={styles.topRow}>
          <IconButton icon="chevron-down" label="Close player" onPress={onClose} />
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
    </View>
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
