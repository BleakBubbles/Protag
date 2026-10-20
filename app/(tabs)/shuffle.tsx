import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { notifyLibraryChanged } from '@/db/changes';
import { listMixes, MixError, saveMix, type Mix } from '@/db/mixes';
import { countSongs } from '@/db/songs';
import { buildDescendantMap, listAllTagsWithCounts } from '@/db/tags';
import type { TagWithCounts } from '@/db/types';
import { openLibrary } from '@/navigation';
import { usePlayQuery } from '@/player/PlayerProvider';
import { describeQuery } from '@/query/describe';
import { dropInPot, tapExcluded, tapIngredient, tapTag, type PotItem, type PotSpot } from '@/query/pot';
import { countMatching } from '@/query/run';
import { buildQuery, EMPTY_DRAFT, isEmptyDraft, pruneDraft, tagChoice, type QueryDraft } from '@/query/types';
import { Button } from '@/ui/Button';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { ingredientKey, Pot, type ShuffleCount } from '@/ui/play/Pot';
import { DragGhost, PotDragContext, usePotDragRoot } from '@/ui/play/PotDrag';
import { TagGrid } from '@/ui/play/TagGrid';
import { useMiniPlayerVisibility } from '@/ui/player/MiniPlayerVisibility';
import { PromptDialog } from '@/ui/PromptDialog';
import { colors, font, spacing, tagColor } from '@/ui/theme';

/**
 * Shuffle tab: build something to shuffle. The pot sits on top like a text field
 * over its keyboard; the tag tiles below go into it by tap or by drag, with a
 * live count. Saved mixes live in their own tab; "Edit" there opens one here
 * (the `edit` param, a mix id).
 */
export default function ShuffleScreen() {
  const { show } = useMiniPlayerVisibility();
  // Opening Shuffle is one way a hidden mini-player comes back.
  useFocusEffect(useCallback(() => show(), [show]));
  const { edit } = useLocalSearchParams<{ edit?: string }>();

  const { data } = useLibraryQuery(async (db) => {
    const [songs, tags, descendants, mixes] = await Promise.all([
      countSongs(db),
      listAllTagsWithCounts(db),
      buildDescendantMap(db),
      listMixes(db),
    ]);
    // A tag with nothing under it can't be shuffled, so the builder leaves it out.
    return { songs, tags: tags.filter((t) => t.song_count > 0), descendants, mixes };
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

  return <Builder {...data} editRequest={edit ? Number(edit) : null} />;
}

type BuilderProps = {
  tags: TagWithCounts[];
  descendants: Map<number, number[]>;
  mixes: Mix[];
  /** A mix to open in the pot, asked for by the Mixes tab. */
  editRequest: number | null;
};

function Builder({ tags, descendants, mixes, editRequest }: BuilderProps) {
  const db = useSQLiteContext();
  const { width: screenWidth } = useWindowDimensions();
  const playQuery = usePlayQuery();
  const [draft, setDraft] = useState<QueryDraft>(EMPTY_DRAFT);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  /** The mix opened for editing, by id, so a rename elsewhere doesn't lose it. */
  const [editingId, setEditingId] = useState<number | null>(null);
  const editingMix = mixes.find((m) => m.id === editingId) ?? null;
  const [saving, setSaving] = useState(false);

  const names = useMemo(() => new Map(tags.map((t) => [t.id, t.name])), [tags]);
  const hues = useMemo(() => new Map(tags.map((t) => [t.id, tagColor(t.color)])), [tags]);
  const children = useMemo(() => {
    const map = new Map<number | null, TagWithCounts[]>();
    for (const tag of tags) map.set(tag.parent_id, [...(map.get(tag.parent_id) ?? []), tag]);
    return map;
  }, [tags]);

  // Opening a mix from the Mixes tab: load it, then drop the request so it
  // isn't loaded again over later changes.
  useEffect(() => {
    if (editRequest === null) return;
    const mix = mixes.find((m) => m.id === editRequest);
    if (mix) {
      setDraft(mix.draft);
      setEditingId(mix.id);
    }
    router.setParams({ edit: undefined });
  }, [editRequest, mixes]);

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

  // An emptied pot is no longer the mix that was opened.
  const potEmpty = isEmptyDraft(current);
  useEffect(() => {
    if (potEmpty) setEditingId(null);
  }, [potEmpty]);

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
          editing={editingMix?.name ?? null}
          onSave={() => setSaving(true)}
          onShuffle={() => playQuery(query)}
          onClear={() => setDraft(EMPTY_DRAFT)}
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

        <PromptDialog
          visible={saving}
          title={editingMix ? 'Save mix' : 'New mix'}
          message={describeQuery(query, names)}
          initialValue={editingMix?.name ?? ''}
          placeholder="Night drive"
          confirmLabel="Save"
          onSubmit={async (name) => {
            const clash = mixes.find((m) => m.name.toLowerCase() === name.trim().toLowerCase());
            if (clash && clash.id !== editingMix?.id) {
              throw new MixError(`There's already a mix called "${clash.name}".`);
            }
            setEditingId(await saveMix(db, name, current));
            notifyLibraryChanged();
          }}
          onClose={() => setSaving(false)}
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
