import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { BackHandler, StyleSheet, Text, View, type GestureResponderHandlers } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SongRow } from '@/db/types';
import { albumArtUri } from '@/library/assets';
import { openAlbum, openArtist, openTag } from '@/navigation';
import { useNowPlaying, usePlaybackStatus, usePlayerActions } from '@/player/PlayerProvider';
import { shuffleModeOf, shuffleModesOf, type QueueState } from '@/player/queue';
import { EmptyState } from '@/ui/EmptyState';
import { IconButton } from '@/ui/IconButton';
import { font, spacing } from '@/ui/theme';
import { makeStyles } from '@/ui/ThemeContext';
import { ArtworkSlot } from './ArtworkSlot';
import { QueueList } from './QueueList';
import { SeekBar } from './SeekBar';
import { SleepButton } from './SleepButton';
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
  const styles = useStyles();
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
  const styles = useStyles();
  const status = usePlaybackStatus();
  const actions = usePlayerActions();
  const insets = useSafeAreaInsets();
  // Until the engine reports a duration, MediaStore's is close enough.
  const durationSec = status.durationSec > 0 ? status.durationSec : song.duration_ms / 1000;

  // Each name under the title opens its page; the player closes first, so the page opens in view.
  const { artist, album_id: albumId } = song;

  // The queue shows where the artwork was; everything else stays put.
  const [showQueue, setShowQueue] = useState(false);
  // Back puts the artwork back before it closes the player.
  useFocusEffect(
    useCallback(() => {
      if (!showQueue) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setShowQueue(false);
        return true;
      });
      return () => sub.remove();
    }, [showQueue])
  );

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
      {/* Drag-to-close stays off the queue, which scrolls. */}
      <View style={showQueue ? styles.topArea : styles.dragArea} {...dragHandlers}>
        <View style={styles.topRow}>
          <IconButton icon="chevron-down" label="Close player" onPress={onClose} />
          <SourceLine queue={queue} />
          <SleepButton />
          <IconButton
            icon="queue"
            label={showQueue ? 'Hide queue' : 'Show queue'}
            active={showQueue}
            onPress={() => setShowQueue((shown) => !shown)}
          />
        </View>
        {!showQueue && <ArtworkSlot uri={albumArtUri(song.album_id)} />}
      </View>
      {showQueue && <QueueList queue={queue} />}

      <TrackInfo
        title={song.title}
        artist={song.artist}
        album={song.album}
        onPressArtist={artist ? () => openArtist(artist, true) : undefined}
        onPressAlbum={albumId ? () => openAlbum(albumId, true) : undefined}
      />
      <SongTagsRow songId={song.id} onOpenTag={(tagId) => openTag(tagId, true)} />
      <SeekBar positionSec={status.positionSec} durationSec={durationSec} onSeek={actions.seekTo} />
      <TransportControls
        playing={status.playing}
        shuffle={shuffleModeOf(queue)}
        modes={shuffleModesOf(queue.source)}
        repeat={queue.repeat}
        onTogglePlay={actions.togglePlay}
        onNext={actions.next}
        onPrevious={actions.previous}
        onToggleShuffle={actions.toggleShuffle}
        onCycleRepeat={actions.cycleRepeat}
      />

      {status.error && <Text style={styles.error}>{status.error}</Text>}
    </View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
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
  topArea: {
    alignSelf: 'stretch',
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
}));
