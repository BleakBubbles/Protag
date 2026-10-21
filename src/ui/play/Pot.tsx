import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { albumArtUri } from '../../library/assets';
import type { PotItem } from '../../query/pot';
import type { QueryDraft } from '../../query/types';
import { formatCount, plural } from '../format';
import { Icon } from '../Icon';
import { IconButton } from '../IconButton';
import { Artwork } from '../player/Artwork';
import { colors, font, iconSize, radius, spacing, touchTarget } from '../theme';
import { Join, useDraggable, useDropTarget, usePotDragState, usePotDrop } from './PotDrag';
import { withAlpha } from './TagTile';

/** The top line: tall enough for the cover stack. */
const TOP = 32;
const COVER = 28;
/** How much each cover tucks under the one before it. */
const COVER_OVERLAP = 8;
const CHIP = 36;
/** Two rows of chips; more scroll. Fixed, so the pot never changes height. */
const CONTENT = CHIP * 2 + spacing.sm;
const ACTIONS = 56;
/** The tray's rim around a combination's pills. */
const TRAY_INSET = 3;
/** The + between ingredients and the × inside a combination. */
const SYMBOL = 18;

/** Songs the whole pot would play, with whether the pot was empty when counted. */
export interface ShuffleCount {
  empty: boolean;
  count: number;
}

/** How `ingredientCounts` names an ingredient: by its tags, not its place. */
export const ingredientKey = (tags: readonly number[]) => tags.join();

export interface PotProps {
  draft: QueryDraft;
  names: ReadonlyMap<number, string>;
  /** Each tag's colour as hex. */
  hues: ReadonlyMap<number, string>;
  /** Songs per ingredient, by `ingredientKey`, once counted. */
  ingredientCounts: ReadonlyMap<string, number>;
  /** The latest finished count; the Shuffle button shows it as one change. */
  counted: ShuffleCount | null;
  /** A few of the matching songs' albums (ids), for the cover stack; updated with `counted`. */
  covers: readonly string[];
  onPreview: () => void;
  /** The name of the mix opened for editing, if any. */
  editing: string | null;
  onSave: () => void;
  onShuffle: () => void;
  onClear: () => void;
  onTapIngredient: (index: number) => void;
  onTapExcluded: (tagId: number) => void;
}

/**
 * The pot: what's going into the shuffle, at the top of the Shuffle tab like a
 * text field over its keyboard, with the tags to put in it below.
 *
 * Tags dropped in are ingredients, and a song plays if it's in any of them;
 * drag one onto another and they combine into one ingredient that needs both.
 * While anything is being dragged, a Keep out zone covers the buttons: drop a
 * tag there and its songs never play.
 *
 * Pinned and a fixed height, so it's always there to drop into and nothing in
 * it or below it moves as it fills.
 */
