import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listAlbumTitles } from '@/db/albums';
import { buildDescendantMap, listTags } from '@/db/tags';
import type { SongRow } from '@/db/types';
import { albumArtUri } from '@/library/assets';
import { usePlayerActions } from '@/player/PlayerProvider';
import { queueForQuery } from '@/player/sources';
import { describeQuery } from '@/query/describe';
import type { Ref } from '@/query/refs';
import { findSongs } from '@/query/run';
import { buildQuery, pruneDraft } from '@/query/types';
import { FilterChip } from '@/ui/FilterChip';
import { plural } from '@/ui/format';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { usePotDraft } from '@/ui/play/PotDraft';
import { Artwork } from '@/ui/player/Artwork';
import { colors, font, spacing } from '@/ui/theme';

const ROW_HEIGHT = 60;
const THUMB = 44;

/**
 * Every song the Shuffle tab's pot would play, however many: the list only
 * draws what's on screen. Filters narrow it to one ingredient (a tag, or a
 * combination), which is also how to see what a single tag holds. Tap a song
 * to shuffle the pot from it. `label`, when given, is the name it plays under
 * (an unchanged mix's).
 */
export default function PotPreviewScreen() {
  const { label } = useLocalSearchParams<{ label?: string }>();
  const db = useSQLiteContext();
  const [potDraft] = usePotDraft();
  const { playQueue } = usePlayerActions();

  // Names for describing it, and the tags that still exist, so a deleted one drops out as in the pot.
  const { data: library } = useLibraryQuery(async (db) => {
    const [tags, albumTitles, descendants] = await Promise.all([listTags(db), listAlbumTitles(db), buildDescendantMap(db)]);
    return {
      names: new Map<Ref, string>([...tags.map((t) => [t.id, t.name] as const), ...albumTitles]),
      tagIds: new Set(tags.map((t) => t.id)),
      descendants,
    };
  }, []);
  const draft = useMemo(() => (library ? pruneDraft(potDraft, library.tagIds) : potDraft), [potDraft, library]);

  /** -1 for everything, else an ingredient's index. */
  const [filter, setFilter] = useState(-1);
  const [songs, setSongs] = useState<SongRow[] | null>(null);
  useEffect(() => {
    if (!library) return;
    let live = true;
    const ingredient = draft.ingredients[filter];
    // Exclusions still apply, so the list is what would actually play.
    const query = buildQuery(ingredient ? { ...draft, ingredients: [ingredient] } : draft);
    findSongs(db, query, { order: 'artist', descendants: library.descendants }).then((found) => live && setSongs(found));
    return () => {
      live = false;
    };
  }, [db, draft, filter, library]);

  const names = library?.names ?? new Map<Ref, string>();
  const spoken = (tags: readonly Ref[]) => tags.map((ref) => names.get(ref) ?? '').join(' × ');

  const play = async (songId: number) => {
    const request = await queueForQuery(db, buildQuery(draft));
    playQueue(request.ids, { startId: songId, shuffle: true, label: label ?? request.label, draft });
    router.back();
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Preview' }} />
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {library ? describeQuery(buildQuery(draft), names) : ' '}
        </Text>
        <Text style={styles.count}>{songs ? plural(songs.length, 'song') : ' '}</Text>
      </View>

      {draft.ingredients.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersRow} contentContainerStyle={styles.filters}>
          <FilterChip label="All" selected={filter === -1} onToggle={() => setFilter(-1)} />
          {draft.ingredients.map((tags, i) => (
            <FilterChip key={tags.join()} label={spoken(tags)} selected={filter === i} onToggle={() => setFilter(i)} />
          ))}
        </ScrollView>
      )}

      <FlatList
        data={songs ?? []}
        keyExtractor={(song) => String(song.id)}
        getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
        initialNumToRender={12}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => play(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}${item.artist ? ` by ${item.artist}` : ''}`}
            accessibilityHint="Shuffles the mix, starting with this song"
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Artwork uri={albumArtUri(item.album_id)} size={THUMB} />
            <View style={styles.text}>
              <Text style={styles.songTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {item.artist ?? ' '}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: 2,
  },
  title: {
    ...font.heading,
    color: colors.text,
  },
  count: {
    ...font.label,
    color: colors.textDim,
  },
  filtersRow: {
    flexGrow: 0,
  },
  filters: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pressed: {
    backgroundColor: colors.surfaceAlt,
  },
  text: {
    flex: 1,
  },
  songTitle: {
    ...font.listTitle,
    color: colors.text,
    includeFontPadding: false,
  },
  artist: {
    ...font.caption,
    color: colors.textDim,
    includeFontPadding: false,
  },
});
