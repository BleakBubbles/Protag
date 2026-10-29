import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type ScrollViewInstance,
  type ViewInstance,
} from 'react-native';

import { albumArtUri } from '../../library/assets';
import type { PotItem } from '../../query/pot';
import type { Ref } from '../../query/refs';
import { isTuned } from '../../query/tuning';
import type { QueryDraft } from '../../query/types';
import { formatCount, plural } from '../format';
import { Icon } from '../Icon';
import { IconButton } from '../IconButton';
import type { Rect } from '../Popover';
import { Artwork } from '../player/Artwork';
import { timing } from '../motion';
import { font, iconSize, radius, spacing, touchTarget, type Palette } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';
import { Join, useDraggable, useDropTarget, usePotDragState, usePotDrop, type Look } from './PotDrag';
import { withAlpha } from './TagTile';

/** The top line: tall enough for the cover stack. */
const TOP = 32;
const COVER = 28;
/** How much each cover tucks under the one before it. */
const COVER_OVERLAP = 8;
const TILE = 40;
/** Between tiles: room for two rings (a kept-out tile's) and a sliver of space, as in the tag grid. */
const GAP = spacing.md;
/** A kept-out tile's ring, outside the tile, with a sliver of background between. */
const RING_GAP = 2;
const RING_WIDTH = 2;
const RING = RING_GAP + RING_WIDTH;
/**
 * How far the tiles sit in from the tray's edge (room for a kept-out tile's
 * ring, and a margin).
 */
const INSET = RING + spacing.sm - 2;
/** One more row of tiles in the tray: what the divider below the pot moves it by. */
export const POT_ROW = TILE + GAP;
/** The tray's height for `rows` rows of tiles; more scroll. Set by the divider, otherwise fixed. */
export const trayHeight = (rows: number) => TILE * rows + GAP * (rows - 1) + INSET * 2;
const ACTIONS = 48;
/** The band's rounded bottom corners. */
const BAND_CORNER = 24;
/** The tray's edge: always there, only its colour changes, so lighting it never moves a tile. */
const EDGE = 2;
/** As long as the tags take to rise, so the pot lights up with them. */
const LIGHT_MS = 260;
/** The gap holding the × between a combination's tags. */
const SYMBOL = 18;
const BADGE = 18;
/**
 * How many characters of names a combination of two fits in half the width;
 * past that (or with three or more) it takes the whole row rather than cut
 * names short. A picture counts for a few.
 */
const HALF_FITS = 12;
const PICTURE_CHARS = 3;
/**
 * How long a hint stays in the top line after letting go, before the preview
 * fades back: long enough that quick drag after drag doesn't flicker between
 * them, and for the new song count to arrive first.
 */
const LINGER_MS = 350;
const FADE_MS = 150;
/** How long a tile takes to slide to its new place when the pot changes around it. */
const GLIDE_MS = 180;

/** Songs the whole pot would play, with whether the pot was empty when counted. */
export interface ShuffleCount {
  empty: boolean;
  count: number;
}

/** How `ingredientCounts` names an ingredient: by what's in it, not its place. */
export const ingredientKey = (tags: readonly Ref[]) => tags.join();

export type { Look } from './PotDrag';

/** A small picture inside a pill. */
const PILL_PICTURE = 22;

