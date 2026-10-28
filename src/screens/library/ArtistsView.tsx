import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { listArtists } from '../../db/albums';
import { matchesQuery, searchKey } from '../../library/search';
import { openArtist } from '../../navigation';
import { EmptyState } from '../../ui/EmptyState';
import { useFixedRowLayout } from '../../ui/hooks/useFixedRowLayout';
import { useLibraryQuery } from '../../ui/hooks/useLibraryQuery';
import { ARTIST_ROW_HEIGHT, ArtistRow } from '../../ui/library/ArtistRow';
import { SearchField } from '../../ui/SearchField';
import { spacing } from '../../ui/theme';
import { makeStyles } from '../../ui/ThemeContext';

/** Every artist, A to Z. Tap one for their albums and songs. */
export function ArtistsView() {
  const styles = useStyles();
  const { data } = useLibraryQuery(listArtists, []);
  const { getItemLayout, onHeaderLayout } = useFixedRowLayout(ARTIST_ROW_HEIGHT);
  const [query, setQuery] = useState('');

  const searchable = useMemo(
    () => (data ?? []).map((artist) => ({ artist, key: searchKey([artist.name]) })),
    [data]
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
  },
}));
