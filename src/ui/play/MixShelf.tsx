import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, useWindowDimensions } from 'react-native';

import { notifyLibraryChanged } from '../../db/changes';
import { deleteMix, renameMix, type Mix } from '../../db/mixes';
import type { Rect } from '../Popover';
import { PopupMenu } from '../PopupMenu';
import { PromptDialog } from '../PromptDialog';
import { colors, font, spacing } from '../theme';
import { MixCard } from './MixCard';

const COLUMNS = 2;
const GAP = spacing.md;

export interface MixShelfProps {
  mixes: readonly Mix[];
  /** Album ids for each mix's artwork, most played first. */
  art: ReadonlyMap<number, readonly string[]>;
  /** A mix in words: "kpop × chill, not sad". */
  describe: (mix: Mix) => string;
  /** A mix's colour, for one with no artwork: its first tag's. */
  colorOf: (mix: Mix) => string;
  onPlay: (mix: Mix) => void;
  /** Loads it into the pot above, to change. */
  onEdit: (mix: Mix) => void;
  /** Disables scrolling while something is being dragged. */
  scrollEnabled?: boolean;
}

/**
 * Saved mixes, under the pot on the Play tab: what you've made before, below
 * what you're making now (a mix is a saved pot). Tap one to shuffle it; hold
 * it for Edit (into the pot), Rename and Delete.
 */
export function MixShelf({ mixes, art, describe, colorOf, onPlay, onEdit, scrollEnabled }: MixShelfProps) {
  const db = useSQLiteContext();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = (screenWidth - spacing.lg * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
  /** The mix whose menu is open (and where its card is), and the one being renamed. */
  const [menu, setMenu] = useState<{ mix: Mix; at: Rect } | null>(null);
  const [renaming, setRenaming] = useState<Mix | null>(null);

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
    <>
      <FlatList
        data={mixes}
        keyExtractor={(mix) => String(mix.id)}
        numColumns={COLUMNS}
        scrollEnabled={scrollEnabled}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.grid}
        ListEmptyComponent={
          <Text style={styles.hint}>Mixes you save show up here. Build one above, then tap Save as mix.</Text>
        }
        renderItem={({ item }) => (
          <MixCard
            name={item.name}
            description={describe(item)}
            albumIds={art.get(item.id) ?? []}
            color={colorOf(item)}
            width={cardWidth}
            onPress={() => onPlay(item)}
            onLongPress={(at) => setMenu({ mix: item, at })}
          />
        )}
      />
      <PopupMenu
        anchor={menu?.at ?? null}
        actions={
          menu
            ? [
                { label: 'Edit', onPress: () => onEdit(menu.mix) },
                { label: 'Rename', onPress: () => setRenaming(menu.mix) },
                { label: 'Delete', destructive: true, onPress: () => confirmDelete(menu.mix) },
              ]
            : []
        }
        onClose={() => setMenu(null)}
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
    </>
  );
}

const styles = StyleSheet.create({
  grid: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  row: {
    gap: GAP,
  },
  hint: {
    ...font.caption,
    color: colors.textFaint,
    textAlign: 'center',
    paddingTop: spacing.lg,
  },
});
