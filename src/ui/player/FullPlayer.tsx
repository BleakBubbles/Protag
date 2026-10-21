import { StyleSheet, Text, View, type GestureResponderHandlers } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SongRow } from '@/db/types';
import { albumArtUri } from '@/library/assets';
import { openAlbum, openArtist, openTag } from '@/navigation';
import { useNowPlaying, usePlaybackStatus, usePlayerActions } from '@/player/PlayerProvider';
import { shuffleModeOf, type QueueState } from '@/player/queue';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { colors, font, spacing, touchTarget } from '@/ui/theme';
import { ArtworkSlot } from './ArtworkSlot';
import { SeekBar } from './SeekBar';
import { SongTagsRow } from './SongTagsRow';
import { SourceLine } from './SourceLine';
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

  // Each name under the title opens its page; the player closes first, so the page opens in view.
  const { artist, album_id: albumId } = song;
  const goTo = (open: () => void) => () => {
    onClose();
    open();
  };

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
          <SourceLine queue={queue} onClose={onClose} />
          {/* Free for now (tagging moved under the title); it keeps the pill centred. */}
          <View style={styles.topSpacer} />
        </View>
        <ArtworkSlot uri={albumArtUri(song.album_id)} />
      </View>

      <TrackInfo
        title={song.title}
        artist={song.artist}
        album={song.album}
        onPressArtist={artist ? goTo(() => openArtist(artist)) : undefined}
        onPressAlbum={albumId ? goTo(() => openAlbum(albumId)) : undefined}
      />
      <SongTagsRow songId={song.id} onOpenTag={(tagId) => goTo(() => openTag(tagId))()} />
      <SeekBar positionSec={status.positionSec} durationSec={durationSec} onSeek={actions.seekTo} />
      <TransportControls
        playing={status.playing}
        shuffle={shuffleModeOf(queue)}
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
  topSpacer: {
    width: touchTarget,
  },
  error: {
    ...font.body,
    color: colors.danger,
    textAlign: 'center',
  },
});