export function Pot({
  draft,
  names,
  hues,
  ingredientCounts,
  counted,
  covers,
  onPreview,
  editing,
  onSave,
  onShuffle,
  onClear,
  onTapIngredient,
  onTapExcluded,
}: PotProps) {
  const { active, hover } = usePotDragState();
  const pot = useDropTarget({ kind: 'pot' });
  const empty = draft.ingredients.length === 0 && draft.exclude.length === 0;
  const shuffle = shuffleText(counted);

  /** Each ingredient as a screen reader says it ("kpop and chill"), for naming what to combine with. */
  const spoken = draft.ingredients.map((tags) => tags.map((id) => names.get(id) ?? '').join(' and '));

  // A combination can't be kept out (nobody means "not both"), so the zone stays away for it.
  const canKeepOut =
    active !== null && !(active.kind === 'ingredient' && (draft.ingredients[active.index]?.length ?? 0) > 1);

  return (
    <View ref={pot.ref} style={[styles.pot, pot.hovered && active?.kind !== 'ingredient' && styles.potHovered]}>
      <View style={styles.top}>
        {/* While something's lifted, or the pot is empty, this line explains; otherwise it previews. */}
        {active || empty ? (
          <Text style={styles.hint} numberOfLines={1}>
            {hintFor(active, hover)}
          </Text>
        ) : (
          <PreviewLine covers={covers} counted={counted} editing={editing} onPress={onPreview} />
        )}
        <View style={styles.clearSlot}>
          {!empty && (
            <IconButton icon="close" label="Empty the mix" size={iconSize.sm} color={colors.textDim} onPress={onClear} />
          )}
        </View>
      </View>

      <View style={styles.content}>
        {!empty ? (
          <FadeIn>
            <ScrollView scrollEnabled={active === null} contentContainerStyle={styles.chips}>
              {draft.ingredients.map((tags, index) => (
                // The + travels with the chip after it, so a wrapped row never ends on one.
                <View key={ingredientKey(tags)} style={styles.unit}>
                  {index > 0 && (
                    <View importantForAccessibility="no-hide-descendants">
                      <Join size={SYMBOL} />
                    </View>
                  )}
                  <IngredientChip
                    index={index}
                    others={spoken.flatMap((other, i) => (i === index ? [] : [{ index: i, label: other }]))}
                    tags={tags}
                    names={names}
                    hues={hues}
                    count={ingredientCounts.get(ingredientKey(tags)) ?? null}
                    onTap={() => onTapIngredient(index)}
                  />
                </View>
              ))}
              {draft.exclude.map((tagId) => (
                <ExcludedChip
                  key={`x${tagId}`}
                  tagId={tagId}
                  name={names.get(tagId) ?? ''}
                  hue={hues.get(tagId) ?? colors.textDim}
                  onTap={() => onTapExcluded(tagId)}
                />
              ))}
            </ScrollView>
          </FadeIn>
        ) : (
          <View style={styles.well}>
            <Text style={styles.wellText}>Tap or drag tags here</Text>
          </View>
        )}
      </View>

      {/* The two ways to finish: keep it, or hear it. Equal in size; Shuffle,
          the usual one, is filled and on the thumb side. */}
      <View style={styles.actions}>
        <Pressable
          onPress={onSave}
          disabled={empty}
          accessibilityRole="button"
          accessibilityState={{ disabled: empty }}
          style={({ pressed }) => [styles.finish, styles.save, (pressed || empty) && styles.dimmed]}
        >
          <Icon name={editing ? 'bookmark' : 'bookmark-outline'} size={iconSize.sm} color={colors.accentFg} />
          <Text style={styles.saveText} numberOfLines={1}>
            {editing ? 'Save mix' : 'Save as mix'}
          </Text>
        </Pressable>
        <Pressable
          onPress={onShuffle}
          disabled={shuffle.none}
          accessibilityRole="button"
          accessibilityLabel={[shuffle.title, shuffle.count].filter(Boolean).join(', ')}
          accessibilityState={{ disabled: shuffle.none }}
          android_ripple={{ color: colors.rippleOnAccent }}
          style={({ pressed }) => [styles.finish, styles.shuffle, (pressed || shuffle.none) && styles.dimmed]}
        >
          <Icon name="shuffle" size={iconSize.md} color={colors.onAccent} />
          <View>
            <Text style={styles.shuffleTitle}>{shuffle.title}</Text>
            {shuffle.count !== '' && <Text style={styles.shuffleCount}>{shuffle.count}</Text>}
          </View>
        </Pressable>
        <KeepOut shown={canKeepOut} />
      </View>
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

/** The pot's top line while it's empty or something's lifted: how to start, or what letting go will do. */
function hintFor(active: PotItem | null, hover: string): string {
  if (active) {
    if (hover.startsWith('i')) return 'Let go to combine: songs need both';
    if (hover === 'keepOut') return 'Let go to keep its songs out';
    if (active.kind === 'tile') return hover === 'pot' ? 'Let go to add it' : 'Drag it up here to add it';
    if (hover === 'pot') return active.kind === 'excluded' ? 'Let go to add it' : 'Drop it on another to combine';
    return 'Let go to take it out';
  }
  return 'Tap tags below, or hold one to drag it';
}

/**
 * A glance at what the pot would play: a few of its albums' covers, the song
 * count (and the mix's name when editing one), and the way into the full list.
 */
function PreviewLine({
  covers,
  counted,
  editing,
  onPress,
}: {
  covers: readonly string[];
  counted: ShuffleCount | null;
  editing: string | null;
  onPress: () => void;
}) {
  const none = counted?.count === 0;
  const count = counted === null ? null : plural(counted.count, 'song');
  const text = [editing, none ? 'No songs match' : count].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress}
      disabled={none}
      accessibilityRole="button"
      accessibilityLabel={`${text}. Preview the songs`}
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
        {!none && <Text style={styles.previewLink}>{text ? ' · ' : ''}Preview</Text>}
      </Text>
      {!none && <Icon name="chevron-forward" size={iconSize.sm - 6} color={colors.accentFg} />}
    </Pressable>
  );
}

