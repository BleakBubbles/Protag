import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { notifyLibraryChanged } from '@/db/changes';
import { applyBulkTagEdit, listAllSongTags, listTags, parseTagPath } from '@/db/tags';
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

const lower = (names: readonly string[]) => names.map((n) => n.toLowerCase()).join('/');

/**
 * The tags of several songs at once (from a tag page's selection). Each tag
 * shows whether every selected song has it, some do, or none do; tapping
 * cycles that, and only tags you touch change. Changes are staged and applied
 * by Save. Typing a name that doesn't exist offers to create it.
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
      const [tags, songTags] = await Promise.all([listTags(db), listAllSongTags(db)]);
      const index = buildTagIndex(tags);
      const tagsOf = new Map(songIds.map((id) => [id, (songTags.get(id) ?? []).map((t) => t.id)]));
      const counts = countTags(songIds, tagsOf);
      // Tags the songs already have first, then the rest. Fixed for the visit,
      // so ticking a tag never makes the list reshuffle under the finger.
      const all = index.all();
      const ordered = [...all.filter((t) => counts.has(t.id)), ...all.filter((t) => !counts.has(t.id))];
      return { index, tagsOf, counts, ordered };
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
  const exists =
    path.length === 0 ||
    Boolean(data?.index.all().some((t) => lower(data.index.path(t.id).map((p) => p.name)) === lower(path))) ||
    newPaths.some((p) => lower(p) === lower(path));
  const create = () => {
    if (exists) return;
    setNewPaths((paths) => [...paths, path]);
    setQuery('');
  };

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
          title: `Tags for ${plural(n, 'song')}`,
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
                onSubmitEditing={create}
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
});
