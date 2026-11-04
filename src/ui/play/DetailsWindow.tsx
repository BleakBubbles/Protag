import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useImperativeHandle, useState, type Ref as ReactRef } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

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
import { plural } from '../format';
import { Icon, type IconName } from '../Icon';
import { Artwork } from '../player/Artwork';
import type { Rect } from '../Popover';
import { font, iconSize, radius, spacing, touchTarget } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';

const ROW_HEIGHT = 60;
const THUMB = 44;
const STEP = 30;
/** A mix action beside its name. */
const INLINE = 32;

/**
 * A tag's card, or a song: under its open card (`card` set, the card's last one
 * rounding it off), or in a one-tag mix's plain list.
 */
type Item =
  | { kind: 'card'; key: string; k: number; open: boolean }
  | { kind: 'song'; key: string; song: SongRow; card?: { first: boolean; last: boolean } };

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
  /** More things to do with this mix, beside its name (the player's Save as mix, Save tuning). */
  actions?: readonly DetailsAction[];
}

const FRACTIONS: Record<number, string> = { [1 / 4]: '¼', [1 / 3]: '⅓', [1 / 2]: '½' };

/**
 * A mix's Details: its name and size, each ingredient's share as one line in
 * its colours (the picture of the mix), and, with two or more ingredients, a
 * row each to tune it: its share (− / +, stepping through multiples of its
 * natural, size-based share). A share holds for the whole shuffle, so the ingredients
 * that will run out first and go round again wear a quiet ↻. Below, every
 * song, grouped under its ingredient in the rows' order and colours, to look
 * through rather than change anything; tap one to shuffle from it.
 */
export interface DetailsHandle {
  open: (from: Rect) => void;
}

/**
 * A DetailsWindow that keeps whether it's open to itself, opened through its
 * ref: opening it then re-renders only the window, not whatever holds it (the
 * whole Play tab, which would hold up the window's first frame).
 */
export function OwnDetailsWindow({
  ref,
  ...props
}: Omit<DetailsWindowProps, 'anchor' | 'onClose'> & { ref: ReactRef<DetailsHandle> }) {
  const [from, setFrom] = useState<Rect | null>(null);
  useImperativeHandle(ref, () => ({ open: setFrom }), []);
  return <DetailsWindow {...props} anchor={from} onClose={() => setFrom(null)} />;
}

