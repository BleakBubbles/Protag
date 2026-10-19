import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { notifyLibraryChanged } from '@/db/changes';
import { getSong } from '@/db/songs';
import { applyBulkTagEdit, listAllSongTags, listRecentTags, listTags, parseTagPath } from '@/db/tags';
import type { TagRow } from '@/db/types';
import { countTags, markFor, nextMark, planBulkEdit, type TagMark } from '@/library/bulkTags';
import { matchesQuery, searchKey } from '@/library/search';
import { buildTagIndex } from '@/library/tagTree';
import { plural } from '@/ui/format';
import { useFixedRowLayout } from '@/ui/hooks/useFixedRowLayout';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { useStagedSave } from '@/ui/hooks/useStagedSave';
import { TAG_CHECK_ROW_HEIGHT, TagCheckRow } from '@/ui/library/TagCheckRow';
import { SaveButton } from '@/ui/SaveButton';
import { SearchField } from '@/ui/SearchField';
import { colors, font, spacing } from '@/ui/theme';

const RECENT_LIMIT = 12;

const lower = (names: readonly string[]) => names.map((n) => n.toLowerCase()).join('/');

/**
 * The tags of one song (from the player or a song list) or several at once
 * (from a tag page's selection): the same screen either way. Each tag shows
 * whether every song has it, some do, or none do; tapping cycles that, and only
 * tags you touch change. Changes are staged and applied by Save.
 *
 * Built for speed, since per-song effort decides whether anyone tags a whole
 * library: suggestions (the song's genre, recently used tags) sit right under
 * the tags it already has, and Enter ticks the best match or creates what was
 * typed, with "parent/child" making nested tags in one go.
 */
