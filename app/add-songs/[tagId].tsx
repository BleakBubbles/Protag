import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { notifyLibraryChanged } from '@/db/changes';
import { listAllSongs } from '@/db/songs';
import {
  listAllSongTags,
  listDirectSongIds,
  listTags,
  suggestSongsForTag,
  updateSongsOfTag,
} from '@/db/tags';
import type { SongRow } from '@/db/types';
import { albumArtUri } from '@/library/assets';
import { matchesQuery, searchKey } from '@/library/search';
import { buildTagIndex } from '@/library/tagTree';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { FilterChip } from '@/ui/FilterChip';
import { plural } from '@/ui/format';
import { useFixedRowLayout } from '@/ui/hooks/useFixedRowLayout';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { useStagedSave } from '@/ui/hooks/useStagedSave';
import { PICK_ROW_HEIGHT, PickSongRow } from '@/ui/library/PickSongRow';
import { SaveButton } from '@/ui/SaveButton';
import { SearchField } from '@/ui/SearchField';
import { colors, font, spacing } from '@/ui/theme';

const SUGGESTION_LIMIT = 20;

/**
 * Add songs to one tag. One tap toggles a song in or out, with no selection
 * mode, so tagging ten songs is ten taps. Taps only stage changes: Save applies
 * them all at once, and leaving with unsaved changes asks first. Same-artist
 * suggestions sit on top, because the songs already in a tag are the best hint
 * at what else fits.
 */
