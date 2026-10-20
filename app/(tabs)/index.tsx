import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { notifyLibraryChanged } from '@/db/changes';
import { deleteMix, listMixes, renameMix, type Mix } from '@/db/mixes';
import { countSongs } from '@/db/songs';
import { buildDescendantMap, listAllTagsWithCounts } from '@/db/tags';
import { loadMixArt } from '@/library/mixArt';
import { openLibrary, openPlay } from '@/navigation';
import { usePlayQuery } from '@/player/PlayerProvider';
import { describeQuery } from '@/query/describe';
import { buildQuery, pruneDraft } from '@/query/types';
import { ActionSheet } from '@/ui/ActionSheet';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { Icon } from '@/ui/Icon';
import { MixCard } from '@/ui/play/MixCard';
import { useMiniPlayerVisibility } from '@/ui/player/MiniPlayerVisibility';
import { PromptDialog } from '@/ui/PromptDialog';
import { colors, font, iconSize, radius, spacing, tagColor } from '@/ui/theme';

const COLUMNS = 2;
const GAP = spacing.md;
/** The grid's last cell: a way to make another mix. */
const NEW_MIX = 'new';

/**
 * Mixes tab, where the app opens: your saved mixes, one tap to shuffle. Making
 * and changing them happens in Play; this tab only plays and keeps them, so
 * neither page has to explain the other.
 */
export default function MixesScreen() {
  const db = useSQLiteContext();
  const { width: screenWidth } = useWindowDimensions();
  const playQuery = usePlayQuery();
  const { show } = useMiniPlayerVisibility();
  // Opening a tab to start something is how a hidden mini-player comes back.
  useFocusEffect(useCallback(() => show(), [show]));

  const { data } = useLibraryQuery(async (db) => {
    const [songs, tags, descendants, mixes] = await Promise.all([
      countSongs(db),
      listAllTagsWithCounts(db),
      buildDescendantMap(db),
      listMixes(db),
    ]);
    const tagIds = new Set(tags.map((t) => t.id));
    const mixArt = await loadMixArt(db, mixes, tagIds, descendants);
    return { songs, tags, tagIds, mixes, mixArt };
  }, []);

  /** The mix whose long-press options are open, and the one being renamed. */
  const [menuMix, setMenuMix] = useState<Mix | null>(null);
  const [renaming, setRenaming] = useState<Mix | null>(null);

  if (!data) return <View style={styles.screen} />;

  if (data.songs === 0) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="musical-notes-outline" title="No music yet" body="Scan your music from the Library tab to get started.">
          <Button label="Go to Library" onPress={openLibrary} />
        </EmptyState>
      </View>
    );
  }

  if (data.mixes.length === 0) {
    return (
      <View style={styles.screen}>
        <EmptyState
          icon="albums-outline"
          title="Your mixes live here"
          body="Pick tags in Play, then save them with the bookmark. A mix keeps up as you tag more songs."
        >
          <Button label="Make a mix" icon="add" variant="tonal" onPress={() => openPlay()} />
        </EmptyState>
      </View>
    );
  }

  const names = new Map(data.tags.map((t) => [t.id, t.name]));
  const colorOf = new Map(data.tags.map((t) => [t.id, t.color]));
  const cardWidth = (screenWidth - spacing.lg * 2 - GAP * (COLUMNS - 1)) / COLUMNS;

  const queryOf = (mix: Mix) => buildQuery(pruneDraft(mix.draft, data.tagIds));
  const play = (mix: Mix) => playQuery(queryOf(mix), { label: mix.name });

  const confirmDelete = (mix: Mix) =>
    Alert.alert(`Delete "${mix.name}"?`, 'The mix goes; its tags and songs stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteMix(db, mix.id);
          notifyLibraryChanged();
        },
      },
    ]);

  return (
    <View style={styles.screen}>
      <FlatList
        data={[...data.mixes, NEW_MIX] as const}
        keyExtractor={(item) => (item === NEW_MIX ? NEW_MIX : String(item.id))}
        numColumns={COLUMNS}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) =>
          item === NEW_MIX ? (
            <NewMixCard width={cardWidth} />
          ) : (
            <MixCard
              name={item.name}
              description={describeQuery(queryOf(item), names)}
              albumIds={data.mixArt.get(item.id) ?? []}
              color={tagColor(colorOf.get(item.draft.ingredients[0]?.[0] ?? -1) ?? null)}
              width={cardWidth}
              onPress={() => play(item)}
              onLongPress={() => setMenuMix(item)}
            />
          )
        }
      />

      <ActionSheet
        visible={menuMix !== null}
        title={menuMix?.name}
        actions={
          menuMix
            ? [
                { label: 'Edit', onPress: () => openPlay(menuMix.id) },
                { label: 'Rename', onPress: () => setRenaming(menuMix) },
                { label: 'Delete', destructive: true, onPress: () => confirmDelete(menuMix) },
              ]
            : []
        }
        onClose={() => setMenuMix(null)}
      />
      <PromptDialog
        visible={renaming !== null}
        title="Rename mix"
        initialValue={renaming?.name ?? ''}
        onSubmit={async (name) => {
          if (!renaming) return;
          await renameMix(db, renaming.id, name);
          notifyLibraryChanged();
        }}
        onClose={() => setRenaming(null)}
      />
    </View>
  );
}

/** Same footprint as a mix card, so the grid stays even: a dashed square with a plus. */
function NewMixCard({ width }: { width: number }) {
  return (
    <Pressable
      onPress={() => openPlay()}
      accessibilityRole="button"
      accessibilityLabel="New mix"
      style={({ pressed }) => [{ width }, pressed && styles.pressed]}
    >
      <View style={[styles.newArt, { width, height: width }]}>
        <Icon name="add" size={iconSize.lg} color={colors.accentFg} />
      </View>
      <Text style={styles.newLabel}>New mix</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  grid: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  row: {
    gap: GAP,
  },
  pressed: {
    opacity: 0.7,
  },
  newArt: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  newLabel: {
    ...font.listTitle,
    color: colors.accentFg,
  },
});