export default function EditTagsScreen() {
  const { songs: rawSongs } = useLocalSearchParams<{ songs: string }>();
  const songIds = useMemo(
    () => (rawSongs ?? '').split(',').map(Number).filter(Number.isInteger),
    [rawSongs]
  );
  const db = useSQLiteContext();
  const [query, setQuery] = useState('');
  const { getItemLayout, onHeaderLayout } = useFixedRowLayout(TAG_CHECK_ROW_HEIGHT);

  const { data } = useLibraryQuery(
    async (db) => {
      const [tags, songTags, recent, song] = await Promise.all([
        listTags(db),
        listAllSongTags(db),
        listRecentTags(db, RECENT_LIMIT),
        songIds.length === 1 ? getSong(db, songIds[0]) : null,
      ]);
      const index = buildTagIndex(tags);
      const tagsOf = new Map(songIds.map((id) => [id, (songTags.get(id) ?? []).map((t) => t.id)]));
      const counts = countTags(songIds, tagsOf);

      // One song's genre is only ever a suggestion. A top-level tag of that
      // name is offered near the top; if there isn't one, creating it is.
      const genre = song?.genre ?? null;
      const genreTag = genre ? index.children(null).find((t) => t.name.toLowerCase() === genre.toLowerCase()) : undefined;

      // The songs' tags, then suggestions (genre, recently used), then the rest.
      // Fixed for the visit, so ticking a tag never reshuffles the list.
      const all = index.all();
      const ordered: TagRow[] = [];
      const seen = new Set<number>();
      const push = (id: number) => {
        const tag = index.byId.get(id);
        if (tag && !seen.has(id)) {
          seen.add(id);
          ordered.push(tag);
        }
      };
      all.filter((t) => counts.has(t.id)).forEach((t) => push(t.id));
      if (genreTag) push(genreTag.id);
      recent.forEach((t) => push(t.id));
      all.forEach((t) => push(t.id));

      return { index, tagsOf, counts, ordered, song, genreToCreate: genre && !genreTag ? genre : null };
    },
    [rawSongs]
  );

  // Marks for tags the user has touched; everything else shows as it started.
  const [marks, setMarks] = useState<ReadonlyMap<number, TagMark>>(new Map());
  // Tags typed in that don't exist yet: created, and given to every song, on Save.
  const [newPaths, setNewPaths] = useState<readonly string[][]>([]);

  const initialMark = useCallback(
    (tagId: number) => markFor(data?.counts.get(tagId) ?? 0, songIds.length),
    [data, songIds.length]
  );
  const markOf = (tagId: number) => marks.get(tagId) ?? initialMark(tagId);

  const toggle = useCallback(
    (tagId: number) => {
      // Rows for typed-in new tags have negative ids: tapping one drops it.
      if (tagId < 0) {
        setNewPaths((paths) => paths.filter((_, i) => i !== -tagId - 1));
        return;
      }
      setMarks((prev) => {
        const initial = initialMark(tagId);
        const next = new Map(prev);
        next.set(tagId, nextMark(initial, prev.get(tagId) ?? initial));
        return next;
      });
    },
    [initialMark]
  );

  const changed = useMemo(
    () => new Map([...marks].filter(([tagId, mark]) => mark !== initialMark(tagId))),
    [marks, initialMark]
  );
  const adding = [...changed.values()].filter((m) => m === 'all').length + newPaths.length;
  const removing = [...changed.values()].filter((m) => m === 'none').length;
  const dirty = adding + removing > 0;

  const { save, saving } = useStagedSave(dirty, async () => {
    if (!data) return;
    await applyBulkTagEdit(db, songIds, planBulkEdit(songIds, data.tagsOf, changed), newPaths);
    notifyLibraryChanged();
  });

  // Search, and what typing a new name would create.
  const path = parseTagPath(query);
  const visible = useMemo(() => {
    if (!data) return [];
    if (path.length === 0) return data.ordered;
    const words = path.join(' ');
    return data.ordered.filter((t) => matchesQuery(searchKey([data.index.label(t.id)]), words));
  }, [data, path.join('/')]);
  const exact =
    path.length === 0
      ? undefined
      : data?.index.all().find((t) => lower(data.index.path(t.id).map((p) => p.name)) === lower(path));
  const exists = path.length === 0 || Boolean(exact) || newPaths.some((p) => lower(p) === lower(path));
  const addNew = (names: string[]) => {
    if (!newPaths.some((p) => lower(p) === lower(names))) setNewPaths((paths) => [...paths, names]);
  };
  const create = () => {
    if (exists) return;
    addNew(path);
    setQuery('');
  };
  /** Enter: tick the exact match, else the only match, else create what was typed. */
  const submit = () => {
    if (path.length === 0) return;
    const target = exact ?? (visible.length === 1 ? visible[0] : undefined);
    if (!target) return create();
    setMarks((prev) => new Map(prev).set(target.id, 'all'));
    setQuery('');
  };
  const genre = data?.genreToCreate;
  const showGenre = path.length === 0 && genre != null && !newPaths.some((p) => lower(p) === lower([genre]));

  const n = songIds.length;
  const noteFor = (tagId: number) => {
    const mark = markOf(tagId);
    if (mark !== 'some') return undefined;
    return `${data?.counts.get(tagId) ?? 0} of ${n}`;
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: n === 1 && data?.song ? data.song.title : `Tags for ${plural(n, 'song')}`,
          headerRight: () => <SaveButton dirty={dirty} saving={saving} onPress={save} />,
        }}
      />
      <FlatList
        data={visible}
        keyExtractor={(tag) => String(tag.id)}
        getItemLayout={getItemLayout}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        extraData={marks}
        renderItem={({ item }) => (
          <TagCheckRow
            id={item.id}
            label={data?.index.label(item.id) ?? item.name}
            color={item.color}
            mark={markOf(item.id)}
            note={noteFor(item.id)}
            onPress={toggle}
          />
        )}
        ListHeaderComponent={
          <View onLayout={onHeaderLayout}>
            <View style={styles.search}>
              <SearchField
                value={query}
                onChangeText={setQuery}
                icon="pricetag-outline"
                placeholder="Find or create a tag — use / to nest"
                returnKeyType="done"
                onSubmitEditing={submit}
              />
              {/* Always one line, so the first tap doesn't push the list down. */}
              <Text style={[styles.status, dirty && styles.pending]} numberOfLines={1}>
                {dirty
                  ? [
                      adding > 0 && `${plural(adding, 'tag')} to add`,
                      removing > 0 && `${plural(removing, 'tag')} to remove`,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : n === 1
                    ? 'Tap a tag to add it, again to remove it.'
                    : 'Tap a tag to put it on every song, again to take it off.'}
              </Text>
            </View>
            {!exists && (
              <Pressable onPress={create} accessibilityRole="button" style={styles.createRow}>
                <Text style={styles.createText} numberOfLines={1}>
                  Create "{path.join('/')}"
                </Text>
              </Pressable>
            )}
            {showGenre && (
              <Pressable onPress={() => addNew([genre])} accessibilityRole="button" style={styles.createRow}>
                <Text style={styles.createText} numberOfLines={1}>
                  Create "{genre}" <Text style={styles.createNote}>· from this song's genre</Text>
                </Text>
              </Pressable>
            )}
            {newPaths.map((p, i) => (
              <TagCheckRow key={lower(p)} id={-(i + 1)} label={p.join('/')} color={null} mark="all" note="new" onPress={toggle} />
            ))}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  search: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  status: {
    ...font.caption,
    color: colors.textFaint,
  },
  pending: {
    color: colors.accentFg,
  },
  createRow: {
    height: TAG_CHECK_ROW_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  createText: {
    ...font.name,
    color: colors.accentFg,
  },
  createNote: {
    color: colors.textDim,
  },
});