export default function AddSongsScreen() {
  const { tagId: rawId } = useLocalSearchParams<{ tagId: string }>();
  const tagId = Number(rawId);
  const db = useSQLiteContext();
  const [query, setQuery] = useState('');
  // Working through what's not tagged yet is how a new library gets tagged at all.
  const [untaggedOnly, setUntaggedOnly] = useState(false);
  const [recentFirst, setRecentFirst] = useState(false);
  const { getItemLayout, onHeaderLayout } = useFixedRowLayout(PICK_ROW_HEIGHT);

  const { data } = useLibraryQuery(
    async (db) => {
      const [tags, songs, direct, songTags, suggestions] = await Promise.all([
        listTags(db),
        listAllSongs(db),
        listDirectSongIds(db, tagId),
        listAllSongTags(db),
        suggestSongsForTag(db, tagId, SUGGESTION_LIMIT),
      ]);
      const index = buildTagIndex(tags);

      // For songs under the tag only via a subtag: which subtag, to show "in via …".
      const below = index.descendantIds(tagId);
      const viaSubtag = new Map<number, string>();
      for (const [songId, applied] of songTags) {
        const sub = applied.find((t) => below.has(t.id));
        if (sub) viaSubtag.set(songId, sub.name);
      }
      // From the library as it was when this opened (nothing is written until
      // Save), so picking a song never makes it vanish from "Not tagged yet".
      const tagged = new Set(songTags.keys());
      return { index, songs, direct, viaSubtag, suggestions, tagged };
    },
    [tagId]
  );

  // Taps only stage changes. `selected` is which songs will carry the tag and
  // `initial` which do now, so the difference between them is what Save applies.
  const [selected, setSelected] = useState<ReadonlySet<number> | null>(null);
  const initial = useRef<ReadonlySet<number>>(new Set());
  useEffect(() => {
    if (data && selected === null) {
      initial.current = new Set(data.direct);
      setSelected(new Set(data.direct));
    }
  }, [data, selected]);

  const toggle = useCallback((songId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(songId)) next.add(songId);
      return next;
    });
  }, []);

  const changes = useMemo(() => {
    const add: number[] = [];
    const remove: number[] = [];
    if (selected) {
      for (const id of selected) if (!initial.current.has(id)) add.push(id);
      for (const id of initial.current) if (!selected.has(id)) remove.push(id);
    }
    return { add, remove };
  }, [selected]);
  const dirty = changes.add.length + changes.remove.length > 0;

  const { save, saving } = useStagedSave(dirty, async () => {
    await updateSongsOfTag(db, tagId, changes);
    notifyLibraryChanged();
  });

  const searchable = useMemo(
    () => (data?.songs ?? []).map((song) => ({ song, key: searchKey([song.title, song.artist, song.album]) })),
    [data]
  );
  const trimmed = query.trim();
  const keep = useCallback(
    (song: SongRow) => !untaggedOnly || !data?.tagged.has(song.id),
    [untaggedOnly, data]
  );
  const visible = useMemo(() => {
    const matched = trimmed ? searchable.filter((s) => matchesQuery(s.key, trimmed)) : searchable;
    const songs = matched.map((s) => s.song).filter(keep);
    // `listAllSongs` is title order; a stable sort keeps that within equal dates.
    return recentFirst ? songs.sort((a, b) => b.added_at - a.added_at) : songs;
  }, [searchable, trimmed, keep, recentFirst]);

  const tag = data?.index.byId.get(tagId);
  if (data && !tag) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState icon="tag" title="This tag no longer exists">
          <Button label="Close" variant="tonal" onPress={() => router.back()} />
        </EmptyState>
      </View>
    );
  }

  const renderRow = (song: SongRow) => (
    <PickSongRow
      key={song.id}
      id={song.id}
      title={song.title}
      artist={song.artist}
      artworkUri={albumArtUri(song.album_id)}
      selected={selected?.has(song.id) ?? false}
      viaSubtag={data?.viaSubtag.get(song.id)}
      onToggle={toggle}
    />
  );

  const suggestions = trimmed ? [] : (data?.suggestions ?? []).filter(keep);

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: tag ? `Add to ${tag.name}` : '',
          headerRight: () => <SaveButton dirty={dirty} saving={saving} onPress={save} />,
        }}
      />
      <FlatList
        data={visible}
        keyExtractor={(song) => String(song.id)}
        getItemLayout={getItemLayout}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        extraData={selected}
        renderItem={({ item }) => renderRow(item)}
        ListHeaderComponent={
          <View onLayout={onHeaderLayout}>
            <View style={styles.search}>
              <SearchField
                value={query}
                onChangeText={setQuery}
                placeholder="Search songs, artists, albums"
                returnKeyType="search"
              />
              <View style={styles.filters}>
                <FilterChip
                  label="Not tagged yet"
                  selected={untaggedOnly}
                  onToggle={() => setUntaggedOnly((on) => !on)}
                />
                <FilterChip
                  label="Recently added"
                  selected={recentFirst}
                  onToggle={() => setRecentFirst((on) => !on)}
                />
              </View>
              {/* Always one line, so the first tap doesn't push the list down: it
                  explains how this works until there are pending changes to show. */}
              <Text style={[styles.status, dirty && styles.pending]} numberOfLines={1}>
                {dirty
                  ? [
                      changes.add.length > 0 && `${plural(changes.add.length, 'song')} to add`,
                      changes.remove.length > 0 && `${plural(changes.remove.length, 'song')} to remove`,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Tap songs to add or remove them, then Save.'}
              </Text>
            </View>
            {suggestions.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Suggested · same artists</Text>
                {suggestions.map(renderRow)}
              </>
            )}
            <Text style={styles.sectionLabel}>
              {trimmed ? 'Matches' : untaggedOnly ? 'Not tagged yet' : 'All songs'}
            </Text>
          </View>
        }
        ListEmptyComponent={
          !data ? undefined : trimmed ? (
            <EmptyState icon="search" title="No matches" body={`Nothing matches "${trimmed}".`} />
          ) : untaggedOnly ? (
            <EmptyState icon="checkmark-done" title="Everything's tagged" body="Every song has at least one tag." />
          ) : undefined
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
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  status: {
    ...font.caption,
    color: colors.textFaint,
  },
  pending: {
    color: colors.accentFg,
  },
  sectionLabel: {
    ...font.caption,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
});
