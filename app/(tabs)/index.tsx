import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { countSongs } from '@/db/songs';
import { listTagsWithCounts } from '@/db/tags';
import { openLibrary } from '@/navigation';
import { useNowPlaying, usePlayQuery } from '@/player/PlayerProvider';
import { MATCH_ALL } from '@/query/types';
import { Button } from '@/ui/Button';
import { plural } from '@/ui/format';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { useMiniPlayerVisibility } from '@/ui/player/MiniPlayerVisibility';
import { TagChip } from '@/ui/TagChip';
import { colors, font, spacing } from '@/ui/theme';

/**
 * Play tab: start something. What's playing lives in the mini-player and the
 * full player it opens, so this tab is only about choosing.
 */
export default function PlayScreen() {
  const { song } = useNowPlaying();
  const { show } = useMiniPlayerVisibility();
  // Opening Play is how a hidden mini-player comes back.
  useFocusEffect(useCallback(() => show(), [show]));
  return <QuickStart playing={Boolean(song)} />;
}

/**
 * A minimal stand-in for the query builder (task 7): shuffle everything, or
 * any one tag including its subtags.
 */
function QuickStart({ playing }: { playing: boolean }) {
  const playQuery = usePlayQuery();
  const { data: library } = useLibraryQuery(async (db) => {
    const [songs, tags] = await Promise.all([countSongs(db), listTagsWithCounts(db, null)]);
    return { songs, tags: tags.filter((t) => t.song_count > 0) };
  }, []);

  if (!library) return <View style={styles.screen} />;

  if (library.songs === 0) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Ionicons name="musical-notes-outline" size={64} color={colors.textFaint} />
        <Text style={styles.title}>No music yet</Text>
        <Text style={styles.body}>Scan your music from the Library tab to get started.</Text>
        <Button label="Go to Library" onPress={openLibrary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.quickStart}>
      {!playing && <Text style={styles.title}>Nothing playing</Text>}
      <Button
        label={`Shuffle everything · ${plural(library.songs, 'song')}`}
        onPress={() => playQuery(MATCH_ALL)}
      />

      {library.tags.length > 0 && (
        <View style={styles.tagSection}>
          <Text style={styles.sectionLabel}>Or shuffle a tag</Text>
          <View style={styles.chips}>
            {library.tags.map((tag) => (
              <TagChip
                key={tag.id}
                name={tag.name}
                color={tag.color}
                count={tag.song_count}
                onPress={() => playQuery({ type: 'tag', tagId: tag.id, includeDescendants: true })}
              />
            ))}
          </View>
        </View>
      )}
    </ScrollView>
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
    padding: spacing.xl,
    gap: spacing.md,
  },
  quickStart: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  title: {
    ...font.title,
    color: colors.text,
  },
  body: {
    ...font.body,
    color: colors.textDim,
    textAlign: 'center',
  },
  tagSection: {
    gap: spacing.md,
  },
  sectionLabel: {
    ...font.caption,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
