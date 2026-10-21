import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { getAlbum, listAlbumSongs } from '@/db/albums';
import { listAllSongTags } from '@/db/tags';
import { openArtist } from '@/navigation';
import { SongCollection } from '@/screens/library/SongCollection';
import { EmptyState } from '@/ui/EmptyState';
import { plural } from '@/ui/format';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { colors } from '@/ui/theme';

/** An album: its cover, its artist (a link), and its tracklist in order. */
export default function AlbumScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data } = useLibraryQuery(
    async (db) => {
      const [album, songs, tags] = await Promise.all([getAlbum(db, id), listAlbumSongs(db, id), listAllSongTags(db)]);
      return { album, songs, tags };
    },
    [id]
  );

  if (!data) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Stack.Screen options={{ title: '' }} />
        <ActivityIndicator color={colors.accentFg} />
      </View>
    );
  }
  const { album, songs, tags } = data;
  if (!album) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState icon="disc-outline" title="Album not found" body="Its songs aren't on this phone any more." />
      </View>
    );
  }

  const artist = album.artist;
  return (
    <SongCollection
      picture={{ albumId: album.albumId }}
      title={album.title}
      subtitle={artist ? { label: artist, onPress: () => openArtist(artist) } : undefined}
      meta={plural(songs.length, 'song')}
      songs={songs}
      tags={tags}
      label={album.title}
    />
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
});
