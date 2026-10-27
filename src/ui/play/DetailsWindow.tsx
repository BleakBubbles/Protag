import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listAlbumTitles } from '../../db/albums';
import { buildDescendantMap, listTags } from '../../db/tags';
import type { SongRow } from '../../db/types';
import { albumArtUri } from '../../library/assets';
import { ingredientSongs, type Ingredient } from '../../player/sources';
import { readRef, type Ref } from '../../query/refs';
import { findSongs } from '../../query/run';
import { isTuned, repeatsIn, setTuning, SHARES, tuningOf, untuned } from '../../query/tuning';
import { buildQuery, type QueryDraft } from '../../query/types';
import { ExpandWindow } from '../ExpandWindow';
import { FilterChip } from '../FilterChip';
import { plural } from '../format';
import { Icon, type IconName } from '../Icon';
import { Artwork } from '../player/Artwork';
import type { Rect } from '../Popover';
import { colors, font, iconSize, radius, spacing, tagColor, touchTarget } from '../theme';

const ROW_HEIGHT = 60;
const THUMB = 44;
const STEP = 30;

export interface DetailsAction {
  label: string;
  icon: IconName;
  onPress: () => void;
}

export interface DetailsWindowProps {
  /** What opened it (the pot's Details line, the player's source pill); null while closed. */
  anchor: Rect | null;
  onClose: () => void;
  draft: QueryDraft;
  /** The mix in words, or its name. */
  title: string;
  onTune: (draft: QueryDraft) => void;
  /** Shuffle the mix, starting with this song. */
  onPlay: (songId: number) => void;
  /** More things to do with this mix, in the header (the player's Save as mix, Edit in Play). */
  actions?: readonly DetailsAction[];
}

/**
 * A mix's Details: its name and size, each ingredient's share as one line in
 * its colours (the picture of the mix), and, with two or more ingredients, a
 * row each to tune it: its share (− / +, halving or doubling its natural,
 * size-based share). A share holds for the whole shuffle, so the ingredients
 * that will run out first and go round again wear a quiet ↻. Below, every
 * song, filterable by ingredient; tap one to shuffle from it.
 */
