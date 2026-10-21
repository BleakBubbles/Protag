import { useState } from 'react';
import { StyleSheet, Text, View, type GestureResponderHandlers } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SongRow } from '@/db/types';
import { albumArtUri } from '@/library/assets';
import { openAlbum, openArtist, openSongTags } from '@/navigation';
import { useNowPlaying, usePlaybackStatus, usePlayerActions } from '@/player/PlayerProvider';
import type { QueueState } from '@/player/queue';
import { ActionSheet, type SheetAction } from '@/ui/ActionSheet';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { colors, font, spacing } from '@/ui/theme';
import { ArtworkSlot } from './ArtworkSlot';
import { SeekBar } from './SeekBar';
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

  // The artist · album line leads to their pages; with only one of them, straight there.
  const [goingTo, setGoingTo] = useState(false);
  const { artist, album, album_id: albumId } = song;
  const destinations: SheetAction[] = [
    ...(artist ? [{ label: `Go to ${artist}`, onPress: () => openArtist(artist) }] : []),
    ...(album && albumId ? [{ label: `Go to ${album}`, onPress: () => openAlbum(albumId) }] : []),
  ].map((d) => ({
    ...d,
    // Close the player first, so the page opens in view.
    onPress: () => {
      onClose();
      d.onPress();
    },
  }));
  const openDetails =
    destinations.length === 0 ? undefined : destinations.length === 1 ? destinations[0].onPress : () => setGoingTo(true);

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
          {/* Tag while listening — the moment the opinion is fresh. */}
          <IconButton icon="tag" label="Edit tags for this song" onPress={() => openSongTags(song.id)} />
        </View>
        <ArtworkSlot uri={albumArtUri(song.album_id)} />
      </View>

      <TrackInfo title={song.title} artist={song.artist} album={song.album} onPressSubtitle={openDetails} />
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
      <ActionSheet visible={goingTo} actions={destinations} onClose={() => setGoingTo(false)} />

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
  error: {
    ...font.body,
    color: colors.danger,
    textAlign: 'center',
  },
});
