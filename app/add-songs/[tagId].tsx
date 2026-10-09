import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, View } from 'react-native';

import { notifyLibraryChanged } from '@/db/changes';
import { listAllSongs } from '@/db/songs';
import {
  addTagToSong,
  listAllSongTags,
  listDirectSongIds,
  listTags,
  removeTagFromSong,
  suggestSongsForTag,
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
import { PICK_ROW_HEIGHT, PickSongRow } from '@/ui/library/PickSongRow';
import { SearchField } from '@/ui/SearchField';
import { colors, font, spacing } from '@/ui/theme';

const SUGGESTION_LIMIT = 20;

/**
 * Add songs to one tag. One tap toggles a song in or out — no save step and no
 * selection mode, so tagging ten songs is ten taps. Same-artist suggestions sit
 * on top, because the songs already in a tag are the best hint at what else fits.
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
      // Snapshotted on open, like everything here: a song tagged in this picker
      // stays in the "not tagged yet" list rather than vanishing from under the finger.
      const tagged = new Set(songTags.keys());
      return { index, songs, direct, viaSubtag, suggestions, tagged };
    },
    [tagId]
  );

  // Membership is tracked locally so taps feel instant, and the rest of the app is
  // told once on the way out — notifying per tap would reload this whole list each time.
  const [selected, setSelected] = useState<Set<number> | null>(null);
  const initial = useRef<Set<number> | null>(null);
  // Source of truth for toggling: updated synchronously on each tap, so fast
  // double-taps can't both read the same stale state and both try to add.
  const selectedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (data && selected === null) {
      initial.current = new Set(data.direct);
      selectedRef.current = new Set(data.direct);
      setSelected(new Set(data.direct));
    }
  }, [data, selected]);

  const changed = useRef(false);
  useEffect(
    () => () => {
      if (changed.current) notifyLibraryChanged();
    },
    []
  );

  const toggle = useCallback(
    async (songId: number) => {
      const set = (adding: boolean) => {
        const next = new Set(selectedRef.current);
        if (adding) next.add(songId);
        else next.delete(songId);
        selectedRef.current = next;
        setSelected(next);
      };
      const adding = !selectedRef.current.has(songId);
      set(adding);
      changed.current = true;
      try {
        // Writes run in order on the one connection, so a quick add-then-remove lands correctly.
        if (adding) await addTagToSong(db, songId, tagId);
        else await removeTagFromSong(db, songId, tagId);
      } catch (error) {
        set(!adding); // put it back
        Alert.alert("Couldn't update the tag", String(error));
      }
    },
    [db, tagId]
  );

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
        <EmptyState icon="pricetag-outline" title="This tag no longer exists">
          <Button label="Close" onPress={() => router.back()} />
        </EmptyState>
      </View>
    );
  }

  const added = selected && initial.current
    ? [...selected].filter((id) => !initial.current!.has(id)).length
    : 0;

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
          headerRight: () => <Button label="Done" variant="secondary" onPress={() => router.back()} />,
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
                  explains the toggle until there's a count to show instead. */}
              <Text style={[styles.status, added > 0 && styles.added]} numberOfLines={1}>
                {added > 0 ? `${plural(added, 'song')} added` : 'Tap a song to add it. Tap again to take it out.'}
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
          !data ? null : trimmed ? (
            <EmptyState icon="search" title="No matches" body={`Nothing matches "${trimmed}".`} />
          ) : untaggedOnly ? (
            <EmptyState icon="checkmark-done" title="Everything's tagged" body="Every song has at least one tag." />
          ) : null
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
  added: {
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
