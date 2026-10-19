import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { notifyLibraryChanged } from '../../db/changes';
import { ensureTagPath, listTagsWithCounts, parseTagPath } from '../../db/tags';
import type { TagRow as Tag } from '../../db/types';
import { albumArtUri } from '../../library/assets';
import { usePlaylistImport } from '../../library/usePlaylistImport';
import { openTag } from '../../navigation';
import { useNowPlaying, usePlayerActions } from '../../player/PlayerProvider';
import { findSongs } from '../../query/run';
import { Fab, FAB_CLEARANCE, useFabFold } from '../../ui/Fab';
import { formatCount } from '../../ui/format';
import { useFixedRowLayout } from '../../ui/hooks/useFixedRowLayout';
import { useLibraryQuery } from '../../ui/hooks/useLibraryQuery';
import type { SongSelection } from '../../ui/hooks/useSongSelection';
import { ImportPrompt, ImportStatus } from '../../ui/library/ImportCards';
import { SelectionBar } from '../../ui/library/SelectionBar';
import { SONG_ROW_HEIGHT, SongRow } from '../../ui/library/SongRow';
import { TagRow } from '../../ui/library/TagRow';
import { PromptDialog } from '../../ui/PromptDialog';
import { colors, font, spacing } from '../../ui/theme';

const NO_TAGS: readonly Tag[] = [];
const LOOSE_LABEL = 'Not tagged yet';

export interface TagsViewProps {
  /** Owned by the Library screen, which shows its header while selecting. */
  selection: SongSelection;
  /** Reports the loose songs as listed, so selection knows what "all" is. */
  onLooseSongs: (songIds: readonly number[]) => void;
}

/**
 * The library's root directory: top-level tags as folders, then the songs no
 * tag holds yet, like loose files outside any folder. They're newest first,
 * since fresh additions most need tagging, and the list shrinks as songs get
 * tagged: a ready-made to-do list. Long-press one to start selecting and tag a
 * batch at once.
 */
export function TagsView({ selection, onLooseSongs }: TagsViewProps) {
  const db = useSQLiteContext();
  const { data } = useLibraryQuery(async (db) => {
    const [tags, loose] = await Promise.all([
      listTagsWithCounts(db, null),
      findSongs(db, { type: 'untagged' }, { order: 'recent' }),
    ]);
    return { tags, loose };
  }, []);
  const imports = usePlaylistImport();
  const [creating, setCreating] = useState(false);
  const { getItemLayout, onHeaderLayout } = useFixedRowLayout(SONG_ROW_HEIGHT);
  const fab = useFabFold();
  const { playQueue } = usePlayerActions();
  const { song: current, queue } = useNowPlaying();

  const looseIds = useMemo(() => data?.loose.map((s) => s.id), [data]);
  useEffect(() => {
    if (looseIds) onLooseSongs(looseIds);
  }, [looseIds, onLooseSongs]);

  const playFrom = useCallback(
    (songId: number) =>
      looseIds && playQueue(looseIds, { startId: songId, shuffle: queue.shuffled, label: LOOSE_LABEL }),
    [looseIds, playQueue, queue.shuffled]
  );

  // Opens the new tag straight away: the next step is almost always adding songs
  // to it, and an empty tag's screen leads with exactly that.
  const createTag = async (input: string) => {
    const id = await ensureTagPath(db, parseTagPath(input));
    notifyLibraryChanged();
    openTag(id);
  };

  const tags = data?.tags ?? [];
  const looseCount = data?.loose.length ?? 0;
  const { selecting, selected, toggle } = selection;

  return (
    <>
      <FlatList
        data={data?.loose ?? []}
        keyExtractor={(song) => String(song.id)}
        getItemLayout={getItemLayout}
        extraData={selection.selection}
        {...fab.scrollProps}
        contentContainerStyle={{ paddingBottom: FAB_CLEARANCE }}
        renderItem={({ item }) => (
          <SongRow
            id={item.id}
            title={item.title}
            artist={item.artist}
            artworkUri={albumArtUri(item.album_id)}
            tags={NO_TAGS}
            active={current?.id === item.id}
            selecting={selecting}
            selected={selection.selection?.has(item.id) ?? false}
            onPress={selecting ? toggle : playFrom}
            onLongPress={toggle}
          />
        )}
        ListHeaderComponent={
          <View onLayout={onHeaderLayout}>
            {/* Only takes room while there's something to report or offer. */}
            {(imports.state.kind !== 'idle' || (tags.length === 0 && imports.showPrompt)) && (
              <View style={styles.notices}>
                <ImportStatus state={imports.state} />
                {tags.length === 0 && imports.showPrompt && (
                  <ImportPrompt onChoose={imports.run} onDismiss={imports.dismissPrompt} disabled={imports.busy} />
                )}
              </View>
            )}
            {tags.map((tag) => (
              <TagRow
                key={tag.id}
                name={tag.name}
                color={tag.color}
                songCount={tag.song_count}
                childCount={tag.child_count}
                onPress={() => openTag(tag.id)}
              />
            ))}
            {/* Folders first, then the loose songs, like any file browser. */}
            {looseCount > 0 && tags.length > 0 && <View style={styles.divider} />}
            {looseCount > 0 && (
              <View style={styles.looseHeading}>
                <Text style={styles.looseLabel}>
                  {LOOSE_LABEL} · {formatCount(looseCount)}
                </Text>
              </View>
            )}
          </View>
        }
      />
      {selecting ? (
        // No Remove here: these songs aren't in any tag to remove them from.
        <SelectionBar
          disabled={selected.length === 0}
          actions={[{ label: 'Tags…', icon: 'tags', onPress: selection.editTags }]}
        />
      ) : (
        <Fab label="New tag" icon="add" extended={fab.extended} onPress={() => setCreating(true)} />
      )}
      <PromptDialog
        visible={creating}
        title="New tag"
        message="Use / to nest, like asian-pop/kpop."
        placeholder="Tag name"
        confirmLabel="Create"
        onSubmit={createTag}
        onClose={() => setCreating(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  notices: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  looseHeading: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  // The same thin line a tag page draws between its subtags and songs.
  divider: {
    height: 1,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
    backgroundColor: colors.border,
  },
  looseLabel: {
    ...font.caption,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