export function DetailsWindow({ anchor, onClose, draft, title, onTune, onPlay, actions }: DetailsWindowProps) {
  const db = useSQLiteContext();
  const open = anchor !== null;

  // Names and colours for the ingredients.
  const [looks, setLooks] = useState<{ names: Map<Ref, string>; hues: Map<Ref, string> } | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    Promise.all([listTags(db), listAlbumTitles(db)]).then(([tags, albums]) => {
      if (!live) return;
      setLooks({
        names: new Map<Ref, string>([...tags.map((t) => [t.id, t.name] as const), ...albums]),
        hues: new Map<Ref, string>(tags.map((t) => [t.id, tagColor(t.color)] as const)),
      });
    });
    return () => {
      live = false;
    };
  }, [db, open]);
  const nameOf = (ref: Ref) => {
    const read = readRef(ref);
    return looks?.names.get(ref) ?? (read.kind === 'artist' ? read.name : read.kind === 'album' ? 'Album' : '');
  };
  const hueOf = (refs: readonly Ref[]) => refs.map((ref) => looks?.hues.get(ref)).find(Boolean) ?? colors.raised;

  // Each ingredient's songs, reloaded only when the ingredients change (not the tuning).
  const what = JSON.stringify([draft.ingredients, draft.exclude, draft.includeDescendants]);
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    ingredientSongs(db, draft).then((found) => live && setIngredients(found));
    return () => {
      live = false;
    };
    // Keyed by `what`: tuning changes don't change any ingredient's songs.
  }, [db, open, what]);

  const weights = (ingredients ?? []).map((ing) => ing.ids.length * tuningOf(draft, ing.refs).share);
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  const percent = (k: number) => `${Math.round((weights[k] / totalWeight) * 100)}%`;
  const label = (refs: readonly Ref[]) => refs.map(nameOf).join(' × ');

  // The song list, as before: everything, or one ingredient's.
  const [filter, setFilter] = useState(-1);
  const [songs, setSongs] = useState<SongRow[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setFilter(-1);
    setSongs(null);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    const ingredient = draft.ingredients[filter];
    const query = buildQuery(ingredient ? { ...draft, ingredients: [ingredient] } : draft);
    buildDescendantMap(db)
      .then((descendants) => findSongs(db, query, { order: 'artist', descendants }))
      .then((found) => live && setSongs(found));
    return () => {
      live = false;
    };
    // Keyed by `what` (not the tuning), and the filter.
  }, [db, open, what, filter]);

  const several = draft.ingredients.length > 1;
  const tune = (refs: readonly Ref[], step: 1 | -1) => {
    const now = tuningOf(draft, refs);
    const k = SHARES.indexOf(now.share as (typeof SHARES)[number]);
    const share = SHARES[Math.min(SHARES.length - 1, Math.max(0, k + step))];
    onTune(setTuning(draft, refs, { ...now, share }));
  };

  // Three parts, set apart the way the Library sets its tags apart from its loose songs:
  // the summary (what this is, how it's shared out), its tags (tuning), its songs.
  const header = (
    <View style={styles.headerBody}>
      <View style={styles.section}>
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.count}>{songs ? plural(songs.length, 'song') : ' '}</Text>
          </View>
          {actions?.map((action) => (
            <Pressable
              key={action.label}
              onPress={() => {
                onClose();
                action.onPress();
              }}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <Icon name={action.icon} size={iconSize.sm} color={colors.textDim} />
            </Pressable>
          ))}
          {/* Always last, a little apart, so the mix's own buttons keep their places. */}
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => [styles.action, actions?.length ? styles.close : undefined, pressed && styles.pressed]}
          >
            <Icon name="close" size={iconSize.sm} color={colors.textDim} />
          </Pressable>
        </View>

        {several && ingredients && (
          <View style={styles.shareLine}>
            {ingredients.map((ing, k) => (
              <View key={k} style={{ flex: weights[k], backgroundColor: hueOf(ing.refs) }} />
            ))}
          </View>
        )}
      </View>

      {several && (
        <>
          <View style={styles.divider} />
          <View style={styles.section}>
            {/* What's tuned shows in teal in the rows; this puts it all back, live only when there's something to undo. */}
            <View style={styles.sectionHead}>
              <Text style={styles.label}>Tag weights</Text>
              <Pressable
                onPress={() => onTune(untuned(draft))}
                disabled={!isTuned(draft)}
                accessibilityRole="button"
                accessibilityLabel="Back to a plain shuffle"
                style={({ pressed }) => [styles.step, !isTuned(draft) && styles.stepOff, pressed && styles.pressed]}
              >
                <Icon name="restore" size={iconSize.sm - 4} color={isTuned(draft) ? colors.text : colors.textDim} />
              </Pressable>
            </View>
            {(ingredients ?? []).map((ing, k) => {
              const t = tuningOf(draft, ing.refs);
              const k0 = SHARES.indexOf(t.share as (typeof SHARES)[number]);
              const repeats = repeatsIn(draft, ing.refs);
              const name = label(ing.refs);
              return (
                <View key={ing.refs.join()} style={styles.card}>
                  <View style={styles.cardRow}>
                    <View style={[styles.swatch, { backgroundColor: hueOf(ing.refs) }]} />
                    <Text style={styles.cardName} numberOfLines={1}>
                      {name} <Text style={styles.cardCount}>{plural(ing.ids.length, 'song')}</Text>
                    </Text>
                    {/* Not a control: a quiet mark on the tags that go round again to keep
                        their share. Its room is kept either way, so nothing shifts. */}
                    <View style={styles.repeatMark} accessible={repeats} accessibilityLabel={`${name} repeats`}>
                      {repeats && <Icon name="repeat" size={iconSize.sm - 4} color={colors.textDim} />}
                    </View>
                    <Pressable
                      onPress={() => tune(ing.refs, -1)}
                      disabled={k0 === 0}
                      accessibilityRole="button"
                      accessibilityLabel={`Less ${name}`}
                      style={({ pressed }) => [styles.step, k0 === 0 && styles.stepOff, pressed && styles.pressed]}
                    >
                      <Icon name="remove" size={iconSize.sm - 2} color={colors.text} />
                    </Pressable>
                    <View style={styles.shareValue}>
                      <Text style={styles.percent}>{percent(k)}</Text>
                      <Text style={[styles.times, t.share !== 1 && styles.timesTuned]}>
                        ×{t.share === 0.25 ? '¼' : t.share === 0.5 ? '½' : t.share}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => tune(ing.refs, 1)}
                      disabled={k0 === SHARES.length - 1}
                      accessibilityRole="button"
                      accessibilityLabel={`More ${name}`}
                      style={({ pressed }) => [styles.step, k0 === SHARES.length - 1 && styles.stepOff, pressed && styles.pressed]}
                    >
                      <Icon name="add" size={iconSize.sm - 2} color={colors.text} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}

      <View style={styles.divider} />
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.label}>Songs</Text>
        </View>
        {several && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            <FilterChip label="All" selected={filter === -1} onToggle={() => setFilter(-1)} />
            {draft.ingredients.map((refs, i) => (
              <FilterChip key={refs.join()} label={label(refs)} selected={filter === i} onToggle={() => setFilter(i)} />
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );

  return (
    <ExpandWindow anchor={anchor} onClose={onClose}>
      <FlatList
        data={songs ?? []}
        keyExtractor={(song) => String(song.id)}
        ListHeaderComponent={header}
        initialNumToRender={12}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              onClose();
              onPlay(item.id);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}${item.artist ? ` by ${item.artist}` : ''}`}
            accessibilityHint="Shuffles the mix, starting with this song"
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <Artwork uri={albumArtUri(item.album_id)} size={THUMB} />
            <View style={styles.text}>
              <Text style={styles.songTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.artist} numberOfLines={1}>
                {item.artist ?? ' '}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </ExpandWindow>
  );
}

const styles = StyleSheet.create({
  headerBody: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.md,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  // The same thin line a tag page draws between its subtags and songs.
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  titleText: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...font.heading,
    color: colors.text,
  },
  count: {
    ...font.label,
    color: colors.textDim,
  },
  action: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: {
    marginLeft: spacing.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    ...font.caption,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  shareLine: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    gap: 1,
  },
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  cardName: {
    ...font.name,
    color: colors.text,
    flex: 1,
  },
  cardCount: {
    ...font.caption,
    color: colors.textFaint,
  },
  step: {
    width: STEP,
    height: STEP,
    borderRadius: STEP / 2,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepOff: {
    opacity: 0.35,
  },
  shareValue: {
    minWidth: 44,
    alignItems: 'center',
  },
  percent: {
    ...font.numeric,
    color: colors.text,
  },
  times: {
    ...font.caption,
    color: colors.textFaint,
  },
  timesTuned: {
    color: colors.accentFg,
  },
  repeatMark: {
    width: STEP,
    height: STEP,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.xs,
  },
  filters: {
    gap: spacing.sm,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rowPressed: {
    backgroundColor: colors.surfaceAlt,
  },
  text: {
    flex: 1,
  },
  songTitle: {
    ...font.listTitle,
    color: colors.text,
    includeFontPadding: false,
  },
  artist: {
    ...font.caption,
    color: colors.textDim,
    includeFontPadding: false,
  },
});
