import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';

import { listAlbums } from '../../db/albums';
import { getSetting, SettingKey } from '../../db/settings';
import { matchesQuery, searchKey } from '../../library/search';
import { LIBRARY_MUSIC_SORTS, SORT_LABEL, sortMusic } from '../../library/sorts';
import { openAlbum } from '../../navigation';
import { EmptyState } from '../../ui/EmptyState';
import { plural } from '../../ui/format';
import { useLibraryQuery } from '../../ui/hooks/useLibraryQuery';
import { useSavedSort } from '../../ui/hooks/useSavedSort';
import { AlbumTile } from '../../ui/library/AlbumTile';
import { SectionHead } from '../../ui/play/SectionHead';
import { SearchField } from '../../ui/SearchField';
import { spacing } from '../../ui/theme';
import { makeStyles } from '../../ui/ThemeContext';

const COLUMNS = 2;
const GAP = spacing.lg;

/** Every album as its cover, two to a row, in the order picked above them. Tap one for its tracklist. */
export function AlbumsView() {
  const styles = useStyles();
  const { data } = useLibraryQuery(
    async (db) => {
      const [albums, sort] = await Promise.all([listAlbums(db), getSetting(db, SettingKey.albumsSort)]);
      return { albums, sort };
    },
    []
  );
  const [sort, nextSort] = useSavedSort(SettingKey.albumsSort, LIBRARY_MUSIC_SORTS, data?.sort);
  const screen = useWindowDimensions();
  const [query, setQuery] = useState('');
  const size = (screen.width - spacing.lg * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  const searchable = useMemo(
    () => sortMusic(data?.albums ?? [], sort, (a) => a.title).map((album) => ({ album, key: searchKey([album.title, album.artist]) })),
    [data, sort]
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
          {data && <SectionHead label={plural(data.albums.length, 'album')} sort={SORT_LABEL[sort]} onSort={nextSort} />}
        </View>
      }
      ListEmptyComponent={
        data && trimmed ? (
          <EmptyState icon="search" title="No matches" body={`No album matches "${trimmed}".`} />
        ) : data ? (
          <EmptyState icon="disc-outline" title="No albums" body="Albums show up here when your music files name them." />
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
    gap: spacing.sm,
  },
}));
