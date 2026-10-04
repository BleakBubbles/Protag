import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { countSongs } from '@/db/songs';
import { listTagsWithCounts } from '@/db/tags';
import type { SongRow, TagWithCounts } from '@/db/types';
import { albumArtUri } from '@/library/assets';
import {
  usePlaybackStatus,
  usePlayerActions,
  useNowPlaying,
  usePlayQuery,
} from '@/player/PlayerProvider';
import type { QueueState } from '@/player/queue';
import { MATCH_ALL } from '@/query/types';
import { Button } from '@/ui/Button';
import { formatCount, plural } from '@/ui/format';
import { Artwork } from '@/ui/player/Artwork';
import { SeekBar } from '@/ui/player/SeekBar';
import { TrackInfo } from '@/ui/player/TrackInfo';
import { TransportControls } from '@/ui/player/TransportControls';
import { TagChip } from '@/ui/TagChip';
import { colors, font, spacing } from '@/ui/theme';

/**
 * Player screen. Composition only: playback lives in PlayerProvider and the
 * pieces live in src/ui/player, so the layout can be rearranged freely.
 */
export default function PlayerScreen() {
  const { song, queue } = useNowPlaying();
  return song ? <NowPlayingView song={song} queue={queue} /> : <QuickStart />;
}

function NowPlayingView({ song, queue }: { song: SongRow; queue: QueueState }) {
  const status = usePlaybackStatus();
  const actions = usePlayerActions();
  const { width, height } = useWindowDimensions();

  // Big on a phone, but never so big the controls get pushed off a short screen.
  const artSize = Math.min(width - spacing.xl * 2, height * 0.42);
  // Until the engine reports a duration, MediaStore's is close enough.
  const durationSec = status.durationSec > 0 ? status.durationSec : song.duration_ms / 1000;
  const sourceLabel = queue.source?.label ?? 'Songs';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.nowPlaying}>
      <Text style={styles.source} numberOfLines={1}>
        {queue.shuffled ? 'Shuffling' : 'Playing'} · {sourceLabel}
        <Text style={styles.position}>
          {'  '}
          {formatCount(queue.index + 1)} of {formatCount(queue.order.length)}
        </Text>
      </Text>

      <Artwork uri={albumArtUri(song.album_id)} size={artSize} />
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
    </ScrollView>
  );
}

/**
 * What to play when nothing is. A minimal stand-in for the query builder
 * (task 7): shuffle everything, or any one tag including its subtags.
 */
function QuickStart() {
  const db = useSQLiteContext();
  const playQuery = usePlayQuery();
  const [library, setLibrary] = useState<{ songs: number; tags: TagWithCounts[] } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      Promise.all([countSongs(db), listTagsWithCounts(db, null)]).then(([songs, tags]) => {
        if (!cancelled) setLibrary({ songs, tags: tags.filter((t) => t.song_count > 0) });
      });
      return () => {
        cancelled = true;
      };
    }, [db])
  );

  if (!library) return <View style={styles.screen} />;

  if (library.songs === 0) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Ionicons name="musical-notes-outline" size={64} color={colors.textFaint} />
        <Text style={styles.title}>No music yet</Text>
        <Text style={styles.body}>Scan your music from the Library tab to get started.</Text>
        <Button label="Go to Library" onPress={() => router.navigate('/library')} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.quickStart}>
      <Text style={styles.title}>Nothing playing</Text>
      <Button
        label={`Shuffle everything · ${plural(library.songs, 'song')}`}
        onPress={() => playQuery(MATCH_ALL)}
      />

      {library.tags.length > 0 && (
        <View style={styles.tagSection}>
          <Text style={styles.sectionLabel}>Or shuffle a tag</Text>
          <View style={styles.chips}>
            {library.tags.map((tag) => (
              <TagChip
                key={tag.id}
                name={tag.name}
                count={tag.song_count}
                onPress={() => playQuery({ type: 'tag', tagId: tag.id, includeDescendants: true })}
              />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  nowPlaying: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  source: {
    ...font.label,
    color: colors.textDim,
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  position: {
    ...font.numeric,
    color: colors.textFaint,
  },
  quickStart: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: {
    ...font.title,
    color: colors.text,
  },
  body: {
    ...font.body,
    color: colors.textDim,
    textAlign: 'center',
  },
  tagSection: {
    gap: spacing.md,
  },
  sectionLabel: {
    ...font.caption,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  error: {
    ...font.body,
    color: colors.danger,
    textAlign: 'center',
  },
});
