import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  BackHandler,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { notifyLibraryChanged } from '@/db/changes';
import {
  addTagToSongs,
  deleteTag,
  ensureTagPath,
  getTagDeletionImpact,
  listAllSongTags,
  listTags,
  listSongsInTag,
  listTagsWithCounts,
  moveSongsToTag,
  parseTagPath,
  removeSongsFromTag,
  renameTag,
  reparentTag,
  setTagColor,
} from '@/db/tags';
import type { TagRow as Tag } from '@/db/types';
import { albumArtUri } from '@/library/assets';
import { buildTagIndex } from '@/library/tagTree';
import { openAddSongs, openTag } from '@/navigation';
import { useNowPlaying, usePlayerActions, usePlayQuery } from '@/player/PlayerProvider';
import { ActionSheet, type SheetAction } from '@/ui/ActionSheet';
import { Button } from '@/ui/Button';
import { ColorSheet } from '@/ui/ColorSheet';
import { EmptyState } from '@/ui/EmptyState';
import { Fab, FAB_CLEARANCE } from '@/ui/Fab';
import { plural } from '@/ui/format';
import { useFixedRowLayout } from '@/ui/hooks/useFixedRowLayout';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { IconButton } from '@/ui/IconButton';
import { SelectionBar } from '@/ui/library/SelectionBar';
import { SONG_ROW_HEIGHT, SongRow } from '@/ui/library/SongRow';
import { TagRow } from '@/ui/library/TagRow';
import { LogoMark } from '@/ui/LogoMark';
import { PromptDialog } from '@/ui/PromptDialog';
import { colors, font, headerTitleStyle, spacing, tagColor } from '@/ui/theme';

const NO_TAGS: readonly Tag[] = [];
/** Scrolled further than this, the add button folds to its icon. */
const FAB_FOLD_AT = 48;

type Dialog = 'menu' | 'rename' | 'color' | 'move' | 'add-subtag' | null;

