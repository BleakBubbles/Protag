import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { buildDescendantMap } from '../../db/tags';
import type { SongRow } from '../../db/types';
import { albumArtUri } from '../../library/assets';
import { findSongs } from '../../query/run';
import type { Ref } from '../../query/refs';
import { buildQuery, type QueryDraft } from '../../query/types';
import { BottomSheet } from '../BottomSheet';
import { FilterChip } from '../FilterChip';
import { plural } from '../format';
import { Artwork } from '../player/Artwork';
import { colors, font, spacing } from '../theme';

const ROW_HEIGHT = 60;
const THUMB = 44;

export interface PreviewSheetProps {
  visible: boolean;
  draft: QueryDraft;
  /** The whole pot in words: "kpop × chill + lofi, not sad". */
  description: string;
  names: ReadonlyMap<Ref, string>;
  onClose: () => void;
  /** Shuffle the whole pot, starting with this song. */
  onPlay: (songId: number) => void;
}

/**
 * Every song the pot would play, however many: the list only draws what's on
 * screen. Filters narrow it to one ingredient (a tag, or a combination), which
 * is also how to see what a single tag holds. Tap a song to shuffle from it.
 */
export function PreviewSheet({ visible, draft, description, names, onClose, onPlay }: PreviewSheetProps) {
  const db = useSQLiteContext();
  const screen = useWindowDimensions();
  /** -1 for everything, else an ingredient's index. */
  const [filter, setFilter] = useState(-1);
  const [songs, setSongs] = useState<SongRow[] | null>(null);

  // Back to everything each time it opens, without a flash of the last pot's songs.
  useEffect(() => {
    if (!visible) return;
    setFilter(-1);
    setSongs(null);
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    const ingredient = draft.ingredients[filter];
    // Exclusions still apply, so the list is what would actually play.
    const query = buildQuery(ingredient ? { ...draft, ingredients: [ingredient] } : draft);
    buildDescendantMap(db)
      .then((descendants) => findSongs(db, query, { order: 'artist', descendants }))
      .then((found) => live && setSongs(found));
    return () => {
      live = false;
    };
  }, [db, draft, filter, visible]);

  const spoken = (tags: readonly Ref[]) => tags.map((ref) => names.get(ref) ?? '').join(' × ');

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* A fixed height, so switching filters never resizes the sheet. */}
      <View style={{ height: screen.height * 0.62 }}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2}>
            {description}
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
              onPress={() => {
                onClose();
                onPlay(item.id);
              }}
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
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
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
