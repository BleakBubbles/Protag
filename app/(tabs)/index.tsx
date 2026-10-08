import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { countSongs } from '@/db/songs';
import { listTagsWithCounts } from '@/db/tags';
import type { SongRow } from '@/db/types';
import { albumArtUri } from '@/library/assets';
import { openLibrary, openSongTags } from '@/navigation';
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
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { IconButton } from '@/ui/IconButton';
import { ArtworkSlot } from '@/ui/player/ArtworkSlot';
import { SeekBar } from '@/ui/player/SeekBar';
import { TrackInfo } from '@/ui/player/TrackInfo';
import { TransportControls } from '@/ui/player/TransportControls';
import { TagChip } from '@/ui/TagChip';
import { colors, font, spacing, touchTarget } from '@/ui/theme';

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
  // Until the engine reports a duration, MediaStore's is close enough.
  const durationSec = status.durationSec > 0 ? status.durationSec : song.duration_ms / 1000;
  const sourceLabel = queue.source?.label ?? 'Songs';

  return (
    // Not a ScrollView: everything but the artwork has a fixed height, and the
    // artwork takes the rest, so the screen always fits exactly.
    <View style={[styles.screen, styles.nowPlaying]}>
      <View style={styles.topRow}>
        {/* Balances the button on the right so the text stays centred. */}
        <View style={styles.topRowSpacer} />
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

/**
 * What to play when nothing is. A minimal stand-in for the query builder
 * (task 7): shuffle everything, or any one tag including its subtags.
 */
function QuickStart() {
  const playQuery = usePlayQuery();
  const { data: library } = useLibraryQuery(async (db) => {
    const [songs, tags] = await Promise.all([countSongs(db), listTagsWithCounts(db, null)]);
    return { songs, tags: tags.filter((t) => t.song_count > 0) };
  }, []);

  if (!library) return <View style={styles.screen} />;

  if (library.songs === 0) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Ionicons name="musical-notes-outline" size={64} color={colors.textFaint} />
        <Text style={styles.title}>No music yet</Text>
        <Text style={styles.body}>Scan your music from the Library tab to get started.</Text>
        <Button label="Go to Library" onPress={openLibrary} />
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
                color={tag.color}
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
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.lg,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  topRowSpacer: {
    width: touchTarget,
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
