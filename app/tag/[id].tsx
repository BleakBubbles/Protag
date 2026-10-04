import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { notifyLibraryChanged } from '@/db/changes';
import {
  deleteTag,
  ensureTagPath,
  getTagDeletionImpact,
  listAllSongTags,
  listTags,
  listTagsWithCounts,
  parseTagPath,
  renameTag,
  reparentTag,
} from '@/db/tags';
import type { TagRow as Tag } from '@/db/types';
import { albumArtUri } from '@/library/assets';
import { buildTagIndex } from '@/library/tagTree';
import { openSongTags, openTag } from '@/navigation';
import { useNowPlaying, usePlayerActions, usePlayQuery } from '@/player/PlayerProvider';
import { findSongs } from '@/query/run';
import type { TagQuery } from '@/query/types';
import { ActionSheet, type SheetAction } from '@/ui/ActionSheet';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { plural } from '@/ui/format';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { IconButton } from '@/ui/IconButton';
import { SONG_ROW_HEIGHT, SongRow } from '@/ui/library/SongRow';
import { TagRow } from '@/ui/library/TagRow';
import { PromptDialog } from '@/ui/PromptDialog';
import { colors, font, spacing } from '@/ui/theme';

const NO_TAGS: readonly Tag[] = [];

type Dialog = 'menu' | 'rename' | 'move' | 'add-subtag' | null;

/** One tag: its subtags, every song under it (subtags included), and shuffle. */
export default function TagScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const db = useSQLiteContext();
  const playQuery = usePlayQuery();
  const { playQueue } = usePlayerActions();
  const { song: current, queue } = useNowPlaying();
  const [dialog, setDialog] = useState<Dialog>(null);

  const { data } = useLibraryQuery(
    async (db) => {
      const query: TagQuery = { type: 'tag', tagId: id, includeDescendants: true };
      const [tags, children, songs, songTags] = await Promise.all([
        listTags(db),
        listTagsWithCounts(db, id),
        findSongs(db, query, { order: 'title' }),
        listAllSongTags(db),
      ]);
      return { index: buildTagIndex(tags), children, songs, songTags };
    },
    [id]
  );

  const tag = data?.index.byId.get(id);
  const ancestors = data && tag ? data.index.path(id).slice(0, -1) : [];

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

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: tag?.name ?? '',
          headerRight: () => (
            <IconButton icon="ellipsis-horizontal" label="Tag options" onPress={() => setDialog('menu')} />
          ),
        }}
      />

      <FlatList
        data={data?.songs ?? []}
        keyExtractor={(song) => String(song.id)}
        getItemLayout={(_, index) => ({ length: SONG_ROW_HEIGHT, offset: SONG_ROW_HEIGHT * index, index })}
        renderItem={({ item }) => (
          <SongRow
            id={item.id}
            title={item.title}
            artist={item.artist}
            artworkUri={albumArtUri(item.album_id)}
            tags={data?.songTags.get(item.id) ?? NO_TAGS}
            active={current?.id === item.id}
            onPress={playFrom}
            onEditTags={openSongTags}
          />
        )}
        ListHeaderComponent={
          <View style={styles.header}>
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
              <Button
                label={songCount > 0 ? `Shuffle · ${plural(songCount, 'song')}` : 'No songs to shuffle'}
                disabled={songCount === 0}
                onPress={() => playQuery({ type: 'tag', tagId: id, includeDescendants: true })}
              />
              <Text style={styles.sectionLabel}>Subtags</Text>
            </View>
            {/* Full-width rows, like the Tags view — outside the padded blocks. */}
            {data?.children.map((child) => (
              <TagRow
                key={child.id}
                name={child.name}
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
          data ? (
            <Text style={styles.emptySongs}>
              No songs yet. Tag one from the Songs tab, or from the player.
            </Text>
          ) : null
        }
      />

      <ActionSheet visible={dialog === 'menu'} title={tag?.name} actions={menu} onClose={() => setDialog(null)} />
      <ActionSheet
        visible={dialog === 'move'}
        title={`Move "${tag?.name ?? ''}" to`}
        actions={moveTargets}
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
    color: colors.accent,
  },
  sectionLabel: {
    ...font.caption,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
  emptySongs: {
    ...font.body,
    color: colors.textDim,
    paddingHorizontal: spacing.lg,
  },
});
