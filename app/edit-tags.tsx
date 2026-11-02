import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { notifyLibraryChanged } from '@/db/changes';
import { getSetting, SettingKey, setSetting } from '@/db/settings';
import { getSong } from '@/db/songs';
import { applyBulkTagEdit, listAllSongTags, listAllTagsWithCounts, parseTagPath } from '@/db/tags';
import type { TagWithCounts } from '@/db/types';
import { countTags, markFor, planBulkEdit, shownMark, tapTag, type TagMark } from '@/library/bulkTags';
import { matchesQuery, searchKey } from '@/library/search';
import { nextEditorSort, parseEditorSort, SORT_LABEL, sortEditorTags, type EditorSort } from '@/library/sorts';
import { buildTagIndex } from '@/library/tagTree';
import { plural } from '@/ui/format';
import { feelStep } from '@/ui/haptics';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { useStagedSave } from '@/ui/hooks/useStagedSave';
import { TagChipFlow } from '@/ui/library/TagChipFlow';
import { SectionHead } from '@/ui/play/SectionHead';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { PromptDialog } from '@/ui/PromptDialog';
import { SaveButton } from '@/ui/SaveButton';
import { SearchField } from '@/ui/SearchField';
import { font, spacing } from '@/ui/theme';
import { makeStyles, useColors } from '@/ui/ThemeContext';

const CREATE_ICON = 22;
const NONE: readonly TagWithCounts[] = [];
const NO_KIDS: readonly never[] = [];

const lower = (names: readonly string[]) => names.map((n) => n.toLowerCase()).join('/');

/** Typed-in tags that don't exist yet, as chips: negative ids, no colour until they're made. */
interface NewChip {
  id: number;
  color: null;
  path: string[];
}

/**
 * The tags of one song (from the player or a song list) or several at once
 * (from a selection): the same screen either way. Tags are chips, all on one
 * screen for a typical library: filled when every song has the tag, half
 * filled when some do. Tapping one turns it on or off, and only tags you touch
 * change. Changes are staged and applied by Save.
 *
 * The chips follow the tree: a tag with subtags opens while it's on, so
 * tagging goes down level by level ("kpop", then "gen 4") as far as the tree
 * goes, and a flat library is just one set of chips. Built for speed, since
 * per-song effort decides whether anyone tags a whole library: Enter ticks the
 * best match or creates what was typed, with "parent/child" making nested tags
 * in one go.
 */
