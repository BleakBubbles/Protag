import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { notifyLibraryChanged } from '@/db/changes';
import { deleteMix, listMixes, MixError, renameMix, saveMix, type Mix } from '@/db/mixes';
import { countSongs } from '@/db/songs';
import { buildDescendantMap, listAllTagsWithCounts } from '@/db/tags';
import type { TagWithCounts } from '@/db/types';
import { loadMixArt } from '@/library/mixArt';
import { openLibrary } from '@/navigation';
import { usePlayQuery } from '@/player/PlayerProvider';
import { describeQuery } from '@/query/describe';
import { countMatching } from '@/query/run';
import {
  buildQuery,
  cycleTag,
  EMPTY_DRAFT,
  isEmptyDraft,
  pruneDraft,
  tagChoice,
  type QueryDraft,
} from '@/query/types';
import { ActionSheet } from '@/ui/ActionSheet';
import { Button } from '@/ui/Button';
import { FilterChip } from '@/ui/FilterChip';
import { plural } from '@/ui/format';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { MixCard } from '@/ui/play/MixCard';
import { useMiniPlayerVisibility } from '@/ui/player/MiniPlayerVisibility';
import { PromptDialog } from '@/ui/PromptDialog';
import { QueryChip } from '@/ui/QueryChip';
import { colors, font, spacing, tagColor } from '@/ui/theme';

/**
 * Play tab: choose what to shuffle. Saved mixes on top for one tap; below,
 * the builder, where tags combine into a query with a live count. What's
 * playing lives in the mini-player and the full player it opens.
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
  const colorsById = useMemo(() => new Map(tags.map((t) => [t.id, t.color])), [tags]);
  const children = useMemo(() => {
    const map = new Map<number | null, TagWithCounts[]>();
    for (const tag of tags) map.set(tag.parent_id, [...(map.get(tag.parent_id) ?? []), tag]);
    return map;
  }, [tags]);

  // Tags can be deleted (or emptied) while chosen here; quietly drop them.
  const current = useMemo(() => pruneDraft(draft, new Set(names.keys())), [draft, names]);
  const query = useMemo(() => buildQuery(current), [current]);
  const empty = isEmptyDraft(current);

  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    countMatching(db, query, descendants).then((n) => live && setCount(n));
    return () => {
      live = false;
    };
  }, [db, query, descendants]);

  const describe = useCallback(
    (d: QueryDraft) => describeQuery(buildQuery(pruneDraft(d, new Set(names.keys()))), names),
    [names]
  );

  const shuffleLabel =
    count === null
      ? 'Shuffle'
      : empty
        ? `Shuffle everything · ${plural(count, 'song')}`
        : count === 0
          ? 'No songs match'
          : `Shuffle · ${plural(count, 'song')}`;

  const clear = () => {
    setDraft(EMPTY_DRAFT);
    setEditing(null);
  };

  const playMix = (mix: Mix) => playQuery(buildQuery(pruneDraft(mix.draft, new Set(names.keys()))), { label: mix.name });

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

  const renderLevel = (parentId: number | null) =>
    (children.get(parentId) ?? []).map((tag) => {
      const hasChildren = (children.get(tag.id)?.length ?? 0) > 0;
      const open = expanded.has(tag.id);
      return (
        <Fragment key={tag.id}>
          <QueryChip
            name={tag.name}
            color={tag.color}
            choice={tagChoice(current, tag.id)}
            onPress={() => setDraft((d) => cycleTag(d, tag.id))}
            expanded={open}
            onToggleExpanded={
              hasChildren
                ? () =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (open) next.delete(tag.id);
                      else next.add(tag.id);
                      return next;
                    })
                : undefined
            }
          />
          {/* Full width, so the subtags start on their own line under the parent. */}
          {open && (
            <View style={[styles.subtags, { borderLeftColor: tagColor(tag.color) }]}>{renderLevel(tag.id)}</View>
          )}
        </Fragment>
      );
    });

  return (
    <>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {mixes.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Your mixes</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mixes}
              style={styles.bleed}
            >
              {mixes.map((mix) => (
                <MixCard
                  key={mix.id}
                  name={mix.name}
                  description={describe(mix.draft)}
                  albumIds={mixArt.get(mix.id) ?? []}
                  color={tagColor(colorsById.get(mix.draft.include[0] ?? -1) ?? null)}
                  onPress={() => playMix(mix)}
                  onLongPress={() => setMenuMix(mix)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        <Button
          label={shuffleLabel}
          icon="shuffle"
          onPress={() => playQuery(query)}
          disabled={count === 0}
          style={styles.shuffle}
        />

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Mix by tag</Text>
          {tags.length === 0 ? (
            <Text style={styles.hint}>Tag some songs in the Library to mix them here.</Text>
          ) : (
            <>
              <View style={styles.chips}>{renderLevel(null)}</View>
              {/* Everything that appears in response to a tap sits below the chips,
                  so it can never push the chip being tapped out from under a finger. */}
              {!empty && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summary} numberOfLines={2}>
                    {describeQuery(query, names)}
                  </Text>
                  <TextAction label="Save" onPress={() => setSaving(true)} />
                  <TextAction label="Clear" onPress={clear} />
                </View>
              )}
              {/* Only once there's a choice to make: one-tag shuffles stay one tap. */}
              {current.include.length >= 2 && (
                <View style={styles.modeRow}>
                  <FilterChip
                    label="Match all"
                    selected={current.mode === 'and'}
                    onToggle={() => setDraft((d) => ({ ...d, mode: 'and' }))}
                  />
                  <FilterChip
                    label="Match any"
                    selected={current.mode === 'or'}
                    onToggle={() => setDraft((d) => ({ ...d, mode: 'or' }))}
                  />
                </View>
              )}
              <Text style={styles.hint}>Tap a tag to include it, again to exclude it.</Text>
            </>
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
    </>
  );
}

function TextAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button">
      <Text style={styles.textAction}>{label}</Text>
    </Pressable>
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
    padding: spacing.lg,
    gap: spacing.xl,
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
  // The mix row scrolls edge to edge rather than stopping at the page padding.
  bleed: {
    marginHorizontal: -spacing.lg,
  },
  mixes: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  shuffle: {
    alignSelf: 'stretch',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  summary: {
    ...font.label,
    color: colors.textDim,
    flex: 1,
  },
  textAction: {
    ...font.label,
    color: colors.accentFg,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  subtags: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
  },
  hint: {
    ...font.caption,
    color: colors.textFaint,
  },
});
