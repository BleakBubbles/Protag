import { Stack } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { albumArtUri } from '@/library/assets';
import type { SongChip } from '@/library/songChips';
import { useNowPlaying, usePlayerActions } from '@/player/PlayerProvider';
import { findSongs } from '@/query/run';
import { EmptyState } from '@/ui/EmptyState';
import { plural } from '@/ui/format';
import { useDragSelect } from '@/ui/hooks/useDragSelect';
import { useFixedRowLayout } from '@/ui/hooks/useFixedRowLayout';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { useSongSelection } from '@/ui/hooks/useSongSelection';
import { SELECTION_BAR_HEIGHT, SelectionBar } from '@/ui/library/SelectionBar';
import { SongRow, useSongRowHeight } from '@/ui/library/SongRow';
import { font, spacing } from '@/ui/theme';
import { makeStyles } from '@/ui/ThemeContext';

const NO_CHIPS: readonly SongChip[] = [];
const LABEL = 'To tag';
/** Set in full (not just the title), so it replaces the selection header cleanly. */
const pageHeader = { title: LABEL, headerTitle: undefined, headerLeft: undefined, headerRight: undefined };

/**
 * The songs no tag holds yet, newest first, since fresh additions most need
 * tagging: a to-do list that shrinks as they're tagged. Press and hold to
 * select, then Tag… to tag a batch at once.
 */
export default function ToTagScreen() {
  const styles = useStyles();
  const { data: songs } = useLibraryQuery((db) => findSongs(db, { type: 'untagged' }, { order: 'recent' }), []);
  const rowHeight = useSongRowHeight();
  const { getItemLayout, onHeaderLayout, headerHeight } = useFixedRowLayout(rowHeight);
  const { playQueue } = usePlayerActions();
  const { song: current, queue } = useNowPlaying();

  const ids = useMemo(() => songs?.map((s) => s.id), [songs]);
  const selection = useSongSelection(ids);
  const { selecting, selected, toggle } = selection;
  const drag = useDragSelect({ ids, rowHeight, headerHeight, selection });

  const playFrom = useCallback(
    (songId: number) => ids && playQueue(ids, { startId: songId, shuffle: queue.shuffled, label: LABEL }),
    [ids, playQueue, queue.shuffled]
  );

  return (
    <>
      <Stack.Screen options={selecting ? selection.header : pageHeader} />
      <View ref={drag.frameRef} style={styles.frame} {...drag.frameProps}>
        <FlatList
          {...drag.listProps}
          data={songs ?? []}
          keyExtractor={(song) => String(song.id)}
          getItemLayout={getItemLayout}
          extraData={selection.selection}
          contentContainerStyle={selecting ? { paddingBottom: SELECTION_BAR_HEIGHT } : undefined}
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
            />
          )}
          ListHeaderComponent={
            <View onLayout={onHeaderLayout} style={styles.header}>
              {songs && songs.length > 0 && (
                <Text style={styles.hint}>
                  {plural(songs.length, 'song')}, newest first. Press and hold to select, then Tag…
                </Text>
              )}
            </View>
          }
          ListEmptyComponent={
            songs ? (
              <EmptyState icon="checkmark-circle-outline" title="Everything's tagged" body="New songs land here until they have a tag." />
            ) : undefined
          }
        />
      </View>
      {selecting && (
        <SelectionBar
          disabled={selected.length === 0}
          actions={[{ label: 'Tag…', icon: 'tags', onPress: selection.editTags }, ...selection.queueActions]}
        />
      )}
    </>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  frame: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  hint: {
    ...font.caption,
    color: colors.textDim,
  },
}));