export default function EditTagsScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { songs: rawSongs } = useLocalSearchParams<{ songs: string }>();
  const songIds = useMemo(
    () => (rawSongs ?? '').split(',').map(Number).filter(Number.isInteger),
    [rawSongs]
  );
  const db = useSQLiteContext();
  const [query, setQuery] = useState('');

  const { data } = useLibraryQuery(
    async (db) => {
      const [tags, songTags, song, sort] = await Promise.all([
        listAllTagsWithCounts(db),
        listAllSongTags(db),
        songIds.length === 1 ? getSong(db, songIds[0]) : null,
        getSetting(db, SettingKey.editTagsSort),
      ]);
      const index = buildTagIndex(tags);
      const tagsOf = new Map(songIds.map((id) => [id, (songTags.get(id) ?? []).map((t) => t.id)]));
      const counts = countTags(songIds, tagsOf);

      // One song's genre is only ever a suggestion: if there's no top-level tag
      // of that name, creating it is offered.
      const genre = song?.genre ?? null;
      const genreTag = genre ? index.children(null).find((t) => t.name.toLowerCase() === genre.toLowerCase()) : undefined;

      return { tags, index, tagsOf, counts, song, savedSort: parseEditorSort(sort), genreToCreate: genre && !genreTag ? genre : null };
    },
    [rawSongs]
  );

  const [picked, setPicked] = useState<EditorSort>();
  const sort = picked ?? data?.savedSort ?? 'custom';
  const changeSort = () => {
    const next = nextEditorSort(sort);
    setPicked(next);
    setSetting(db, SettingKey.editTagsSort, next).catch(() => {});
  };

  // Each level of the tree, in the chosen order.
  const childrenOf = useMemo(() => {
    const levels = new Map<number | null, TagWithCounts[]>();
    for (const tag of data?.tags ?? []) {
      const level = levels.get(tag.parent_id);
      if (level) level.push(tag);
      else levels.set(tag.parent_id, [tag]);
    }
    for (const [parent, level] of levels) levels.set(parent, sortEditorTags(level, sort));
    return (id: number | null) => levels.get(id) ?? NONE;
  }, [data, sort]);

  // Marks for tags the user has touched; everything else shows as it started.
  const [marks, setMarks] = useState<ReadonlyMap<number, TagMark>>(new Map());
  // Tags typed in that don't exist yet: created, and given to every song, on Save.
  const [newPaths, setNewPaths] = useState<readonly string[][]>([]);

  const initialMark = useCallback(
    (tagId: number) => markFor(data?.counts.get(tagId) ?? 0, songIds.length),
    [data, songIds.length]
  );
  const markOf = (tagId: number) => marks.get(tagId) ?? initialMark(tagId);

  // What each chip shows: its own mark, or what its subtags say.
  const shown = useMemo(() => {
    const out = new Map<number, TagMark>();
    if (!data) return out;
    const of = (id: number) => marks.get(id) ?? initialMark(id);
    for (const tag of data.tags) out.set(tag.id, shownMark(of(tag.id), [...data.index.descendantIds(tag.id)].map(of)));
    return out;
  }, [data, marks, initialMark]);
  const shownOf = useCallback((id: number) => (id < 0 ? 'all' : (shown.get(id) ?? 'none')), [shown]);

  const toggle = useCallback(
    (tagId: number) => {
      feelStep();
      // Chips for typed-in new tags have negative ids: tapping one drops it.
      if (tagId < 0) {
        setNewPaths((paths) => paths.filter((_, i) => i !== -tagId - 1));
        return;
      }
      if (!data) return;
      const below = [...data.index.descendantIds(tagId)];
      const above = data.index.path(tagId).slice(0, -1).map((t) => t.id);
      setMarks((prev) => tapTag(prev, initialMark, tagId, below, above));
    },
    [data, initialMark]
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

  // Search, and what typing a new name would create. While searching, the
  // tree flattens to the matches, each with its whole path.
  const path = parseTagPath(query);
  const searching = path.length > 0;
  const found = useMemo(() => {
    if (!data || path.length === 0) return NONE;
    const words = path.join(' ');
    return sortEditorTags(
      data.tags.filter((t) => matchesQuery(searchKey([data.index.label(t.id)]), words)),
      sort
    );
  }, [data, path.join('/'), sort]);
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
    const target = exact ?? (found.length === 1 ? found[0] : undefined);
    if (!target) return create();
    if (shownOf(target.id) !== 'all') toggle(target.id);
    setQuery('');
  };
  // No tags in the library yet, and none typed or staged: the editor starts from its empty state.
  const firstTag = data !== undefined && data.tags.length === 0 && newPaths.length === 0 && path.length === 0;
  const [naming, setNaming] = useState(false);
  const genre = data?.genreToCreate;
  const showGenre = path.length === 0 && genre != null && !newPaths.some((p) => lower(p) === lower([genre]));
  const newChips = useMemo<NewChip[]>(() => newPaths.map((p, i) => ({ id: -(i + 1), color: null, path: p })), [newPaths]);

  const n = songIds.length;

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: n === 1 && data?.song ? data.song.title : `Tags for ${plural(n, 'song')}`,
          headerRight: () => <SaveButton dirty={dirty} saving={saving} onPress={save} />,
        }}
      />
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.content}>
        <View style={styles.search}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            icon="tag"
            placeholder="Find or create a tag — use / to nest"
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          {/* Always one line, so the first tap doesn't push the chips down. */}
          <Text style={[styles.status, dirty && styles.pending]} numberOfLines={1}>
            {firstTag
              ? ' ' // The empty state below says it.
              : dirty
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
            <Icon name="add" size={CREATE_ICON} color={colors.accentFg} />
            <Text style={styles.createText} numberOfLines={1}>
              Create "{path.join('/')}"
            </Text>
          </Pressable>
        )}
        {showGenre && (
          <Pressable onPress={() => addNew([genre])} accessibilityRole="button" style={styles.createRow}>
            <Icon name="add" size={CREATE_ICON} color={colors.accentFg} />
            <Text style={styles.createText} numberOfLines={1}>
              Create "{genre}" <Text style={styles.createNote}>· from this song's genre</Text>
            </Text>
          </Pressable>
        )}
        {newChips.length > 0 && (
          <View style={styles.chips}>
            <Text style={styles.newLabel}>New, made on save</Text>
            <TagChipFlow
              tags={newChips}
              labelOf={(c) => c.path.join('/')}
              markOf={shownOf}
              childrenOf={() => NO_KIDS}
              onPress={toggle}
            />
          </View>
        )}
        {firstTag ? (
          // A library with no tags yet: how to make the first, built round one obvious button.
          <EmptyState
            icon="tag"
            title="Your first tag"
            body="Tags are your own words for songs: a mood, a moment, anything. Mix them in Play later."
          >
            <Button label="Create a tag" icon="add" variant="tonal" onPress={() => setNaming(true)} />
          </EmptyState>
        ) : (
          data && (
            <>
              {!searching && (
                <View style={styles.head}>
                  <SectionHead label="Tags" sort={SORT_LABEL[sort]} onSort={changeSort} />
                </View>
              )}
              <View style={styles.chips}>
                {/* Remounted between the two, which label chips differently and so measure them differently. */}
                <TagChipFlow
                  key={searching ? 'found' : 'tree'}
                  tags={searching ? found : childrenOf(null)}
                  labelOf={(t) => (searching ? data.index.label(t.id) : t.name)}
                  markOf={shownOf}
                  childrenOf={searching ? () => NO_KIDS : childrenOf}
                  onPress={toggle}
                />
              </View>
            </>
          )
        )}
      </ScrollView>
      <PromptDialog
        visible={naming}
        title="New tag"
        message={n === 1 ? 'It goes on this song when you save.' : `It goes on all ${n} songs when you save.`}
        placeholder="chill"
        confirmLabel="Create"
        onSubmit={async (name) => {
          const names = parseTagPath(name);
          if (names.length > 0) addNew(names);
        }}
        onClose={() => setNaming(false)}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  search: {
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  status: {
    ...font.caption,
    color: colors.textDim,
  },
  pending: {
    color: colors.accentFg,
  },
  createRow: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  createText: {
    ...font.name,
    color: colors.accentFg,
    flex: 1,
  },
  createNote: {
    color: colors.textDim,
  },
  head: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  chips: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  newLabel: {
    ...font.caption,
    color: colors.textDim,
  },
}));
