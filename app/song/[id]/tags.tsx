import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { notifyLibraryChanged } from '@/db/changes';
import { getSong } from '@/db/songs';
import {
  addTagToSong,
  ensureTagPath,
  getTagsForSong,
  listRecentTags,
  listTags,
  parseTagPath,
  removeTagFromSong,
} from '@/db/tags';
import { matchesQuery, searchKey } from '@/library/search';
import { buildTagIndex, PATH_SEPARATOR } from '@/library/tagTree';
import { Button } from '@/ui/Button';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { SearchField } from '@/ui/SearchField';
import { TagChip } from '@/ui/TagChip';
import { colors, font, radius, spacing, touchTarget } from '@/ui/theme';

const RECENT_LIMIT = 12;
const MAX_RESULTS = 20;

const lower = (names: readonly string[]) => names.map((n) => n.toLowerCase()).join('/');

/**
 * Add and remove a song's tags — built for speed, since per-song effort is what
 * decides whether anyone tags a whole library. With nothing typed it offers
 * one-tap suggestions; typing filters existing tags; Enter adds the best match
 * or creates the tag, with "parent/child" creating nested tags in one go.
 */
export default function SongTagsScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const songId = Number(rawId);
  const db = useSQLiteContext();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data } = useLibraryQuery(
    async (db) => {
      const [song, applied, tags, recent] = await Promise.all([
        getSong(db, songId),
        getTagsForSong(db, songId),
        listTags(db),
        listRecentTags(db, RECENT_LIMIT),
      ]);
      return { song, applied, index: buildTagIndex(tags), recent };
    },
    [songId]
  );

  const appliedIds = useMemo(() => new Set(data?.applied.map((t) => t.id)), [data]);
  const path = parseTagPath(input);

  // Existing tags whose full path matches what's typed, minus ones already on the song.
  const matches = useMemo(() => {
    if (!data || path.length === 0) return [];
    const query = path.join(' ');
    return data.index
      .all()
      .filter((t) => !appliedIds.has(t.id) && matchesQuery(searchKey([data.index.label(t.id)]), query))
      .slice(0, MAX_RESULTS);
  }, [data, appliedIds, path.join('/')]);

  // A tag whose path is exactly what was typed (case-insensitively) — creating it would be a duplicate.
  const exact = data?.index
    .all()
    .find((t) => lower(data.index.path(t.id).map((p) => p.name)) === lower(path));

  const add = async (tagId: number) => {
    await addTagToSong(db, songId, tagId);
    setInput('');
    setError(null);
    notifyLibraryChanged();
  };

  const remove = async (tagId: number) => {
    await removeTagFromSong(db, songId, tagId);
    notifyLibraryChanged();
  };

  const addPath = async (names: readonly string[]) => {
    try {
      await add(await ensureTagPath(db, names));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /** Enter: the exact match, else the only match, else create what was typed. */
  const submit = () => {
    if (path.length === 0) return;
    if (exact) {
      if (!appliedIds.has(exact.id)) add(exact.id);
      else setInput('');
    } else if (matches.length === 1) add(matches[0].id);
    else addPath(path);
  };

  if (!data) return <View style={styles.screen} />;
  const { song, applied, index, recent } = data;

  // Genre is only ever a *suggestion* — tapping it is what applies it.
  const genreSuggestion =
    song?.genre && !applied.some((t) => t.name.toLowerCase() === song.genre!.toLowerCase())
      ? song.genre
      : null;
  const recentSuggestions = recent.filter((t) => !appliedIds.has(t.id));

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: 'Tags',
          headerRight: () => <Button label="Done" variant="secondary" onPress={() => router.back()} />,
        }}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {song && (
          <View>
            <Text style={styles.songTitle} numberOfLines={2}>
              {song.title}
            </Text>
            {song.artist ? <Text style={styles.songArtist}>{song.artist}</Text> : null}
          </View>
        )}

        <View style={styles.chips}>
          {applied.length === 0 ? (
            <Text style={styles.hint}>No tags yet.</Text>
          ) : (
            applied.map((tag) => (
              <TagChip key={tag.id} name={index.label(tag.id)} onRemove={() => remove(tag.id)} />
            ))
          )}
        </View>

        <SearchField
          icon="pricetag-outline"
          value={input}
          onChangeText={(text) => {
            setInput(text);
            setError(null);
          }}
          placeholder="Add a tag — use / to nest"
          autoFocus
          returnKeyType="done"
          blurOnSubmit={false}
          onSubmitEditing={submit}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {path.length > 0 ? (
          <View>
            {matches.map((tag) => (
              <ResultRow key={tag.id} label={index.label(tag.id)} onPress={() => add(tag.id)} />
            ))}
            {!exact && (
              <ResultRow
                label={`Create "${path.join(PATH_SEPARATOR)}"`}
                accent
                onPress={() => addPath(path)}
              />
            )}
          </View>
        ) : (
          <>
            {genreSuggestion && (
              <Section label="Suggested from genre">
                <TagChip name={genreSuggestion} onPress={() => addPath([genreSuggestion])} />
              </Section>
            )}
            {recentSuggestions.length > 0 && (
              <Section label="Recent">
                {recentSuggestions.map((tag) => (
                  <TagChip key={tag.id} name={index.label(tag.id)} onPress={() => add(tag.id)} />
                ))}
              </Section>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

function ResultRow({ label, onPress, accent }: { label: string; onPress: () => void; accent?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.result, pressed && styles.resultPressed]}
    >
      <Text style={[styles.resultText, accent && styles.resultAccent]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  songTitle: {
    ...font.heading,
    color: colors.text,
  },
  songArtist: {
    ...font.body,
    color: colors.textDim,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  hint: {
    ...font.body,
    color: colors.textFaint,
  },
  error: {
    ...font.label,
    color: colors.danger,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...font.caption,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  result: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  resultPressed: {
    backgroundColor: colors.surface,
  },
  resultText: {
    ...font.body,
    color: colors.text,
  },
  resultAccent: {
    color: colors.accent,
  },
});