export interface PotProps {
  draft: QueryDraft;
  look: (ref: Ref) => Look;
  /** Songs per ingredient, by `ingredientKey`, once counted. */
  ingredientCounts: ReadonlyMap<string, number>;
  /** The latest finished count; the top line shows it as one change, and Shuffle says it to screen readers. */
  counted: ShuffleCount | null;
  /** A few of the matching songs' albums (ids), for the cover stack; updated with `counted`. */
  covers: readonly string[];
  /** Open the mix's Details, growing from the line that opened it. */
  onDetails: (from: Rect) => void;
  /** The saved mix the pot holds, if it's one, to name it in the line. */
  name: string | null;
  /** A mix is open for editing (the header says so and saves it); saving here makes a new one. */
  editing: boolean;
  onSave: () => void;
  onShuffle: () => void;
  onClear: () => void;
  /** Once emptied with ×: brings back what was in it, from the same corner. */
  onRestore?: () => void;
  onTapIngredient: (index: number) => void;
  onTapExcluded: (ref: Ref) => void;
  /** How many rows of tiles the tray shows (the divider below sets it). */
  rows?: number;
  /** The tray's height while the divider is dragged, following the finger; `rows`' height otherwise. */
  tray?: Animated.Value;
  /**
   * At rest, with your mixes below rather than your tags: like a text field
   * without its keyboard, a tap anywhere in the pot (a tile, the empty well)
   * brings the tags up instead of editing. Dragging works either way.
   */
  onOpen?: () => void;
  /** While the tags are up: a tap on the empty well, which points back at them. */
  onWellPress?: () => void;
}

/**
 * The pot: what's going into the shuffle, at the top of the Play tab like a
 * text field over its keyboard, with the tags to put in it below.
 *
 * Tags dropped in are ingredients, and a song plays if it's in any of them;
 * drag one onto another and they combine into one ingredient that needs both.
 * While anything is being dragged, a Keep out zone covers Shuffle: drop a
 * tag there and its songs never play.
 *
 * Pinned and a fixed height, so it's always there to drop into and nothing in
 * it or below it moves as it fills.
 */
