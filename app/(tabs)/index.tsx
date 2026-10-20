import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { notifyLibraryChanged } from '@/db/changes';
import { deleteMix, listMixes, MixError, renameMix, saveMix, type Mix } from '@/db/mixes';
import { countSongs } from '@/db/songs';
import { buildDescendantMap, listAllTagsWithCounts } from '@/db/tags';
import type { TagWithCounts } from '@/db/types';
import { loadMixArt } from '@/library/mixArt';
import { openLibrary } from '@/navigation';
import { usePlayQuery } from '@/player/PlayerProvider';
import { describeQuery } from '@/query/describe';
import { dropInPot, tapExcluded, tapIngredient, tapTag, type PotItem, type PotSpot } from '@/query/pot';
import { countMatching } from '@/query/run';
import { buildQuery, EMPTY_DRAFT, isEmptyDraft, pruneDraft, tagChoice, type QueryDraft } from '@/query/types';
import { ActionSheet } from '@/ui/ActionSheet';
import { Button } from '@/ui/Button';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { MixShelf } from '@/ui/play/MixShelf';
import { ingredientKey, Pot, potInnerWidth, type ShuffleCount } from '@/ui/play/Pot';
import { DragGhost, PotDragContext, usePotDragRoot } from '@/ui/play/PotDrag';
import { TagGrid } from '@/ui/play/TagGrid';
import { useMiniPlayerVisibility } from '@/ui/player/MiniPlayerVisibility';
import { PromptDialog } from '@/ui/PromptDialog';
import { colors, font, spacing, tagColor } from '@/ui/theme';

/**
 * Play tab: choose what to shuffle. Saved mixes on top for one tap; below, the
 * builder: tag tiles that go into the pot at the bottom, by tap or by drag,
 * with a live count. What's playing lives in the mini-player and the full
 * player it opens.
 */
export default function PlayScreen() {
  const { show } = useMiniPlayerVisibility();
  // Opening Play is how a hidden mini-player comes back.
  useFocusEffect(useCallback(() => show(), [show]));

  const { data } = useLibraryQuery(async (db) => {
    const [songs, tags, descendants, mixes] = await Promise.all([
      countSongs(db),
      listAllTagsWithCounts(db),
      buildDescendantMap(db),
      listMixes(db),
    ]);
    const mixArt = await loadMixArt(db, mixes, new Set(tags.map((t) => t.id)), descendants);
    // A tag with nothing under it can't be shuffled, so the builder leaves it out.
    return { songs, tags: tags.filter((t) => t.song_count > 0), descendants, mixes, mixArt };
  }, []);

  if (!data) return <View style={styles.screen} />;

  if (data.songs === 0) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Ionicons name="musical-notes-outline" size={64} color={colors.textFaint} />
        <Text style={styles.title}>No music yet</Text>
        <Text style={styles.body}>Scan your music from the Library tab to get started.</Text>
        <Button label="Go to Library" onPress={openLibrary} />
      </View>
    );
  }

  return <Builder {...data} />;
}

type LibraryData = {
  songs: number;
  tags: TagWithCounts[];
  descendants: Map<number, number[]>;
  mixes: Mix[];
  mixArt: Map<number, string[]>;
};

