import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, BackHandler, FlatList, Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';

import { notifyLibraryChanged } from '../../db/changes';
import { deleteMix, renameMix, type Mix } from '../../db/mixes';
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
  /** Covered by the tags: a held card lets go. */
  hidden?: boolean;
}

/**
 * Saved mixes, under the pot on the Play tab: what you've made before, below
 * what you're making now (a mix is a saved pot). Tap one to shuffle it; hold
 * it and its artwork offers Edit (into the pot), Rename and Delete. A tap
 * anywhere else, a scroll or Back lets it go.
 */
export function MixShelf({ mixes, art, describe, colorOf, onPlay, onEdit, scrollEnabled, hidden }: MixShelfProps) {
  const db = useSQLiteContext();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = (screenWidth - spacing.lg * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
  /** The mix being held (offering its actions), and the one being renamed. */
  const [heldId, setHeldId] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<Mix | null>(null);
  const letGo = useCallback(() => setHeldId(null), []);
  useEffect(() => {
    if (hidden) letGo();
  }, [hidden, letGo]);
  useFocusEffect(
    useCallback(() => {
      if (heldId === null) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        letGo();
        return true;
      });
      return () => sub.remove();
    }, [heldId, letGo])
  );

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
    // A tap on the space between cards lets a held one go.
    <Pressable style={styles.fill} onPress={letGo} disabled={heldId === null} accessible={false}>
      <FlatList
        data={mixes}
        keyExtractor={(mix) => String(mix.id)}
        numColumns={COLUMNS}
        scrollEnabled={scrollEnabled}
        onScrollBeginDrag={letGo}
        extraData={heldId}
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
            // While one is held, a tap anywhere (another card too) only lets it go.
            onPress={() => (heldId === null ? onPlay(item) : letGo())}
            onLongPress={() => {
              setHeldId(item.id);
              performAndroidHapticsAsync(AndroidHaptics.Long_Press).catch(() => {});
            }}
            held={
              heldId === item.id
                ? {
                    onEdit: () => {
                      letGo();
                      onEdit(item);
                    },
                    onRename: () => {
                      letGo();
                      setRenaming(item);
                    },
                    onDelete: () => {
                      letGo();
                      confirmDelete(item);
                    },
                  }
                : undefined
            }
            faded={heldId !== null && heldId !== item.id}
          />
        )}
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
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