/** Fades its children in when it mounts: how the first chips replace the empty well. */
function FadeIn({ children }: { children: ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  }, [opacity]);
  return <Animated.View style={[styles.fill, { opacity }]}>{children}</Animated.View>;
}

interface IngredientChipProps {
  index: number;
  /** The other ingredients, to offer combining with each (screen readers can't drag). */
  others: readonly { index: number; label: string }[];
  tags: readonly number[];
  names: ReadonlyMap<number, string>;
  hues: ReadonlyMap<number, string>;
  count: number | null;
  onTap: () => void;
}

/**
 * One ingredient. A lone tag is a pill in its colour with its song count; a
 * combination is a tray holding its tags' pills, joined by ×, so they read as
 * one thing that's picked up, dropped and split together.
 */
function IngredientChip({ index, others, tags, names, hues, count, onTap }: IngredientChipProps) {
  const label = tags.map((id) => names.get(id) ?? '');
  const tint = tags.map((id) => hues.get(id) ?? colors.textDim);
  const { handlers, lifting } = useDraggable({ kind: 'ingredient', index }, { names: label, colors: tint }, onTap);
  const target = useDropTarget({ kind: 'ingredient', index });
  const combined = tags.length > 1;
  const counted = count === null ? '' : formatCount(count);
  const drop = usePotDrop();
  const spoken = label.join(' and ');

  // Every drop a chip can take part in, as a named action: combining with each
  // other ingredient, and (a lone tag only, as with dragging) keeping it out.
  const actions = [
    { name: 'activate', label: combined ? 'Split it' : 'Take it out' },
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
      style={[
        styles.chip,
        combined ? styles.tray : { backgroundColor: tint[0] },
        target.hovered && styles.chipHovered,
        lifting && styles.lifting,
      ]}
    >
      {combined ? (
        <>
          {label.map((name, i) => (
            <View key={tags[i]} style={styles.segmentRow}>
              {i > 0 && (
                <View style={styles.times}>
                  <Join both size={SYMBOL} />
                </View>
              )}
              <View style={[styles.part, { backgroundColor: tint[i] }]}>
                <Text style={styles.segmentText} numberOfLines={1}>
                  {name}
                </Text>
              </View>
            </View>
          ))}
          <Text style={styles.trayCount}>{counted}</Text>
        </>
      ) : (
        <>
          <View style={styles.segment}>
            <Text style={styles.segmentText} numberOfLines={1}>
              {label[0]}
            </Text>
          </View>
          <View style={styles.count}>
            <Text style={styles.countText}>{counted}</Text>
          </View>
        </>
      )}
    </View>
  );
}

interface ExcludedChipProps {
  tagId: number;
  name: string;
  hue: string;
  onTap: () => void;
}

