import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { listArtists } from '../../db/albums';
import { getSetting, SettingKey } from '../../db/settings';
import { matchesQuery, searchKey } from '../../library/search';
import { LIBRARY_MUSIC_SORTS, SORT_LABEL, sortMusic } from '../../library/sorts';
import { openArtist } from '../../navigation';
import { EmptyState } from '../../ui/EmptyState';
import { plural } from '../../ui/format';
import { useFixedRowLayout } from '../../ui/hooks/useFixedRowLayout';
import { useLibraryQuery } from '../../ui/hooks/useLibraryQuery';
import { useSavedSort } from '../../ui/hooks/useSavedSort';
import { ARTIST_ROW_HEIGHT, ArtistRow } from '../../ui/library/ArtistRow';
import { SectionHead } from '../../ui/play/SectionHead';
import { SearchField } from '../../ui/SearchField';
import { spacing } from '../../ui/theme';
import { makeStyles } from '../../ui/ThemeContext';

/** Every artist, in the order picked above the list. Tap one for their albums and songs. */
export function ArtistsView() {
  const styles = useStyles();
  const { data } = useLibraryQuery(
    async (db) => {
      const [artists, sort] = await Promise.all([listArtists(db), getSetting(db, SettingKey.artistsSort)]);
      return { artists, sort };
    },
    []
  );
  const [sort, nextSort] = useSavedSort(SettingKey.artistsSort, LIBRARY_MUSIC_SORTS, data?.sort);
  const { getItemLayout, onHeaderLayout } = useFixedRowLayout(ARTIST_ROW_HEIGHT);
  const [query, setQuery] = useState('');

  const searchable = useMemo(
    () => sortMusic(data?.artists ?? [], sort, (a) => a.name).map((artist) => ({ artist, key: searchKey([artist.name]) })),
    [data, sort]
  );
  const trimmed = query.trim();
  const visible = useMemo(
    () => searchable.filter((a) => !trimmed || matchesQuery(a.key, trimmed)).map((a) => a.artist),
    [searchable, trimmed]
  );

  return (
    <FlatList
      style={styles.screen}
      data={visible}
      keyExtractor={(artist) => artist.name}
      getItemLayout={getItemLayout}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      renderItem={({ item }) => <ArtistRow artist={item} onPress={openArtist} />}
      ListHeaderComponent={
        <View style={styles.header} onLayout={onHeaderLayout}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search artists" />
          {data && <SectionHead label={plural(data.artists.length, 'artist')} sort={SORT_LABEL[sort]} onSort={nextSort} />}
        </View>
      }
      ListEmptyComponent={
        data && trimmed ? (
          <EmptyState icon="search" title="No matches" body={`No artist matches "${trimmed}".`} />
        ) : data ? (
          <EmptyState icon="person-outline" title="No artists" body="Artists show up here when your music files name them." />
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
  header: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
}));