/** One tag: its subtags, every song under it (subtags included), and shuffle. */
export default function TagScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const db = useSQLiteContext();
  const playQuery = usePlayQuery();
  const { playQueue } = usePlayerActions();
  const { song: current, queue } = useNowPlaying();
  const [dialog, setDialog] = useState<Dialog>(null);
  /** Selection mode: the selected song ids, or null when not selecting. */
  const [selection, setSelection] = useState<ReadonlySet<number> | null>(null);
  /** Which tag picker is open for the selection. */
  const [picking, setPicking] = useState<'add' | 'move' | null>(null);
  const { getItemLayout, onHeaderLayout } = useFixedRowLayout(SONG_ROW_HEIGHT);

  // The add button shows its label at the top of the page and folds to just the
  // plus once the list is scrolled. It changes only when crossing that line, not
  // with every change of scroll direction: a button that's always there shouldn't
  // keep moving and pulling the eye away from the songs.
  const [fabExtended, setFabExtended] = useState(true);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setFabExtended(e.nativeEvent.contentOffset.y < FAB_FOLD_AT);
  }, []);

  const { data } = useLibraryQuery(
    async (db) => {
      const [tags, children, songs, songTags] = await Promise.all([
        listTags(db),
        listTagsWithCounts(db, id),
        listSongsInTag(db, id),
        listAllSongTags(db),
      ]);
      return { index: buildTagIndex(tags), children, songs, songTags };
    },
    [id]
  );

  const tag = data?.index.byId.get(id);
  const ancestors = data && tag ? data.index.path(id).slice(0, -1) : [];

  // Long-press starts selecting; then taps toggle. Deselecting the last song,
  // the header's close button, or back leaves selection mode.
  const toggle = useCallback(
    (songId: number) =>
      setSelection((prev) => {
        const next = new Set(prev);
        if (next.has(songId)) next.delete(songId);
        else next.add(songId);
        return next.size > 0 ? next : null;
      }),
    []
  );
  const selecting = selection !== null;
  useFocusEffect(
    useCallback(() => {
      if (!selecting) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setSelection(null);
        return true;
      });
      return () => sub.remove();
    }, [selecting])
  );
  // Songs can leave the list under a selection (e.g. retagged elsewhere).
  const selected = useMemo(
    () => (selection && data ? data.songs.filter((s) => selection.has(s.id)).map((s) => s.id) : []),
    [selection, data]
  );

  const playFrom = useCallback(
    (songId: number) =>
      tag &&
      data &&
      playQueue(
        data.songs.map((s) => s.id),
        { startId: songId, shuffle: queue.shuffled, label: tag.name }
      ),
    [tag, data, playQueue, queue.shuffled]
  );

  if (data && !tag) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState icon="pricetag-outline" title="This tag no longer exists">
          <Button label="Go back" onPress={() => router.back()} />
        </EmptyState>
      </View>
    );
  }

  const confirmDelete = async () => {
    if (!tag) return;
    const impact = await getTagDeletionImpact(db, id);
    const parts = [
      impact.subtags > 0 ? `its ${plural(impact.subtags, 'subtag')}` : null,
      impact.songs > 0 ? `removes it from ${plural(impact.songs, 'song')}` : null,
    ].filter(Boolean);
    Alert.alert(
      `Delete "${tag.name}"?`,
      `${parts.length > 0 ? `This deletes ${parts.join(' and ')}. ` : ''}The songs themselves stay in your library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteTag(db, id);
            // Leave first, so this screen doesn't flash "no longer exists".
            router.back();
            notifyLibraryChanged();
          },
        },
      ]
    );
  };

  const moveTo = async (parentId: number | null) => {
    try {
      await reparentTag(db, id, parentId);
      notifyLibraryChanged();
    } catch (error) {
      Alert.alert("Couldn't move tag", error instanceof Error ? error.message : String(error));
    }
  };

  const menu: SheetAction[] = [
    { label: 'Rename', onPress: () => setDialog('rename') },
    { label: 'Move to…', onPress: () => setDialog('move') },
    { label: 'Delete', destructive: true, onPress: confirmDelete },
  ];

  const moveTargets: SheetAction[] =
    data && tag
      ? [
          { label: 'Top level', disabled: tag.parent_id === null, onPress: () => moveTo(null) },
          ...data.index.validParents(id).map((parent) => ({
            label: data.index.label(parent.id),
            disabled: parent.id === tag.parent_id,
            onPress: () => moveTo(parent.id),
          })),
        ]
      : [];

  const songCount = data?.songs.length ?? 0;

  const done = () => {
    setSelection(null);
    notifyLibraryChanged();
  };

  const confirmRemove = () => {
    if (!tag) return;
    const subtags = (data?.children.length ?? 0) > 0;
    Alert.alert(
      `Remove ${plural(selected.length, 'song')} from "${tag.name}"?`,
      `${subtags ? 'They leave its subtags too. ' : ''}The songs stay in your library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeSongsFromTag(db, selected, id);
            done();
          },
        },
      ]
    );
  };

  // Every other tag, by path. A picked tag gets the selection (and, for a move,
  // this tag gives it up).
  const targets: SheetAction[] = data
    ? data.index
        .all()
        .filter((t) => t.id !== id)
        .map((t) => ({
          label: data.index.label(t.id),
          onPress: async () => {
            if (picking === 'move') await moveSongsToTag(db, selected, id, t.id);
            else await addTagToSongs(db, selected, t.id);
            done();
          },
        }))
    : [];

  const allSelected = selected.length > 0 && selected.length === songCount;

  const selectionHeader = {
    title: `${plural(selected.length, 'song')} selected`,
    headerTitle: undefined,
    headerLeft: () => (
      <IconButton icon="close" label="Stop selecting" onPress={() => setSelection(null)} />
    ),
    // A circle like the rows' own: empty while anything is unselected, filled
    // once everything is. Clearing everything also leaves selection mode.
    headerRight: () =>
      allSelected ? (
        <IconButton icon="checkmark-circle" label="Deselect all" color={colors.accentFg} onPress={() => setSelection(null)} />
      ) : (
        <IconButton
          icon="ellipse-outline"
          label="Select all"
          onPress={() => setSelection(new Set(data?.songs.map((s) => s.id)))}
        />
      ),
  };

  const tagHeader = {
    headerLeft: undefined,
    title: tag?.name ?? '',
    // The colour follows the name, so the two read as one, and tapping it
    // is the way to change it. After the name rather than before it, which
    // put it too close to the back arrow. The name shrinks first, so a
    // long name truncates and the dot stays visible.
    headerTitle: () =>
      tag ? (
        <View style={styles.titleRow}>
          <Text style={styles.titleText} numberOfLines={1}>
            {tag.name}
          </Text>
          <Pressable
            onPress={() => setDialog('color')}
            hitSlop={15}
            accessibilityRole="button"
            accessibilityLabel={`Colour: ${tag.color ?? 'none'}. Change colour`}
            style={({ pressed }) => [
              styles.titleDot,
              { backgroundColor: tagColor(tag.color) },
              pressed && styles.titleDotPressed,
            ]}
          />
        </View>
      ) : null,
    headerRight: () => (
      <IconButton icon="ellipsis-horizontal" label="Tag options" onPress={() => setDialog('menu')} />
    ),
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={selecting ? selectionHeader : tagHeader} />

      <FlatList
        data={data?.songs ?? []}
        keyExtractor={(song) => String(song.id)}
        getItemLayout={getItemLayout}
        extraData={selection}
        onScroll={onScroll}
        scrollEventThrottle={32}
        // Throttling can drop the event for where a short scroll actually stops;
        // these two always report the final position.
        onScrollEndDrag={onScroll}
        onMomentumScrollEnd={onScroll}
        contentContainerStyle={songCount > 0 ? { paddingBottom: FAB_CLEARANCE } : undefined}
        renderItem={({ item }) => (
          <SongRow
            id={item.id}
            title={item.title}
            artist={item.artist}
            artworkUri={albumArtUri(item.album_id)}
            tags={data?.songTags.get(item.id) ?? NO_TAGS}
            active={current?.id === item.id}
            selecting={selecting}
            selected={selection?.has(item.id) ?? false}
            onPress={selecting ? toggle : playFrom}
            onLongPress={toggle}
          />
        )}
        ListHeaderComponent={
          <View style={styles.header} onLayout={onHeaderLayout}>
            <View style={styles.block}>
              {ancestors.length > 0 && (
                <View style={styles.breadcrumb}>
                  <Text style={styles.crumbText}>in </Text>
                  {ancestors.map((ancestor, i) => (
                    <Pressable key={ancestor.id} onPress={() => openTag(ancestor.id)} hitSlop={8}>
                      <Text style={styles.crumbLink}>
                        {ancestor.name}
                        {i < ancestors.length - 1 ? ' › ' : ''}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
              {/* Shuffle once there's something to play. Until then, the empty
                  state below carries the one call to action: add songs. */}
              {songCount > 0 && (
                <Button
                  label={`Shuffle · ${plural(songCount, 'song')}`}
                  onPress={() => playQuery({ type: 'tag', tagId: id, includeDescendants: true })}
                />
              )}
              <Text style={styles.sectionLabel}>Subtags</Text>
            </View>
            {/* Full-width rows, like the Tags view — outside the padded blocks. */}
            {data?.children.map((child) => (
              <TagRow
                key={child.id}
                name={child.name}
                color={child.color}
                songCount={child.song_count}
                childCount={child.child_count}
                onPress={() => openTag(child.id)}
              />
            ))}
            <View style={styles.block}>
              <Button label="Add subtag" variant="secondary" onPress={() => setDialog('add-subtag')} />
              <Text style={styles.sectionLabel}>Songs</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          data && tag ? (
            <EmptyState
              art={<LogoMark width={56} color={colors.border} />}
              title="No songs yet"
              body={`Add songs to "${tag.name}" here, or tag them from the player as you listen.`}
            >
              <Button label="Add songs" icon="add" variant="tonal" onPress={() => openAddSongs(id)} />
            </EmptyState>
          ) : null
        }
      />

      {/* Adding songs is a main way to tag, so it stays in reach anywhere in a
          long list. An empty tag has the same call to action in its empty state. */}
      {selecting ? (
        <SelectionBar
          actions={[
            { label: 'Add to…', icon: 'pricetag-outline', onPress: () => setPicking('add') },
            { label: 'Move to…', icon: 'arrow-redo-outline', onPress: () => setPicking('move') },
            { label: 'Remove', icon: 'remove-circle-outline', destructive: true, onPress: confirmRemove },
          ]}
        />
      ) : (
        songCount > 0 && (
          <Fab label="Add songs" icon="add" extended={fabExtended} onPress={() => openAddSongs(id)} />
        )
      )}
      <ActionSheet
        visible={picking !== null}
        title={`${picking === 'move' ? 'Move' : 'Add'} ${plural(selected.length, 'song')} to`}
        actions={targets.length > 0 ? targets : [{ label: 'No other tags yet', disabled: true, onPress: () => {} }]}
        onClose={() => setPicking(null)}
      />
      <ActionSheet visible={dialog === 'menu'} title={tag?.name} actions={menu} onClose={() => setDialog(null)} />
      <ActionSheet
        visible={dialog === 'move'}
        title={`Move "${tag?.name ?? ''}" to`}
        actions={moveTargets}
        onClose={() => setDialog(null)}
      />
      <ColorSheet
        visible={dialog === 'color'}
        title={`Colour for "${tag?.name ?? ''}"`}
        selected={tag?.color}
        onSelect={async (color) => {
          await setTagColor(db, id, color);
          notifyLibraryChanged();
        }}
        onClose={() => setDialog(null)}
      />
      <PromptDialog
        visible={dialog === 'rename'}
        title="Rename tag"
        initialValue={tag?.name ?? ''}
        onSubmit={async (name) => {
          await renameTag(db, id, name);
          notifyLibraryChanged();
        }}
        onClose={() => setDialog(null)}
      />
      <PromptDialog
        visible={dialog === 'add-subtag'}
        title={`New tag in "${tag?.name ?? ''}"`}
        message="Use / to nest further."
        placeholder="Tag name"
        confirmLabel="Create"
        onSubmit={async (input) => {
          await ensureTagPath(db, parseTagPath(input), id);
          notifyLibraryChanged();
        }}
        onClose={() => setDialog(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexShrink: 1,
  },
  titleDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  titleDotPressed: {
    opacity: 0.6,
  },
  // Matches the navigator's own titles on the other screens: display face, at
  // the header's default Android size rather than `font.heading`'s 17.
  titleText: {
    ...headerTitleStyle,
    fontSize: 20,
    lineHeight: 26,
    color: colors.text,
    flexShrink: 1,
  },
  header: {
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  block: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  breadcrumb: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  crumbText: {
    ...font.label,
    color: colors.textFaint,
  },
  crumbLink: {
    ...font.label,
    color: colors.accentFg,
  },
  sectionLabel: {
    ...font.caption,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
});
