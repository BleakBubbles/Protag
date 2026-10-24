import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { getArtist, listArtistAlbums, listArtistSongs } from '@/db/albums';
import { listAllSongTags } from '@/db/tags';
import { openAlbum } from '@/navigation';
import { CollectionSection, SongCollection } from '@/screens/library/SongCollection';
import { EmptyState } from '@/ui/EmptyState';
import { plural } from '@/ui/format';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { AlbumTile } from '@/ui/library/AlbumTile';
import { colors, spacing } from '@/ui/theme';

const ALBUM_SIZE = 128;

/** An artist: their albums as covers to dive into, then all their songs. */
export default function ArtistScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const { data } = useLibraryQuery(
    async (db) => {
      const [artist, albums, songs, tags] = await Promise.all([
        getArtist(db, name),
        listArtistAlbums(db, name),
        listArtistSongs(db, name),
        listAllSongTags(db),
      ]);
      return { artist, albums, songs, tags };
    },
    [name]
  );

  if (!data) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Stack.Screen options={{ title: '' }} />
        <ActivityIndicator color={colors.accentFg} />
      </View>
    );
  }
  const { artist, albums, songs, tags } = data;
  if (!artist) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState icon="person-outline" title="Artist not found" body="Their songs aren't on this phone any more." />
      </View>
    );
  }

  return (
    <SongCollection
      picture={{ albumId: artist.coverAlbumId, round: true }}
      title={artist.name}
      meta={[plural(artist.songs, 'song'), albums.length > 0 ? plural(albums.length, 'album') : null]
        .filter(Boolean)
        .join(' · ')}
      songs={songs}
      tags={tags}
      label={artist.name}
      inOrder={false}
      tagPrompt={`Tag songs by ${artist.name}`}
    >
      {albums.length > 0 && (
        <CollectionSection title="Albums">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albumRow}>
            {albums.map((album) => (
              <AlbumTile key={album.albumId} albumId={album.albumId} title={album.title} size={ALBUM_SIZE} onPress={openAlbum} />
            ))}
          </ScrollView>
        </CollectionSection>
      )}
    </SongCollection>
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
  },
  albumRow: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
});
