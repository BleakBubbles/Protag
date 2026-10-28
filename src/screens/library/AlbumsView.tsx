import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';

import { listAlbums } from '../../db/albums';
import { matchesQuery, searchKey } from '../../library/search';
import { openAlbum } from '../../navigation';
import { EmptyState } from '../../ui/EmptyState';
import { useLibraryQuery } from '../../ui/hooks/useLibraryQuery';
import { AlbumTile } from '../../ui/library/AlbumTile';
import { SearchField } from '../../ui/SearchField';
import { spacing } from '../../ui/theme';
import { makeStyles, useColors } from '../../ui/ThemeContext';

const COLUMNS = 2;
const GAP = spacing.lg;

/** Every album as its cover, two to a row. Tap one for its tracklist. */
export function AlbumsView() {
  const styles = useStyles();
  const { data } = useLibraryQuery(listAlbums, []);
  const screen = useWindowDimensions();
  const [query, setQuery] = useState('');
  const size = (screen.width - spacing.lg * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  const searchable = useMemo(
    () => (data ?? []).map((album) => ({ album, key: searchKey([album.title, album.artist]) })),
    [data]
  );
  const trimmed = query.trim();
  const visible = useMemo(
    () => searchable.filter((a) => !trimmed || matchesQuery(a.key, trimmed)).map((a) => a.album),
    [searchable, trimmed]
  );

  return (
    <FlatList
      style={styles.screen}
      data={visible}
      numColumns={COLUMNS}
      keyExtractor={(album) => album.albumId}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.content}
      renderItem={({ item }) => (
        <AlbumTile albumId={item.albumId} title={item.title} artist={item.artist} size={size} onPress={openAlbum} />
      )}
      ListHeaderComponent={
        <View style={styles.header}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search albums" />
        </View>
      }
      ListEmptyComponent={
        data && trimmed ? (
          <EmptyState icon="search" title="No matches" body={`No album matches "${trimmed}".`} />
        ) : data ? (
          <EmptyState icon="disc-outline" title="No albums" body="None of the songs on this phone say which album they're from." />
        ) : undefined
      }
    />
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: GAP,
  },
  row: {
    gap: GAP,
  },
  header: {
    paddingTop: spacing.lg,
  },
}));