function Builder({ tags, descendants, mixes, mixArt }: LibraryData) {
  const db = useSQLiteContext();
  const { width: screenWidth } = useWindowDimensions();
  const playQuery = usePlayQuery();
  const [draft, setDraft] = useState<QueryDraft>(EMPTY_DRAFT);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  /** The mix last opened for editing, so saving offers to update it. */
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** The mix whose long-press options are open, and the one being renamed. */
  const [menuMix, setMenuMix] = useState<Mix | null>(null);
  const [renaming, setRenaming] = useState<Mix | null>(null);

  const names = useMemo(() => new Map(tags.map((t) => [t.id, t.name])), [tags]);
  const hues = useMemo(() => new Map(tags.map((t) => [t.id, tagColor(t.color)])), [tags]);
  const children = useMemo(() => {
    const map = new Map<number | null, TagWithCounts[]>();
    for (const tag of tags) map.set(tag.parent_id, [...(map.get(tag.parent_id) ?? []), tag]);
    return map;
  }, [tags]);

  // Tags can be deleted (or emptied) while chosen here; quietly drop them.
  const current = useMemo(() => pruneDraft(draft, new Set(names.keys())), [draft, names]);
  const query = useMemo(() => buildQuery(current), [current]);

  // The Shuffle label changes once per tap, when the new count is in, rather
  // than first showing the new pot with the old number.
  const [counted, setCounted] = useState<ShuffleCount | null>(null);
  const [ingredientCounts, setIngredientCounts] = useState<ReadonlyMap<string, number>>(new Map());
  useEffect(() => {
    let live = true;
    const empty = isEmptyDraft(current);
    countMatching(db, query, descendants).then((count) => live && setCounted({ empty, count }));
    // Each ingredient on its own (exclusions aside), so combining visibly narrows.
    // Keyed by its tags, so a count never shows on the wrong chip while they move.
    Promise.all(
      current.ingredients.map(
        async (tags) =>
          [
            ingredientKey(tags),
            await countMatching(db, buildQuery({ ...current, ingredients: [tags], exclude: [] }), descendants),
          ] as const
      )
    ).then((entries) => live && setIngredientCounts(new Map(entries)));
    return () => {
      live = false;
    };
  }, [db, query, current, descendants]);

  const describe = useCallback(
    (d: QueryDraft) => describeQuery(buildQuery(pruneDraft(d, new Set(names.keys()))), names),
    [names]
  );

  const clear = () => {
    setDraft(EMPTY_DRAFT);
    setEditing(null);
  };

  const playMix = (mix: Mix) => playQuery(buildQuery(pruneDraft(mix.draft, new Set(names.keys()))), { label: mix.name });
  const withMix = (id: number, act: (mix: Mix) => void) => {
    const mix = mixes.find((m) => m.id === id);
    if (mix) act(mix);
  };

  // An emptied pot is no longer the mix that was opened; it shows the mixes again.
  const potEmpty = isEmptyDraft(current);
  useEffect(() => {
    if (potEmpty) setEditing(null);
  }, [potEmpty]);

  const confirmDelete = (mix: Mix) =>
    Alert.alert(`Delete "${mix.name}"?`, 'The mix goes; its tags and songs stay.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteMix(db, mix.id);
          if (editing?.toLowerCase() === mix.name.toLowerCase()) setEditing(null);
          notifyLibraryChanged();
        },
      },
    ]);

  const toggleExpanded = useCallback(
    (id: number) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    []
  );
  const choiceOf = useCallback((id: number) => tagChoice(current, id), [current]);
  // Pot changes apply to the pruned draft: it's what's on screen, so its indices are the ones tapped.
  const tap = useCallback((id: number) => setDraft(tapTag(current, id)), [current]);
  const drag = usePotDragRoot((item: PotItem, spot: PotSpot) => setDraft(dropInPot(current, item, spot)));
  const still = drag.active === null;

  return (
    <PotDragContext.Provider value={drag}>
      <View ref={drag.rootRef} style={styles.screen}>
        <Pot
          draft={current}
          names={names}
          hues={hues}
          ingredientCounts={ingredientCounts}
          counted={counted}
          shelf={
            mixes.length > 0 ? (
              <MixShelf
                mixes={mixes.map((mix) => ({
                  id: mix.id,
                  name: mix.name,
                  description: describe(mix.draft),
                  albumIds: mixArt.get(mix.id) ?? [],
                  color: hues.get(mix.draft.ingredients[0]?.[0] ?? -1) ?? tagColor(null),
                }))}
                width={potInnerWidth(screenWidth)}
                onPlay={(id) => withMix(id, playMix)}
                onMenu={(id) => withMix(id, setMenuMix)}
              />
            ) : null
          }
          editing={editing}
          onSave={() => setSaving(true)}
          onShuffle={() => playQuery(query)}
          onClear={clear}
          onTapIngredient={(index) => setDraft(tapIngredient(current, index))}
          onTapExcluded={(tagId) => setDraft(tapExcluded(current, tagId))}
        />

        <ScrollView style={styles.screen} contentContainerStyle={styles.content} scrollEnabled={still}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Your tags</Text>
            {tags.length === 0 ? (
              <Text style={styles.hint}>Tag some songs in the Library to mix them here.</Text>
            ) : (
              <TagGrid
                tags={children.get(null) ?? []}
                childrenOf={children}
                expanded={expanded}
                choiceOf={choiceOf}
                onTap={tap}
                onToggleExpanded={toggleExpanded}
                width={screenWidth - spacing.lg * 2}
              />
            )}
          </View>
        </ScrollView>

        <ActionSheet
          visible={menuMix !== null}
          title={menuMix?.name}
          actions={
            menuMix
              ? [
                  {
                    label: 'Edit',
                    onPress: () => {
                      setDraft(menuMix.draft);
                      setEditing(menuMix.name);
                    },
                  },
                  { label: 'Rename', onPress: () => setRenaming(menuMix) },
                  { label: 'Delete', destructive: true, onPress: () => confirmDelete(menuMix) },
                ]
              : []
          }
          onClose={() => setMenuMix(null)}
        />
        <PromptDialog
          visible={saving}
          title={editing ? 'Save mix' : 'New mix'}
          message={describeQuery(query, names)}
          initialValue={editing ?? ''}
          placeholder="Night drive"
          confirmLabel="Save"
          onSubmit={async (name) => {
            const clash = mixes.find((m) => m.name.toLowerCase() === name.trim().toLowerCase());
            if (clash && clash.name.toLowerCase() !== editing?.toLowerCase()) {
              throw new MixError(`There's already a mix called "${clash.name}".`);
            }
            await saveMix(db, name, current);
            setEditing(name.trim());
            notifyLibraryChanged();
          }}
          onClose={() => setSaving(false)}
        />
        <PromptDialog
          visible={renaming !== null}
          title="Rename mix"
          initialValue={renaming?.name ?? ''}
          onSubmit={async (name) => {
            if (!renaming) return;
            await renameMix(db, renaming.id, name);
            if (editing?.toLowerCase() === renaming.name.toLowerCase()) setEditing(name.trim());
            notifyLibraryChanged();
          }}
          onClose={() => setRenaming(null)}
        />
        <DragGhost />
      </View>
    </PotDragContext.Provider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  section: {
    gap: spacing.md,
  },
  title: {
    ...font.title,
    color: colors.text,
  },
  body: {
    ...font.body,
    color: colors.textDim,
    textAlign: 'center',
  },
  sectionLabel: {
    ...font.caption,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  hint: {
    ...font.caption,
    color: colors.textFaint,
  },
});
