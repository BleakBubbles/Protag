import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { listAllSongs } from '../../db/songs';
import { listAllSongTags } from '../../db/tags';
import type { TagRow } from '../../db/types';
import { albumArtUri } from '../../library/assets';
import { matchesQuery, searchKey } from '../../library/search';
import { openSongTags } from '../../navigation';
import { useNowPlaying, usePlayerActions } from '../../player/PlayerProvider';
import { EmptyState } from '../../ui/EmptyState';
import { plural } from '../../ui/format';
import { useLibraryQuery } from '../../ui/hooks/useLibraryQuery';
import { SONG_ROW_HEIGHT, SongRow } from '../../ui/library/SongRow';
import { SearchField } from '../../ui/SearchField';
import { colors, font, spacing } from '../../ui/theme';

const NO_TAGS: readonly TagRow[] = [];

/** Every song, with its tags inline. Tap to play from there; tap the tag icon to edit. */
export function SongsView() {
  const { data } = useLibraryQuery(async (db) => {
    const [songs, tags] = await Promise.all([listAllSongs(db), listAllSongTags(db)]);
    return { songs, tags };
  }, []);
  const [query, setQuery] = useState('');
  const { playQueue } = usePlayerActions();
  const { song: current, queue } = useNowPlaying();

  // Normalize each song once per load, not once per keystroke.
  const searchable = useMemo(
    () => (data?.songs ?? []).map((song) => ({ song, key: searchKey([song.title, song.artist, song.album]) })),
    [data]
  );
  const trimmed = query.trim();
  const visible = useMemo(
    () =>
      trimmed
        ? searchable.filter((s) => matchesQuery(s.key, trimmed)).map((s) => s.song)
        : searchable.map((s) => s.song),
    [searchable, trimmed]
  );

  // Plays the list as shown — filtered or not — from the tapped song, keeping
  // whatever shuffle mode the player is already in.
  const play = useCallback(
    (id: number) =>
      playQueue(
        visible.map((s) => s.id),
        { startId: id, shuffle: queue.shuffled, label: trimmed ? `"${trimmed}"` : 'All songs' }
      ),
    [playQueue, visible, queue.shuffled, trimmed]
  );

  return (
    <FlatList
      data={visible}
      keyExtractor={(song) => String(song.id)}
      getItemLayout={(_, index) => ({ length: SONG_ROW_HEIGHT, offset: SONG_ROW_HEIGHT * index, index })}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      renderItem={({ item }) => (
        <SongRow
          id={item.id}
          title={item.title}
          artist={item.artist}
          artworkUri={albumArtUri(item.album_id)}
          tags={data?.tags.get(item.id) ?? NO_TAGS}
          active={current?.id === item.id}
          onPress={play}
          onEditTags={openSongTags}
        />
      )}
      ListHeaderComponent={
        <View style={styles.header}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            placeholder="Search songs, artists, albums"
            returnKeyType="search"
          />
          {data && (
            <Text style={styles.count}>
              {trimmed
                ? `${plural(visible.length, 'match', 'matches')} of ${plural(data.songs.length, 'song')}`
                : plural(data.songs.length, 'song')}
            </Text>
          )}
        </View>
      }
      ListEmptyComponent={
        data && trimmed ? (
          <EmptyState icon="search" title="No matches" body={`Nothing matches "${trimmed}".`} />
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  count: {
    ...font.caption,
    color: colors.textFaint,
  },
});
