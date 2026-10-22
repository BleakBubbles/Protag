import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { listAlbums, listArtists } from '@/db/albums';
import { tapTag } from '@/query/pot';
import { albumRef, artistRef, type Ref } from '@/query/refs';
import { tagChoice } from '@/query/types';
import { plural } from '@/ui/format';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { MusicPicker, type PickerItem } from '@/ui/play/MusicPicker';
import { usePotDraft } from '@/ui/play/PotDraft';
import { colors, font, spacing } from '@/ui/theme';

/**
 * Every artist or album (the `kind` param), from the Shuffle tab's "All"
 * tiles: tap to put one in the pot or take it out, as on its tile there, and
 * pick as many as you like before going back.
 */
export default function PickMusicScreen() {
  const { kind } = useLocalSearchParams<{ kind: 'artists' | 'albums' }>();
  const albums = kind === 'albums';
  const [draft, setDraft] = usePotDraft();

  const { data: items } = useLibraryQuery(
    async (db): Promise<PickerItem[]> =>
      albums
        ? (await listAlbums(db)).map((a) => ({
            ref: albumRef(a.albumId),
            name: a.title,
            detail: a.artist ?? plural(a.songs, 'song'),
            cover: a.albumId,
            round: false,
          }))
        : (await listArtists(db)).map((a) => ({
            ref: artistRef(a.name),
            name: a.name,
            detail: plural(a.songs, 'song'),
            cover: a.coverAlbumId,
            round: true,
          })),
    [albums]
  );
  const choiceOf = useCallback((ref: Ref) => tagChoice(draft, ref), [draft]);
  const tap = useCallback((ref: Ref) => setDraft((current) => tapTag(current, ref)), [setDraft]);
  const title = albums ? 'Albums' : 'Artists';

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={spacing.sm} accessibilityRole="button" style={styles.done}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          ),
        }}
      />
      <MusicPicker title={title} items={items ?? []} choiceOf={choiceOf} onTap={tap} />
    </>
  );
}

const styles = StyleSheet.create({
  done: {
    paddingHorizontal: spacing.sm,
  },
  doneText: {
    ...font.label,
    color: colors.accentFg,
  },
});