export function DetailsWindow({ anchor, onClose, draft, title, onTune, onPlay, actions }: DetailsWindowProps) {
  const colors = useColors();
  const styles = useStyles();
  const db = useSQLiteContext();
  const open = anchor !== null;

  // Names and colours for the ingredients.
  // Tags' colour names rather than colours, so a theme switch recolours them.
  const [looks, setLooks] = useState<{ names: Map<Ref, string>; colorNames: Map<Ref, string | null> } | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    Promise.all([listTags(db), listAlbumTitles(db)]).then(([tags, albums]) => {
      if (!live) return;
      setLooks({
        names: new Map<Ref, string>([...tags.map((t) => [t.id, t.name] as const), ...albums]),
        colorNames: new Map<Ref, string | null>(tags.map((t) => [t.id, t.color] as const)),
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
  const hueOf = (refs: readonly Ref[]) => {
    const tag = refs.find((ref) => looks?.colorNames.has(ref));
    return tag === undefined ? colors.raised : colors.tag(looks?.colorNames.get(tag));
  };

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

  // Every song, by artist.
  const [songs, setSongs] = useState<SongRow[] | null>(null);
  useEffect(() => {
    if (!open) return;
    setSongs(null);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    buildDescendantMap(db)
      .then((descendants) => findSongs(db, buildQuery(draft), { order: 'artist', descendants }))
      .then((found) => live && setSongs(found));
    return () => {
      live = false;
    };
    // Keyed by `what`: tuning changes don't change the songs.
  }, [db, open, what]);

  const several = draft.ingredients.length > 1;
  // One tag's songs open at a time, inside its card; all closed at first, so the whole mix shows at a glance.
  const [openCard, setOpenCard] = useState<number | null>(null);
  useEffect(() => setOpenCard(null), [what, open]);

  // With several ingredients, a card for each, the open one's songs under it; a song
  // in two is under the one it counts for, as in the shares.
  const items: Item[] = [];
  if (several && ingredients) {
    const groupOf = new Map<number, number>();
    ingredients.forEach((ing, k) => ing.ids.forEach((id) => groupOf.set(id, k)));
    ingredients.forEach((ing, k) => {
      items.push({ kind: 'card', key: `c${k}`, k, open: openCard === k });
      if (openCard !== k || !songs) return;
      const mine = songs.filter((song) => groupOf.get(song.id) === k);
      mine.forEach((song, i) =>
        items.push({ kind: 'song', key: `s${song.id}`, song, card: { first: i === 0, last: i === mine.length - 1 } })
      );
    });
  } else if (songs) {
    for (const song of songs) items.push({ kind: 'song', key: `s${song.id}`, song });
  }
  const tune = (refs: readonly Ref[], step: 1 | -1) => {
    const now = tuningOf(draft, refs);
    const k = SHARES.indexOf(now.share as (typeof SHARES)[number]);
    const share = SHARES[Math.min(SHARES.length - 1, Math.max(0, k + step))];
    onTune(setTuning(draft, refs, { ...now, share }));
  };

  // The summary (what this is), then with several tags their weights (how it's shared out,
  // and tuning), each card opening onto its songs; with one, the songs straight after.
  const header = (
    <View style={styles.headerBody}>
      <View style={styles.section}>
        <View style={styles.titleRow}>
          <View style={styles.titleText}>
            {/* The mix's own actions sit right after its name, what they act on; the corner only closes.
                They're inline in the name's text, which fills its column: shrunk to fit its words in a
                row instead, Android's remeasure on a second opening came up a hair narrow, and the
                last word wrapped onto a line the name doesn't show ("kpop Driving" showed "kpop"). */}
            <Text style={styles.title} numberOfLines={2}>
              {title}
              {actions?.map((action) => (
                <Pressable
                  key={action.label}
                  onPress={() => {
                    onClose();
                    action.onPress();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  hitSlop={(touchTarget - INLINE) / 2}
                  style={({ pressed }) => [styles.inlineAction, pressed && styles.pressed]}
                >
                  <Icon name={action.icon} size={iconSize.sm} color={colors.textDim} />
                </Pressable>
              ))}
            </Text>
            <Text style={styles.count}>{songs ? plural(songs.length, 'song') : ' '}</Text>
          </View>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => [styles.action, styles.closeLevel, pressed && styles.pressed]}
          >
            <Icon name="close" size={iconSize.sm + 2} color={colors.textDim} />
          </Pressable>
        </View>
      </View>

      {several && (
        <>
          <View style={styles.divider} />
          <View style={styles.section}>
            {/* What's tuned shows in teal in the rows; this puts it all back, live only when there's something to undo. */}
            <View style={styles.sectionHead}>
              <Text style={styles.label}>Tags</Text>
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
            {/* The whole shuffle shared out, right over the rows that change it. */}
            {ingredients && (
              <View style={styles.shareLine}>
                {ingredients.map((ing, k) => (
                  <View key={k} style={{ flex: weights[k], backgroundColor: hueOf(ing.refs) }} />
                ))}
              </View>
            )}
          </View>
        </>
      )}

      {!several && (
        <>
          <View style={styles.divider} />
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.label}>Songs</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );

  // A tag's weight, and the way into its songs: the name and count open them, − / + weigh it.
  const card = (k: number, isOpen: boolean) => {
    const ing = ingredients![k];
    const t = tuningOf(draft, ing.refs);
    const k0 = SHARES.indexOf(t.share as (typeof SHARES)[number]);
    const repeats = repeatsIn(draft, ing.refs);
    const name = label(ing.refs);
    const times = `×${FRACTIONS[t.share] ?? t.share}`;
    return (
      <View style={[styles.card, isOpen && styles.cardOpen]}>
        <View style={styles.cardRow}>
          <Pressable
            onPress={() => setOpenCard(isOpen ? null : k)}
            accessibilityRole="button"
            accessibilityState={{ expanded: isOpen }}
            accessibilityLabel={`${name}, ${plural(ing.ids.length, 'song')}, weight ${times}${repeats ? ', repeats' : ''}`}
            style={({ pressed }) => [styles.cardOpener, pressed && styles.pressed]}
          >
            <View style={[styles.swatch, { backgroundColor: hueOf(ing.refs) }]} />
            {/* What the tag is and how it's weighed, read as a status: "6 songs · ×2",
                then ↻ when it goes round again to keep its share; the chevron opens its songs. */}
            <View style={styles.cardText}>
              <Text style={styles.cardName} numberOfLines={1}>
                {name}
              </Text>
              <View style={styles.cardMeta}>
                <Text style={styles.cardCount}>
                  {plural(ing.ids.length, 'song')} · <Text style={t.share !== 1 && styles.timesTuned}>{times}</Text>
                </Text>
                {repeats && <Icon name="repeat" size={14} color={t.share !== 1 ? colors.accentFg : colors.textFaint} />}
                <Icon name={isOpen ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.textDim} />
              </View>
            </View>
          </Pressable>
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
  };

  return (
    <ExpandWindow anchor={anchor} onClose={onClose}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.key}
        ListHeaderComponent={header}
        initialNumToRender={12}
        renderItem={({ item: entry }) => {
          if (entry.kind === 'card') return card(entry.k, entry.open);
          const item = entry.song;
          return (
          <Pressable
            onPress={() => {
              onClose();
              onPlay(item.id);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}${item.artist ? ` by ${item.artist}` : ''}`}
            accessibilityHint="Shuffles the mix, starting with this song"
            style={({ pressed }) => [
              styles.row,
              entry.card && styles.rowInCard,
              entry.card?.first && styles.rowFirstInCard,
              entry.card?.last && styles.rowLastInCard,
              pressed && (entry.card ? styles.rowInCardPressed : styles.rowPressed),
            ]}
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
          );
        }}
      />
    </ExpandWindow>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
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
  // Level with the title's first line rather than the title and count together; its touch area
  // overhangs above. Lora's letters sit low in their line, so it's lowered a touch to meet them by eye.
  closeLevel: {
    marginTop: -(touchTarget - font.heading.lineHeight) / 2 + 4,
  },
  // Overhangs the name's line rather than heightening it, so the count stays put.
  // Inline in the text it sits on the baseline, so it's lowered to centre on the letters.
  inlineAction: {
    width: INLINE,
    height: INLINE,
    marginVertical: -spacing.sm,
    transform: [{ translateY: 6 }],
    borderRadius: INLINE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  label: {
    ...font.caption,
    color: colors.textDim,
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
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  // Its songs carry on below it, in the same card.
  cardOpen: {
    marginBottom: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  cardOpener: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  cardText: {
    flex: 1,
  },
  cardName: {
    ...font.name,
    color: colors.text,
  },
  // The mark no taller than the caption, so a card is the same height with or without it.
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: font.caption.lineHeight,
  },
  cardCount: {
    ...font.caption,
    color: colors.textDim,
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
  timesTuned: {
    color: colors.accentFg,
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
  rowInCard: {
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceAlt,
  },
  rowFirstInCard: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowLastInCard: {
    marginBottom: spacing.md,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  rowInCardPressed: {
    backgroundColor: colors.raised,
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
}));
