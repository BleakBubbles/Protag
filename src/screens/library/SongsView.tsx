import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { listAllSongs } from '../../db/songs';
import { listAllSongTags } from '../../db/tags';
import type { TagRow } from '../../db/types';
import { albumArtUri } from '../../library/assets';
import { matchesQuery, searchKey } from '../../library/search';
import { useNowPlaying, usePlayerActions } from '../../player/PlayerProvider';
import { EmptyState } from '../../ui/EmptyState';
import { plural } from '../../ui/format';
import { useFixedRowLayout } from '../../ui/hooks/useFixedRowLayout';
import { useLibraryQuery } from '../../ui/hooks/useLibraryQuery';
import type { SongSelection } from '../../ui/hooks/useSongSelection';
import { SELECTION_BAR_HEIGHT, SelectionBar } from '../../ui/library/SelectionBar';
import { SONG_ROW_HEIGHT, SongRow } from '../../ui/library/SongRow';
import { SearchField } from '../../ui/SearchField';
import { font, spacing } from '../../ui/theme';
import { makeStyles } from '../../ui/ThemeContext';

const NO_TAGS: readonly TagRow[] = [];

export interface SongsViewProps {
  /** Owned by the Library screen, which shows its header while selecting. */
  selection: SongSelection;
  /** Reports the songs as listed (search applied), so selection knows what "all" is. */
  onSongs: (songIds: readonly number[]) => void;
}

/**
 * Every song, with its tags inline. Tap to play from there; press and hold
 * to start selecting, then Tag… to tag them (one or many).
 */
export function SongsView({ selection, onSongs }: SongsViewProps) {
  const styles = useStyles();
  const { data } = useLibraryQuery(async (db) => {
    const [songs, tags] = await Promise.all([listAllSongs(db), listAllSongTags(db)]);
    return { songs, tags };
  }, []);
  const [query, setQuery] = useState('');
  const { getItemLayout, onHeaderLayout } = useFixedRowLayout(SONG_ROW_HEIGHT);
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

  const visibleIds = useMemo(() => visible.map((s) => s.id), [visible]);
  useEffect(() => onSongs(visibleIds), [visibleIds, onSongs]);
  const { selecting, selected, toggle } = selection;

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
    <>
      <FlatList
        data={visible}
        keyExtractor={(song) => String(song.id)}
        getItemLayout={getItemLayout}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        extraData={selection.selection}
        contentContainerStyle={selecting ? { paddingBottom: SELECTION_BAR_HEIGHT } : undefined}
        renderItem={({ item }) => (
          <SongRow
            id={item.id}
            title={item.title}
            artist={item.artist}
            artworkUri={albumArtUri(item.album_id)}
            tags={data?.tags.get(item.id) ?? NO_TAGS}
            active={current?.id === item.id}
            selecting={selecting}
            selected={selection.selection?.has(item.id) ?? false}
            onPress={selecting ? toggle : play}
            onLongPress={toggle}
          />
        )}
        ListHeaderComponent={
          <View style={styles.header} onLayout={onHeaderLayout}>
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
          ) : undefined
        }
      />
      {selecting && (
        <SelectionBar disabled={selected.length === 0} actions={[{ label: 'Tag…', icon: 'tags', onPress: selection.editTags }, ...selection.queueActions]} />
      )}
    </>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  count: {
    ...font.caption,
    color: colors.textFaint,
  },
}));
