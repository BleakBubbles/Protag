import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { countSongs } from '@/db/songs';
import { listTags } from '@/db/tags';
import { colors, font, radius, spacing } from '@/ui/theme';

/**
 * Library screen.
 *
 * Currently a smoke test: it proves migrations ran and the repositories work
 * against the real on-device database. The Tags/Songs views replace this next.
 */
export default function LibraryScreen() {
  const db = useSQLiteContext();
  const [counts, setCounts] = useState<{ songs: number; tags: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [songs, tags] = await Promise.all([countSongs(db), listTags(db)]);
        if (!cancelled) setCounts({ songs, tags: tags.length });
      })();
      return () => {
        cancelled = true;
      };
    }, [db])
  );

  if (!counts) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Database</Text>
        <Text style={styles.cardValue}>
          {counts.songs} {counts.songs === 1 ? 'song' : 'songs'}
        </Text>
        <Text style={styles.cardValue}>
          {counts.tags} {counts.tags === 1 ? 'tag' : 'tags'}
        </Text>
      </View>
      <Text style={styles.note}>
        Schema is live. Library scanning, the tag tree, and the query builder come next.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardLabel: {
    ...font.caption,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardValue: {
    ...font.heading,
    color: colors.text,
  },
  note: {
    ...font.body,
    color: colors.textDim,
  },
});
