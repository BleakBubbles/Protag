import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { notifyLibraryChanged } from '@/db/changes';
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
import { openAddSongs, openTag, useFromPlayer } from '@/navigation';
import { useNowPlaying, usePlayerActions, usePlayQuery } from '@/player/PlayerProvider';
import { buildQuery, EMPTY_DRAFT } from '@/query/types';
import { Button } from '@/ui/Button';
import { ChoiceDialog } from '@/ui/ChoiceDialog';
import { ColorPopover } from '@/ui/ColorPopover';
import { EmptyState } from '@/ui/EmptyState';
import { FAB_CLEARANCE, useFabFold } from '@/ui/Fab';
import { FabMenu } from '@/ui/FabMenu';
import { plural } from '@/ui/format';
import { useFixedRowLayout } from '@/ui/hooks/useFixedRowLayout';
import { useSongSelection } from '@/ui/hooks/useSongSelection';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { IconButton } from '@/ui/IconButton';
import { useAnchor } from '@/ui/Popover';
import { PopupMenu, type MenuAction } from '@/ui/PopupMenu';
import { SelectionBar } from '@/ui/library/SelectionBar';
import { SONG_ROW_HEIGHT, SongRow } from '@/ui/library/SongRow';
import { TagRow } from '@/ui/library/TagRow';
import { LogoMark } from '@/ui/LogoMark';
import { PromptDialog } from '@/ui/PromptDialog';
import { headerTitleText } from '@/ui/stackOptions';
import { colors, font, iconSize, spacing, tagColor } from '@/ui/theme';

const NO_TAGS: readonly Tag[] = [];
const SHUFFLE_SIZE = 52;

type Dialog = 'rename' | 'move' | 'add-subtag' | null;

/** One tag: its subtags, every song under it (subtags included), and shuffle. */
export default function TagScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const db = useSQLiteContext();
  const playQuery = usePlayQuery();
  const { playQueue } = usePlayerActions();
  const { song: current, queue } = useNowPlaying();
  const [dialog, setDialog] = useState<Dialog>(null);
  /** The ⋯ menu and the colour picker, each floating from what opened it. */
  const menuAnchor = useAnchor();
  const fromPlayer = useFromPlayer();
  const colorAnchor = useAnchor();
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

  const songIds = useMemo(() => data?.songs.map((s) => s.id), [data]);
  const { selection, selecting, selected, toggle, clear, editTags, queueActions, header: selectionHeader } = useSongSelection(songIds);

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
          <Button label="Go back" variant="tonal" onPress={() => router.back()} />
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

  const menu: MenuAction[] = [
    { label: 'Rename', icon: 'rename', onPress: () => setDialog('rename') },
    { label: 'Move to…', icon: 'move-to', onPress: () => setDialog('move') },
    { label: 'Delete', icon: 'delete', destructive: true, onPress: confirmDelete },
  ];

  const moveTargets: MenuAction[] =
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
    clear();
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
          <View ref={colorAnchor.ref} collapsable={false}>
            <Pressable
              onPress={colorAnchor.open}
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
        </View>
      ) : null,
    headerRight: () => (
      <View ref={menuAnchor.ref} collapsable={false}>
        <IconButton icon="ellipsis-horizontal" label="Tag options" onPress={menuAnchor.open} />
      </View>
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
                    <Pressable key={ancestor.id} onPress={() => openTag(ancestor.id, fromPlayer)} hitSlop={8}>
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
                    onPress={() => {
                      // As a one-tag combination, so the player can offer to save it as a mix.
                      const draft = { ...EMPTY_DRAFT, ingredients: [[id]] };
                      playQuery(buildQuery(draft), { draft });
                    }}
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
                onPress={() => openTag(child.id, fromPlayer)}
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
          ) : undefined
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
              onPress: editTags,
            },
            ...queueActions,
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
      <PopupMenu anchor={menuAnchor.rect} actions={menu} onClose={menuAnchor.close} />
      <ChoiceDialog
        visible={dialog === 'move'}
        title={`Move "${tag?.name ?? ''}" to`}
        choices={moveTargets}
        onClose={() => setDialog(null)}
      />
      <ColorPopover
        anchor={colorAnchor.rect}
        selected={tag?.color}
        onSelect={async (color) => {
          await setTagColor(db, id, color);
          notifyLibraryChanged();
        }}
        onClose={colorAnchor.close}
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
  // Matches the other screens' titles.
  titleText: {
    ...headerTitleText,
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