/** A kept-out tag: a dim trace of its colour, crossed out in a red outline, like its tile. */
function ExcludedChip({ tagId, name, hue, onTap }: ExcludedChipProps) {
  const { handlers, lifting } = useDraggable({ kind: 'excluded', tagId }, { names: [name], colors: [hue] }, onTap);
  const drop = usePotDrop();
  return (
    <View
      {...handlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${name}, kept out`}
      accessibilityActions={[
        { name: 'activate', label: 'Let its songs back in' },
        { name: 'add', label: 'Add to the mix' },
      ]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName !== 'add') return onTap();
        drop({ kind: 'excluded', tagId }, { kind: 'pot' });
        AccessibilityInfo.announceForAccessibility(`${name} added to the mix`);
      }}
      style={[styles.excluded, { backgroundColor: withAlpha(hue, 0.43) }, lifting && styles.lifting]}
    >
      <Icon name="remove" size={iconSize.sm - 6} color={colors.exclude} />
      <Text style={styles.excludedText} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

/** Slides over the buttons while something is lifted; dropping a tag here excludes it. */
function KeepOut({ shown }: { shown: boolean }) {
  const target = useDropTarget({ kind: 'keepOut' });
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: shown ? 1 : 0, duration: 150, useNativeDriver: true }).start();
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

const styles = StyleSheet.create({
  pot: {
    margin: spacing.sm,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  potHovered: {
    borderColor: colors.accentFg,
  },
  top: {
    height: TOP,
    flexDirection: 'row',
    alignItems: 'center',
  },
  hint: {
    ...font.caption,
    flex: 1,
    color: colors.textDim,
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
  // Each cover in a ring of the pot's colour, so they read as separate when stacked.
  cover: {
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.surfaceAlt,
  },
  coverTucked: {
    marginLeft: -COVER_OVERLAP,
  },
  previewText: {
    ...font.label,
    flexShrink: 1,
    color: colors.textDim,
  },
  previewLink: {
    color: colors.accentFg,
  },
  // The close button keeps its full touch area, overhanging this short row.
  clearSlot: {
    width: touchTarget,
    height: TOP,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  content: {
    height: CONTENT,
  },
  fill: {
    flex: 1,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  well: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  wellText: {
    ...font.label,
    color: colors.textFaint,
  },
  // A constant border that only changes colour: never added or removed (see TagTile's outline).
  chip: {
    flexDirection: 'row',
    height: CHIP,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
    overflow: 'hidden',
    backgroundColor: colors.bg,
  },
  chipHovered: {
    borderColor: colors.text,
    transform: [{ scale: 1.08 }],
  },
  lifting: {
    opacity: 0.3,
  },
  unit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  tray: {
    alignItems: 'center',
    padding: TRAY_INSET,
    backgroundColor: colors.border,
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  segment: {
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  part: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: spacing.md - TRAY_INSET,
    borderRadius: radius.pill,
  },
  segmentText: {
    ...font.label,
    color: colors.bg,
  },
  times: {
    paddingHorizontal: 2,
  },
  trayCount: {
    ...font.caption,
    color: colors.textDim,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md - TRAY_INSET,
  },
  count: {
    justifyContent: 'center',
    paddingRight: spacing.md,
    paddingLeft: spacing.xs,
  },
  countText: {
    ...font.caption,
    color: colors.bg,
    opacity: 0.75,
  },
  excluded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    height: CHIP,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.exclude,
  },
  excludedText: {
    ...font.label,
    color: colors.textDim,
    textDecorationLine: 'line-through',
  },
  actions: {
    height: ACTIONS,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  finish: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  save: {
    flex: 1,
    backgroundColor: colors.accentTint,
  },
  saveText: {
    ...font.label,
    color: colors.accentFg,
  },
  dimmed: {
    opacity: 0.4,
  },
  shuffle: {
    flex: 1.4,
    backgroundColor: colors.accent,
  },
  shuffleTitle: {
    ...font.listTitle,
    color: colors.onAccent,
  },
  shuffleCount: {
    ...font.caption,
    color: colors.onAccent,
    opacity: 0.8,
  },
  keepOut: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  keepOutInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
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
});
