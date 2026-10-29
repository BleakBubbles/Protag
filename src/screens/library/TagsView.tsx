import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { notifyLibraryChanged } from '../../db/changes';
import { ensureTagPath, listTagsWithCounts, parseTagPath } from '../../db/tags';
import { albumArtUri } from '../../library/assets';
import type { SongChip } from '../../library/songChips';
import { usePlaylistImport } from '../../library/usePlaylistImport';
import { openTag } from '../../navigation';
import { useNowPlaying, usePlayerActions } from '../../player/PlayerProvider';
import { findSongs } from '../../query/run';
import { Fab, FAB_CLEARANCE } from '../../ui/Fab';
import { formatCount } from '../../ui/format';
import { useDragSelect } from '../../ui/hooks/useDragSelect';
import { useFixedRowLayout } from '../../ui/hooks/useFixedRowLayout';
import { useLibraryQuery } from '../../ui/hooks/useLibraryQuery';
import type { Selection } from '../../ui/hooks/useSelection';
import type { SongSelection } from '../../ui/hooks/useSongSelection';
import { ImportPrompt, ImportStatus } from '../../ui/library/ImportCards';
import { SelectionBar } from '../../ui/library/SelectionBar';
import { SongRow, useSongRowHeight } from '../../ui/library/SongRow';
import { TagList } from '../../ui/library/TagList';
import { NewTagRow } from '../../ui/library/TagRow';
import { TagSelectionBar } from '../../ui/library/TagSelectionBar';
import { PromptDialog } from '../../ui/PromptDialog';
import { font, spacing } from '../../ui/theme';
import { makeStyles } from '../../ui/ThemeContext';

const NO_CHIPS: readonly SongChip[] = [];
const LOOSE_LABEL = 'Not tagged yet';

export interface TagsViewProps {
  /** Owned by the Library screen, which shows its header while selecting. */
  selection: SongSelection;
  /** Selecting the tags themselves (one or the other: songs dim while tags are picked, and the other way round). */
  tagSelection: Selection;
  /** Reports the tags as listed, so their selection knows what "all" is. */
  onTags: (tagIds: readonly number[]) => void;
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
export function TagsView({ selection, tagSelection, onTags, onLooseSongs }: TagsViewProps) {
  const styles = useStyles();
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
  const rowHeight = useSongRowHeight();
  const { getItemLayout, onHeaderLayout, headerHeight } = useFixedRowLayout(rowHeight);
  // New tag is a row after the tags, and the floating button stands in for it
  // whenever it isn't wholly in view (scrolled off the top, or not yet scrolled
  // to): one New tag on screen at a time.
  const [row, setRow] = useState<{ top: number; end: number } | null>(null);
  const [scrolled, setScrolled] = useState(0);
  const [viewHeight, setViewHeight] = useState(0);
  const rowOutOfView = row !== null && viewHeight > 0 && (row.top < scrolled || row.end > scrolled + viewHeight);
  const track = (e: NativeSyntheticEvent<NativeScrollEvent>) => setScrolled(e.nativeEvent.contentOffset.y);
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

  const tags = useMemo(() => data?.tags ?? [], [data]);
  useEffect(() => onTags(tags.map((t) => t.id)), [tags, onTags]);
  const looseCount = data?.loose.length ?? 0;
  const { selecting, selected, toggle } = selection;
  // Sliding across tags or dragging one by its handle: the list mustn't scroll under it.
  const [tagsBusy, setTagsBusy] = useState(false);
  const drag = useDragSelect({ ids: looseIds, rowHeight, headerHeight, selection, onScroll: track });

  return (
    <>
      <View ref={drag.frameRef} style={styles.frame} {...drag.frameProps}>
        <FlatList
          {...drag.listProps}
          scrollEnabled={drag.listProps.scrollEnabled && !tagsBusy}
          onLayout={(e) => setViewHeight(e.nativeEvent.layout.height)}
          data={data?.loose ?? []}
          keyExtractor={(song) => String(song.id)}
          getItemLayout={getItemLayout}
          extraData={[selection.selection, tagSelection.selecting]}
          contentContainerStyle={{ paddingBottom: FAB_CLEARANCE }}
          renderItem={({ item }) => (
            <SongRow
              id={item.id}
              title={item.title}
              artist={item.artist}
              artworkUri={albumArtUri(item.album_id)}
              chips={NO_CHIPS}
              active={current?.id === item.id}
              selecting={selecting}
              selected={selection.selection?.has(item.id) ?? false}
              onPress={selecting ? toggle : playFrom}
              onLongPress={drag.start}
              disabled={tagSelection.selecting}
            />
          )}
          ListHeaderComponent={
            <View onLayout={onHeaderLayout} style={styles.top}>
              {/* Only takes room while there's something to report or offer. */}
              {(imports.state.kind !== 'idle' || (tags.length === 0 && imports.showPrompt)) && (
                <View style={styles.notices}>
                  <ImportStatus state={imports.state} />
                  {tags.length === 0 && imports.showPrompt && (
                    <ImportPrompt onChoose={imports.run} onDismiss={imports.dismissPrompt} disabled={imports.busy} />
                  )}
                </View>
              )}
              <TagList
                tags={tags}
                selection={tagSelection}
                onOpen={openTag}
                disabled={selecting}
                onBusy={setTagsBusy}
              />
              <NewTagRow
                onPress={() => setCreating(true)}
                disabled={selecting || tagSelection.selecting}
                onLayout={(e) => {
                  const { y, height } = e.nativeEvent.layout;
                  setRow({ top: y, end: y + height });
                }}
              />
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
      </View>
      {selecting ? (
        // No Remove here: these songs aren't in any tag to remove them from.
        <SelectionBar
          disabled={selected.length === 0}
          actions={[{ label: 'Tag…', icon: 'tags', onPress: selection.editTags }, ...selection.queueActions]}
        />
      ) : tagSelection.selecting ? (
        <TagSelectionBar selection={tagSelection} />
      ) : (
        <Fab label="New tag" icon="add" extended={false} shown={rowOutOfView} onPress={() => setCreating(true)} />
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

const useStyles = makeStyles((colors) => StyleSheet.create({
  frame: {
    flex: 1,
  },
  // With the rows' own padding, the first tile starts as far below the tabs as the other tabs' search fields.
  top: {
    paddingTop: spacing.xs,
  },
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
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
}));
