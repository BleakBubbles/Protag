import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { notifyLibraryChanged } from '../../db/changes';
import { deleteMix, renameMix, type Mix } from '../../db/mixes';
import type { Rect } from '../Popover';
import { PopupMenu } from '../PopupMenu';
import { PromptDialog } from '../PromptDialog';
import { font, radius, spacing } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';
import { ArtMosaic } from './ArtMosaic';
import { MixCard } from './MixCard';

const THUMB = 44;

/** One of a mix's ingredients, as a small chip in its menu: its name, on its tag's colour (null: an artist or album). */
export interface MixChip {
  label: string;
  color: string | null;
}

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
  /** Its ingredients as chips, for the head of its menu. */
  chipsOf: (mix: Mix) => readonly MixChip[];
  onPlay: (mix: Mix) => void;
  /** Loads it into the pot above, to change. */
  onEdit: (mix: Mix) => void;
  /** Disables scrolling while something is being dragged. */
  scrollEnabled?: boolean;
}

/**
 * Saved mixes, under the pot on the Play tab: what you've made before, below
 * what you're making now (a mix is a saved pot). Tap one to shuffle it; hold
 * it for a menu under its artwork, headed by the mix itself (artwork, name,
 * its tags as chips): Edit (into the pot), Rename, Delete.
 */
export function MixShelf({ mixes, art, describe, colorOf, chipsOf, onPlay, onEdit, scrollEnabled }: MixShelfProps) {
  const styles = useStyles();
  const db = useSQLiteContext();
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = (screenWidth - spacing.lg * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
  /** The mix whose menu is open (and where its artwork is), and the one being renamed. */
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
        extraData={menu}
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
            held={menu?.mix.id === item.id}
          />
        )}
      />
      <PopupMenu
        anchor={menu?.at ?? null}
        dim
        flush
        header={menu && <MixMenuHead name={menu.mix.name} albumIds={art.get(menu.mix.id) ?? []} color={colorOf(menu.mix)} chips={chipsOf(menu.mix)} />}
        actions={
          menu
            ? [
                { label: 'Edit', icon: 'edit', onPress: () => onEdit(menu.mix) },
                { label: 'Rename', icon: 'rename', onPress: () => setRenaming(menu.mix) },
                { label: 'Delete', icon: 'delete', destructive: true, onPress: () => confirmDelete(menu.mix) },
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

/** The head of a mix's menu: the mix it's for, by its artwork, name and tags. */
function MixMenuHead({ name, albumIds, color, chips }: { name: string; albumIds: readonly string[]; color: string; chips: readonly MixChip[] }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.head}>
      <View style={styles.headRow}>
        <View style={styles.thumb}>
          <ArtMosaic albumIds={albumIds} size={THUMB} fallbackColor={color} />
        </View>
        <Text style={styles.headName} numberOfLines={2}>
          {name}
        </Text>
      </View>
      {chips.length > 0 && (
        <View style={styles.chips}>
          {chips.map((chip, i) => (
            <View key={i} style={[styles.chip, { backgroundColor: chip.color ?? colors.border }]}>
              <Text style={[styles.chipText, chip.color === null && styles.chipNeutral]} numberOfLines={1}>
                {chip.label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  // Room above the first row for a held card's ring, which the list would clip.
  grid: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  row: {
    gap: GAP,
  },
  head: {
    gap: spacing.sm,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  thumb: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  headName: {
    ...font.name,
    flexShrink: 1,
    color: colors.text,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  chip: {
    height: 22,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    maxWidth: '100%',
  },
  chipText: {
    ...font.caption,
    color: colors.onTag,
  },
  chipNeutral: {
    color: colors.text,
  },
  hint: {
    ...font.caption,
    color: colors.textFaint,
    textAlign: 'center',
    paddingTop: spacing.lg,
  },
}));