export function Pot({
  draft,
  look,
  ingredientCounts,
  counted,
  covers,
  onDetails,
  name,
  editing,
  onSave,
  onShuffle,
  onClear,
  onRestore,
  onTapIngredient,
  onTapExcluded,
  rows = 2,
  tray,
  onOpen,
  onWellPress,
}: PotProps) {
  const colors = useColors();
  const styles = useStyles();
  const { active, hover } = usePotDragState();
  const screen = useWindowDimensions();
  const rowWidth = screen.width - spacing.lg * 2 - INSET * 2;
  const pot = useDropTarget({ kind: 'pot' });
  const empty = draft.ingredients.length === 0 && draft.exclude.length === 0;
  // The hint, kept as it was while it lingers after letting go.
  const hinting = useLinger(active !== null || empty, LINGER_MS);
  const lastHint = useRef('');
  if (active !== null || empty) lastHint.current = hintFor(active, hover, !!onOpen);
  const hint = lastHint.current;
  const hintShown = useRef(new Animated.Value(hinting ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(hintShown, { toValue: hinting ? 1 : 0, duration: FADE_MS, useNativeDriver: true }).start();
  }, [hinting, hintShown]);
  /** Something held over the pot that would land in it: the tray lights up where it will. */
  const landing = pot.hovered && active?.kind !== 'ingredient';
  const keys = [...draft.ingredients.map(ingredientKey), ...draft.exclude.map(excludedKey)];
  const shown = useShowNewTiles(keys, trayHeight(rows));
  // Building (the tags are up): the edge lights up, so it's clear this is what's being made.
  const building = !onOpen;
  const lit = useRef(new Animated.Value(building ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(lit, { toValue: building ? 1 : 0, duration: LIGHT_MS, useNativeDriver: false }).start();
  }, [building, lit]);
  const edgeColor = lit.interpolate({ inputRange: [0, 1], outputRange: [colors.potRecess, colors.potEdge] });
  // The empty pot's words light up with its edge, to the same colour.
  const wellColor = lit.interpolate({ inputRange: [0, 1], outputRange: [colors.potHint, colors.onRecess] });

  /** Each ingredient as a screen reader says it ("kpop and chill"), for naming what to combine with. */
  const spoken = draft.ingredients.map((tags) => tags.map((ref) => look(ref).name).join(' and '));

  // A combination can't be kept out (nobody means "not both"), so the zone stays away for it.
  const canKeepOut =
    active !== null && !(active.kind === 'ingredient' && (draft.ingredients[active.index]?.length ?? 0) > 1);

  return (
    <View ref={pot.ref} style={styles.pot}>
      <View style={styles.top}>
        {/* While something's lifted, or the pot is empty, this line explains;
            otherwise it previews. The two fade into each other, the hint
            lingering a moment after letting go. */}
        <View style={styles.topLine}>
          {!empty && (
            <Animated.View
              style={[styles.layer, { opacity: hintShown.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}
              pointerEvents={hinting ? 'none' : 'auto'}
            >
              <DetailsLine covers={covers} counted={counted} name={name} tuned={isTuned(draft)} onPress={onDetails} />
            </Animated.View>
          )}
          <Animated.View style={[styles.layer, { opacity: hintShown }]} pointerEvents="none">
            <Text style={styles.hint} numberOfLines={1}>
              {hint}
            </Text>
          </Animated.View>
        </View>
        <View style={styles.clearSlot}>
          {!empty ? (
            <>
              <IconButton
                icon="save-mix"
                label={editing ? 'Save as new mix' : 'Save as mix'}
                size={iconSize.sm}
                color={colors.onPotDim}
                onPress={onSave}
              />
              <IconButton icon="close" label="Empty the mix" size={iconSize.sm} color={colors.onPotDim} onPress={onClear} />
            </>
          ) : (
            onRestore && (
              <IconButton icon="restore" label="Bring back the mix" size={iconSize.sm} color={colors.onPotDim} onPress={onRestore} />
            )
          )}
        </View>
      </View>

      {/* The recess the tiles sit in, cut into the band; its edge shows only while building. */}
      <Animated.View style={[styles.recess, { borderColor: edgeColor }]}>
        <Animated.View style={[{ height: tray ?? trayHeight(rows) }, landing && styles.landing]}>
          {!empty ? (
            <FadeIn>
              <ScrollView
                ref={shown.ref}
                onScroll={shown.onScroll}
                scrollEventThrottle={32}
                scrollEnabled={active === null}
                contentContainerStyle={styles.grow}
              >
                {/* At rest, a tap anywhere in the pot opens the tags, between and below the tiles too.
                    Not one button for a screen reader: each tile says what it is. */}
                <Pressable onPress={onOpen} disabled={!onOpen} accessible={false} style={styles.tiles}>
                  {draft.ingredients.map((tags, index) => (
                    <Glide key={ingredientKey(tags)} onLayout={shown.onTileLayout(ingredientKey(tags))}>
                      <IngredientTile
                        index={index}
                        others={spoken.flatMap((other, i) => (i === index ? [] : [{ index: i, label: other }]))}
                        tags={tags}
                        look={look}
                        count={ingredientCounts.get(ingredientKey(tags)) ?? null}
                        width={fitsHalf(tags.map(look)) ? (rowWidth - GAP) / 2 : rowWidth}
                        resting={!!onOpen}
                        onTap={onOpen ?? (() => onTapIngredient(index))}
                      />
                    </Glide>
                  ))}
                  {draft.exclude.map((ref) => (
                    <Glide key={excludedKey(ref)} onLayout={shown.onTileLayout(excludedKey(ref))}>
                      <ExcludedTile
                        refId={ref}
                        look={look(ref)}
                        width={(rowWidth - GAP) / 2}
                        resting={!!onOpen}
                        onTap={onOpen ?? (() => onTapExcluded(ref))}
                      />
                    </Glide>
                  ))}
                </Pressable>
              </ScrollView>
            </FadeIn>
          ) : (
            <Pressable
              onPress={onOpen ?? onWellPress}
              accessibilityRole="button"
              style={({ pressed }) => [styles.well, pressed && styles.dimmed]}
            >
              {onOpen && <Icon name="add" size={iconSize.md} color={colors.potHint} />}
              <Animated.Text style={[styles.wellText, { color: wellColor }]}>
                {onOpen ? 'Add tags, artists or albums' : 'Tap your tags or drag them here'}
              </Animated.Text>
            </Pressable>
          )}
        </Animated.View>
      </Animated.View>

      <ShuffleButton counted={counted} onShuffle={onShuffle}>
        <KeepOut shown={canKeepOut} />
      </ShuffleButton>
    </View>
  );
}

/**
 * Shuffle, the way to hear what's in the pot: in the scheme's own colour on the band,
 * under the recess. (Keeping it as a mix is the bookmark in the top line.) The
 * song count is in that line too, not on the button.
 */
function ShuffleButton({ counted, onShuffle, children }: { counted: ShuffleCount | null; onShuffle: () => void; children?: ReactNode }) {
  const colors = useColors();
  const styles = useStyles();
  const shuffle = shuffleText(counted);
  return (
    <View style={styles.actions}>
      <Pressable
        onPress={onShuffle}
        disabled={shuffle.none}
        accessibilityRole="button"
        accessibilityLabel={[shuffle.title, shuffle.count].filter(Boolean).join(', ')}
        accessibilityState={{ disabled: shuffle.none }}
        android_ripple={{ color: withAlpha(colors.onPotButton, 0.12) }}
        style={[styles.finish, styles.shuffle, shuffle.none && styles.dimmed]}
      >
        <Icon name="shuffle" size={iconSize.md} color={colors.onPotButton} />
        <Text style={styles.shuffleText}>{shuffle.title}</Text>
      </Pressable>
      {children}
    </View>
  );
}

/** The Shuffle button's words: what it does, then how many songs (blank until counted). */
function shuffleText(counted: ShuffleCount | null): { title: string; count: string; none: boolean } {
  if (counted === null) return { title: 'Shuffle', count: '', none: false };
  const { empty, count } = counted;
  if (count === 0) return { title: 'No songs match', count: '', none: true };
  return { title: empty ? 'Shuffle all' : 'Shuffle', count: plural(count, 'song'), none: false };
}

/** The pot's top line while something's lifted (what letting go will do), or while it's empty (a tip). */
function hintFor(active: PotItem | null, hover: string, resting: boolean): string {
  if (active) {
    if (hover.startsWith('i')) return 'Let go to combine: songs need both';
    if (hover === 'keepOut') return 'Let go to keep its songs out';
    if (active.kind === 'tile') return hover === 'pot' ? 'Let go to add it' : 'Drag it up here to add it';
    if (hover === 'pot') return active.kind === 'excluded' ? 'Let go to add it' : 'Drop it on another to combine';
    return 'Let go to take it out';
  }
  // Empty at rest: what the pot is for. Combining only matters once the tags are up to drop.
  if (resting) return 'Mix your tags into a shuffle';
  // Empty and building: a tip on the one thing the well can't show, how tags combine.
  return 'Each tag adds songs · drop one on another for both';
}

/**
 * A glance at what the pot would play: a few of its albums' covers, the song
 * count (and the mix's name when it's a saved one), and the way into its Details,
 * which wears a dot when it shuffles other than plainly.
 */
function DetailsLine({
  covers,
  counted,
  name,
  tuned,
  onPress,
}: {
  covers: readonly string[];
  counted: ShuffleCount | null;
  name: string | null;
  tuned: boolean;
  onPress: (from: Rect) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const ref = useRef<ViewInstance>(null);
  const none = counted?.count === 0;
  const count = counted === null ? null : plural(counted.count, 'song');
  const text = [name, none ? 'No songs match' : count].filter(Boolean).join(' · ');
  return (
    <Pressable
      ref={ref}
      onPress={() => ref.current?.measureInWindow((x, y, width, height) => onPress({ x, y, width, height }))}
      disabled={none}
      accessibilityRole="button"
      accessibilityLabel={`${text}${tuned ? ', tuned' : ''}. Details`}
      style={({ pressed }) => [styles.preview, pressed && styles.previewPressed]}
    >
      {covers.length > 0 && (
        <View style={styles.covers}>
          {covers.map((album, i) => (
            <View key={album} style={[styles.cover, i > 0 && styles.coverTucked]}>
              <Artwork uri={albumArtUri(album)} size={COVER} />
            </View>
          ))}
        </View>
      )}
      <Text style={styles.previewText} numberOfLines={1}>
        {text}
        {!none && <Text style={styles.previewLink}>{text ? ' · ' : ''}Details</Text>}
      </Text>
      {/* Tuned: a dot, like an editor's unsaved-changes mark — it shuffles its own way. */}
      {!none && tuned && <View style={styles.tunedDot} />}
      {!none && <Icon name="chevron-forward" size={iconSize.sm - 6} color={colors.onPot} />}
    </Pressable>
  );
}

const excludedKey = (ref: Ref) => `x${ref}`;

/**
 * Scrolls the pot to a tile just added, when it lands below (or above) what's
 * showing: past two rows, an addition would otherwise happen out of sight.
 * Only additions: the tiles a merge, removal or keep-out touches are ones
 * already in view. Filling the pot all at once (opening a mix) stays at the top.
 */
function useShowNewTiles(keys: readonly string[], height: number) {
  const ref = useRef<ScrollViewInstance>(null);
  const scrollY = useRef(0);
  const known = useRef<ReadonlySet<string>>(new Set(keys));
  const added = useRef<ReadonlySet<string>>(new Set());
  const current = new Set(keys);
  if (keys.some((k) => !known.current.has(k))) {
    added.current = known.current.size === 0 ? new Set() : new Set(keys.filter((k) => !known.current.has(k)));
    known.current = current;
  } else if (current.size !== known.current.size) {
    known.current = current;
  }

  return {
    ref,
    onScroll: (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      scrollY.current = e.nativeEvent.contentOffset.y;
    },
    onTileLayout: (key: string) => (e: LayoutChangeEvent) => {
      if (!added.current.has(key)) return;
      added.current = new Set();
      const { y, height } = e.nativeEvent.layout;
      const top = y - INSET;
      const bottom = y + height + INSET;
      if (bottom > scrollY.current + height) ref.current?.scrollTo({ y: bottom - height, animated: true });
      else if (top < scrollY.current) ref.current?.scrollTo({ y: top, animated: true });
    },
  };
}

/**
 * Slides a tile from where it was to where it is now whenever the pot's
 * layout moves it (a tile before it left, or merged), so you can follow
 * where everything went rather than see it jump.
 */
function Glide({ onLayout, children }: { onLayout: (e: LayoutChangeEvent) => void; children: ReactNode }) {
  const offset = useRef(new Animated.ValueXY()).current;
  const last = useRef<{ x: number; y: number } | null>(null);
  return (
    <Animated.View
      style={{ transform: offset.getTranslateTransform() }}
      onLayout={(e) => {
        const { x, y } = e.nativeEvent.layout;
        const was = last.current;
        last.current = { x, y };
        if (was && (was.x !== x || was.y !== y)) {
          // Back to where it was, on screen, then on to its new place.
          offset.setValue({ x: was.x - x, y: was.y - y });
          timing(offset, {
            toValue: { x: 0, y: 0 },
            duration: GLIDE_MS,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        }
        onLayout(e);
      }}
    >
      {children}
    </Animated.View>
  );
}

/** True while `on` is, and for `ms` after it turns off: a switch that waits before letting go. */
function useLinger(on: boolean, ms: number): boolean {
  const [held, setHeld] = useState(on);
  useEffect(() => {
    if (on) return setHeld(true);
    const timer = setTimeout(() => setHeld(false), ms);
    return () => clearTimeout(timer);
  }, [on, ms]);
  return on || held;
}

/** Fades its children in when it mounts: how the first tiles replace the empty well. */
function FadeIn({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  }, [opacity]);
  return <Animated.View style={[styles.fill, { opacity }]}>{children}</Animated.View>;
}

/** Whether an ingredient's names fit in half the row: one always does; two short ones do. */
function fitsHalf(looks: readonly Look[]): boolean {
  if (looks.length === 1) return true;
  if (looks.length > 2) return false;
  return looks.reduce((n, l) => n + l.name.length + (l.hue === null ? PICTURE_CHARS : 0), 0) <= HALF_FITS;
}

interface IngredientTileProps {
  index: number;
  /** The other ingredients, to offer combining with each (screen readers can't drag). */
  others: readonly { index: number; label: string }[];
  tags: readonly Ref[];
  look: (ref: Ref) => Look;
  count: number | null;
  width: number;
  /** At rest, a tap opens the tags rather than editing (see the pot's `onOpen`). */
  resting: boolean;
  onTap: () => void;
}

/**
 * One ingredient, as a small tile like the tag tiles below: a lone tag in its
 * colour, an artist or album on neutral with its picture. A combination is
 * its tags' tiles fused side by side, each an equal share, with a × in the
 * gap between, so it reads as one thing that's picked up, dropped and split
 * together. Its song count sits at the end, in the colour's ink.
 */
function IngredientTile({ index, others, tags, look, count, width, resting, onTap }: IngredientTileProps) {
  const colors = useColors();
  const styles = useStyles();
  const looks = tags.map(look);
  const label = looks.map((l) => l.name);
  const { handlers, lifting } = useDraggable({ kind: 'ingredient', index }, ghostOf(looks), onTap);
  const target = useDropTarget({ kind: 'ingredient', index });
  const combined = tags.length > 1;
  const counted = count === null ? '' : formatCount(count);
  const drop = usePotDrop();
  const spoken = label.join(' and ');

  // Every drop a tile can take part in, as a named action: combining with each
  // other ingredient, and (a lone tag only, as with dragging) keeping it out.
  const actions = [
    { name: 'activate', label: resting ? 'Change the mix' : combined ? 'Split it' : 'Take it out' },
    ...others.map((other) => ({ name: `combine-${other.index}`, label: `Combine with ${other.label}` })),
    ...(combined ? [] : [{ name: 'keepOut', label: 'Keep its songs out' }]),
  ];
  const act = (action: string) => {
    if (action === 'activate') return onTap();
    if (action === 'keepOut') {
      drop({ kind: 'ingredient', index }, { kind: 'keepOut' });
      return AccessibilityInfo.announceForAccessibility(`${spoken} kept out`);
    }
    const other = others.find((o) => action === `combine-${o.index}`);
    if (!other) return;
    drop({ kind: 'ingredient', index }, { kind: 'ingredient', index: other.index });
    AccessibilityInfo.announceForAccessibility(`Combined ${spoken} and ${other.label}: songs need both`);
  };

  return (
    <View
      ref={target.ref}
      {...handlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${spoken}${combined ? ', songs with all of them' : ''}${count !== null ? `, ${count} songs` : ''}`}
      accessibilityActions={actions}
      onAccessibilityAction={(e) => act(e.nativeEvent.actionName)}
      style={[styles.tile, { width }, target.hovered && styles.tileHovered, lifting && styles.lifting]}
    >
      {looks.map((l, i) => {
        const last = i === looks.length - 1;
        return (
          <Fragment key={tags[i]}>
            {i > 0 && (
              <View style={styles.times} importantForAccessibility="no-hide-descendants">
                <Join both size={SYMBOL} color={colors.onRecess} />
              </View>
            )}
            <View style={[styles.share, faceStyle(l, colors, styles), i > 0 && styles.joinedLeft, !last && styles.joinedRight]}>
              <Face look={l} />
              {last && <Text style={[styles.countText, l.hue === null && styles.neutralCount]}>{counted}</Text>}
            </View>
          </Fragment>
        );
      })}
    </View>
  );
}

interface ExcludedTileProps {
  refId: Ref;
  look: Look;
  width: number;
  /** At rest, a tap opens the tags rather than editing (see the pot's `onOpen`). */
  resting: boolean;
  onTap: () => void;
}

/**
 * A kept-out tag: a tile in its full colour, like any other ingredient (it
 * shapes the mix as much as they do), in a red ring with a − badge: exactly
 * how it's marked on its tile below.
 */
function ExcludedTile({ refId, look, width, resting, onTap }: ExcludedTileProps) {
  const colors = useColors();
  const styles = useStyles();
  const { name } = look;
  const { handlers, lifting } = useDraggable({ kind: 'excluded', ref: refId }, ghostOf([look]), onTap);
  const drop = usePotDrop();
  return (
    <View
      {...handlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${name}, kept out`}
      accessibilityActions={[
        { name: 'activate', label: resting ? 'Change the mix' : 'Let its songs back in' },
        { name: 'add', label: 'Add to the mix' },
      ]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName !== 'add') return onTap();
        drop({ kind: 'excluded', ref: refId }, { kind: 'pot' });
        AccessibilityInfo.announceForAccessibility(`${name} added to the mix`);
      }}
      style={[styles.tile, { width }, lifting && styles.lifting]}
    >
      <View style={[styles.share, faceStyle(look, colors, styles)]}>
        <Face look={look} />
      </View>
      <View pointerEvents="none" style={styles.ring} />
      <View pointerEvents="none" style={styles.badge}>
        <Icon name="remove" size={BADGE - 4} color={colors.bg} />
      </View>
    </View>
  );
}

/** A tag's name on its colour; an artist's or album's on neutral, after its little picture. */
function Face({ look }: { look: Look }) {
  const styles = useStyles();
  return (
    <>
      {look.hue === null && (
        <Artwork
          uri={look.cover ? albumArtUri(look.cover) : null}
          size={PILL_PICTURE}
          cornerRadius={look.round ? PILL_PICTURE / 2 : 4}
        />
      )}
      <Text style={[styles.segmentText, look.hue === null && styles.neutralText]} numberOfLines={1}>
        {look.name}
      </Text>
    </>
  );
}

const faceStyle = (look: Look, colors: Palette, styles: ReturnType<typeof useStyles>) => [
  { backgroundColor: look.hue ?? colors.raised },
  look.hue === null && styles.withPicture,
];

/** What floats under the finger: its tags as pills. */
const ghostOf = (looks: readonly Look[]) => ({ parts: [...looks] });

/** Slides over the buttons while something is lifted; dropping a tag here excludes it. */
function KeepOut({ shown }: { shown: boolean }) {
  const colors = useColors();
  const styles = useStyles();
  const target = useDropTarget({ kind: 'keepOut' });
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    timing(progress, { toValue: shown ? 1 : 0, duration: 150, useNativeDriver: true }).start();
  }, [shown, progress]);

  return (
    <Animated.View
      ref={target.ref}
      pointerEvents="none"
      style={[
        styles.keepOut,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [spacing.md, 0] }) }],
        },
      ]}
    >
      <View style={[styles.keepOutInner, target.hovered && shown && styles.keepOutHovered]}>
        <Icon name="remove-circle-outline" size={iconSize.sm} color={colors.exclude} />
        <Text style={styles.keepOutText}>Keep out</Text>
      </View>
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  // The band: the top of the screen in the pot's own teal, the header above it included.
  // Its bottom corners round off, so it sits over the page like a shelf rather than cutting across it.
  pot: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.potBand,
    borderBottomLeftRadius: BAND_CORNER,
    borderBottomRightRadius: BAND_CORNER,
  },
  top: {
    height: TOP,
    flexDirection: 'row',
    alignItems: 'center',
  },
  // The hint and the preview, stacked in the same place.
  topLine: {
    flex: 1,
    alignSelf: 'stretch',
  },
  layer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
  },
  hint: {
    ...font.caption,
    color: colors.onPotDim,
  },
  preview: {
    flex: 1,
    height: TOP,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
  },
  previewPressed: {
    opacity: 0.7,
  },
  covers: {
    flexDirection: 'row',
  },
  // Each cover in a ring of the band's colour, so they read as separate when stacked.
  cover: {
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.potBand,
  },
  coverTucked: {
    marginLeft: -COVER_OVERLAP,
  },
  tunedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.onPot,
  },
  previewText: {
    ...font.label,
    flexShrink: 1,
    color: colors.onPotDim,
  },
  previewLink: {
    color: colors.onPot,
  },
  // The close button keeps its full touch area, overhanging this short row.
  clearSlot: {
    minWidth: touchTarget,
    height: TOP,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  fill: {
    flex: 1,
  },
  well: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Cut into the band; its edge, the recess's own colour at rest, lights while building.
  // Clips the tiles to its corners as they scroll.
  recess: {
    borderRadius: radius.lg,
    borderWidth: EDGE,
    overflow: 'hidden',
    backgroundColor: colors.potRecess,
  },
  // Something held over the pot: a pale wash where it will land.
  landing: {
    borderColor: colors.potEdge,
    backgroundColor: withAlpha(colors.onRecess, 0.08),
  },
  wellText: {
    ...font.label,
  },
  lifting: {
    opacity: 0.3,
  },
  // A picture sits close to the tile's edge.
  withPicture: {
    paddingLeft: spacing.sm,
  },
  neutralText: {
    color: colors.text,
  },
  neutralCount: {
    color: colors.textDim,
    opacity: 1,
  },
  // Gives way to the count, ending in … when a name is too long for its share.
  segmentText: {
    ...font.label,
    flexShrink: 1,
    color: colors.onTag,
  },
  // The × stands in its own gap of background, like the space between two tiles.
  times: {
    width: SYMBOL + spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: {
    flexGrow: 1,
  },
  tiles: {
    flexGrow: 1,
    alignContent: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
    // INSET counts from the tray's outside, edge included.
    padding: INSET - EDGE,
  },
  // A constant border that only changes colour: never added or removed (see TagTile's outline).
  tile: {
    flexDirection: 'row',
    height: TILE,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  tileHovered: {
    borderColor: colors.onRecess,
    transform: [{ scale: 1.04 }],
  },
  // Each tag's equal share of a tile, its name on its colour.
  share: {
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.md - 2,
  },
  // Where two shares meet at a ×, their corners are tighter, like tiles fused.
  joinedLeft: {
    borderTopLeftRadius: radius.sm - 2,
    borderBottomLeftRadius: radius.sm - 2,
  },
  joinedRight: {
    borderTopRightRadius: radius.sm - 2,
    borderBottomRightRadius: radius.sm - 2,
  },
  ring: {
    position: 'absolute',
    top: -RING,
    right: -RING,
    bottom: -RING,
    left: -RING,
    borderRadius: radius.md + RING,
    borderWidth: RING_WIDTH,
    borderColor: colors.exclude,
  },
  badge: {
    position: 'absolute',
    top: -BADGE / 3,
    right: -BADGE / 3,
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.exclude,
  },
  countText: {
    ...font.caption,
    marginLeft: 'auto',
    paddingLeft: spacing.xs,
    color: colors.onTag,
    opacity: 0.75,
  },
  actions: {
    height: ACTIONS,
    flexDirection: 'row',
  },
  finish: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  dimmed: {
    opacity: 0.4,
  },
  shuffle: {
    backgroundColor: colors.potButton,
  },
  shuffleText: {
    ...font.listTitle,
    color: colors.onPotButton,
  },
  keepOut: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.lg,
    backgroundColor: colors.potRecess,
  },
  keepOutInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.exclude,
  },
  keepOutHovered: {
    backgroundColor: withAlpha(colors.exclude, 0.16),
  },
  keepOutText: {
    ...font.label,
    color: colors.exclude,
  },
}));
