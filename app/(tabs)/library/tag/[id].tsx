import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  BackHandler,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { notifyLibraryChanged, useLibraryVersion } from '@/db/changes';
import {
  deleteTag,
  ensureTagPath,
  getTagDeletionImpact,
  listAllSongTags,
  listTags,
  listSongsInTag,
  listTagsWithCounts,
  parseTagPath,
  removeSongsFromTag,
  renameTag,
  reparentTag,
  setTagColor,
} from '@/db/tags';
import type { TagRow as Tag } from '@/db/types';
import { albumArtUri } from '@/library/assets';
import { buildTagIndex } from '@/library/tagTree';
import { openAddSongs, openEditTags, openTag } from '@/navigation';
import { useNowPlaying, usePlayerActions, usePlayQuery } from '@/player/PlayerProvider';
import { ActionSheet, type SheetAction } from '@/ui/ActionSheet';
import { Button } from '@/ui/Button';
import { ColorSheet } from '@/ui/ColorSheet';
import { EmptyState } from '@/ui/EmptyState';
import { FAB_CLEARANCE, useFabFold } from '@/ui/Fab';
import { FabMenu } from '@/ui/FabMenu';
import { plural } from '@/ui/format';
import { useFixedRowLayout } from '@/ui/hooks/useFixedRowLayout';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { IconButton } from '@/ui/IconButton';
import { SelectionBar } from '@/ui/library/SelectionBar';
import { SONG_ROW_HEIGHT, SongRow } from '@/ui/library/SongRow';
import { TagRow } from '@/ui/library/TagRow';
import { LogoMark } from '@/ui/LogoMark';
import { PromptDialog } from '@/ui/PromptDialog';
import { colors, font, headerTitleStyle, iconSize, spacing, tagColor } from '@/ui/theme';

const NO_TAGS: readonly Tag[] = [];
const SHUFFLE_SIZE = 52;

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
  // Editing the selection's tags happens on its own screen. If that saves (the
  // library changes while it's open), the job is done and selection ends; if
  // it's discarded, the selection is still here to try again.
  const libraryVersion = useLibraryVersion();
  const versionAtEdit = useRef<number | null>(null);
  useEffect(() => {
    if (versionAtEdit.current !== null && libraryVersion !== versionAtEdit.current) {
      versionAtEdit.current = null;
      setSelection(null);
    }
  }, [libraryVersion]);
  const { getItemLayout, onHeaderLayout } = useFixedRowLayout(SONG_ROW_HEIGHT);

  const fab = useFabFold();

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

  // Long-press starts selecting; then taps toggle. Only the header's close
  // button or back leaves selection mode: deselecting everything (one by one or
  // all at once) keeps it, so the next pick is still one tap.
  const toggle = useCallback(
    (songId: number) =>
      setSelection((prev) => {
        const next = new Set(prev);
        if (next.has(songId)) next.delete(songId);
        else next.add(songId);
        return next;
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
        <EmptyState icon="tag" title="This tag no longer exists">
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
  const childCount = data?.children.length ?? 0;

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

  const allSelected = selected.length > 0 && selected.length === songCount;

  const selectionHeader = {
    title: selected.length > 0 ? `${plural(selected.length, 'song')} selected` : 'Select songs',
    headerTitle: undefined,
    headerLeft: () => (
      <IconButton icon="close" label="Stop selecting" onPress={() => setSelection(null)} />
    ),
    // A circle like the rows' own: empty while anything is unselected, filled
    // once everything is.
    headerRight: () =>
      allSelected ? (
        <IconButton icon="checkmark-circle" label="Deselect all" color={colors.accentFg} onPress={() => setSelection(new Set())} />
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
        {...fab.scrollProps}
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
              {/* What's inside, and shuffle once there's something to play. Until
                  then, the empty state below carries the calls to action. */}
              <View style={styles.summaryRow}>
                <Text style={styles.summary}>
                  {[childCount > 0 ? plural(childCount, 'subtag') : null, plural(songCount, 'song')]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {songCount > 0 && (
                  <Pressable
                    onPress={() => playQuery({ type: 'tag', tagId: id, includeDescendants: true })}
                    accessibilityRole="button"
                    accessibilityLabel={`Shuffle ${plural(songCount, 'song')}`}
                    android_ripple={{ color: colors.rippleOnAccent, foreground: true }}
                    style={styles.shuffle}
                  >
                    <Ionicons name="shuffle" size={iconSize.md} color={colors.onAccent} />
                  </Pressable>
                )}
              </View>
            </View>
            {/* Full-width rows, like the Tags view: outside the padded block. */}
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
            {/* Folders first, then songs, like any file browser. */}
            {childCount > 0 && songCount > 0 && <View style={styles.divider} />}
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
              <Button label="New subtag" variant="secondary" onPress={() => setDialog('add-subtag')} />
            </EmptyState>
          ) : null
        }
      />

      {/* Adding songs is a main way to tag, so it stays in reach anywhere in a
          long list. An empty tag has the same call to action in its empty state. */}
      {selecting ? (
        <SelectionBar
          disabled={selected.length === 0}
          actions={[
            // One place for adding, moving and removing other tags: moving is
            // "uncheck this tag, check that one".
            {
              label: 'Tags…',
              icon: 'tags',
              onPress: () => {
                versionAtEdit.current = libraryVersion;
                openEditTags(selected);
              },
            },
            { label: 'Remove', icon: 'remove-circle-outline', destructive: true, onPress: confirmRemove },
          ]}
        />
      ) : (
        songCount > 0 && (
          // Like a file browser's "New": songs are the files, subtags the folders.
          <FabMenu
            label="Add"
            icon="add"
            extended={fab.extended}
            items={[
              { label: 'Add songs', icon: 'musical-notes-outline', onPress: () => openAddSongs(id) },
              { label: 'New subtag', icon: 'folder-outline', onPress: () => setDialog('add-subtag') },
            ]}
          />
        )
      )}
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
  // No gap between children: folder rows sit flush, like the song rows below.
  header: {
    paddingTop: spacing.lg,
  },
  block: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
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
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: SHUFFLE_SIZE,
  },
  summary: {
    ...font.label,
    color: colors.textDim,
  },
  // Round, like a play button in other music apps: the page's main action
  // without a full-width block of text.
  shuffle: {
    width: SHUFFLE_SIZE,
    height: SHUFFLE_SIZE,
    borderRadius: SHUFFLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.xs,
    backgroundColor: colors.border,
  },
});
