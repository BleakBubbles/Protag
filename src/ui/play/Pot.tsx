import { useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { PotItem } from '../../query/pot';
import type { QueryDraft } from '../../query/types';
import { Button } from '../Button';
import { formatCount, plural } from '../format';
import { Icon } from '../Icon';
import { IconButton } from '../IconButton';
import { colors, font, iconSize, radius, spacing, touchTarget } from '../theme';
import { useDraggable, useDropTarget, usePotDragState } from './PotDrag';
import { withAlpha } from './TagTile';

const ROW = 40;
const HINT = 16;
const ACTIONS = 44;
/** Fixed, so the screen can leave exactly this much room for it. */
export const POT_HEIGHT = spacing.md * 2 + ROW + HINT + ACTIONS + spacing.sm * 2;

export interface PotProps {
  draft: QueryDraft;
  names: ReadonlyMap<number, string>;
  /** Each tag's colour as hex. */
  hues: ReadonlyMap<number, string>;
  /** Songs per ingredient, in the draft's order, once counted. */
  ingredientCounts: readonly (number | null)[];
  /** Songs the whole pot would play. */
  count: number | null;
  saveLabel: string;
  onSave: () => void;
  onShuffle: () => void;
  onClear: () => void;
  onTapIngredient: (index: number) => void;
  onTapExcluded: (tagId: number) => void;
}

/**
 * The pot: what's going into the shuffle. Tags dropped in are ingredients, and
 * a song plays if it's in any of them; drag one onto another and they combine
 * into one ingredient that needs both. While anything is being dragged, a Keep
 * out zone covers the buttons: drop a tag there and its songs never play.
 *
 * Always on screen, since it's where things are dropped, and a fixed height,
 * so nothing in it or above it moves as it fills.
 */
export function Pot({
  draft,
  names,
  hues,
  ingredientCounts,
  count,
  saveLabel,
  onSave,
  onShuffle,
  onClear,
  onTapIngredient,
  onTapExcluded,
}: PotProps) {
  const { active, hover } = usePotDragState();
  const pot = useDropTarget({ kind: 'pot' });
  const empty = draft.ingredients.length === 0 && draft.exclude.length === 0;

  // A combination can't be kept out (nobody means "not both"), so the zone stays away for it.
  const canKeepOut =
    active !== null && !(active.kind === 'ingredient' && (draft.ingredients[active.index]?.length ?? 0) > 1);

  return (
    <View ref={pot.ref} style={[styles.pot, pot.hovered && active?.kind !== 'ingredient' && styles.potHovered]}>
      <View style={styles.row}>
        {empty ? (
          <Text style={styles.placeholder}>Tap or drag tags here</Text>
        ) : (
          <ScrollView
            horizontal
            scrollEnabled={active === null}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            style={styles.chipScroller}
          >
            {draft.ingredients.map((tags, index) => (
              <IngredientChip
                key={tags.join()}
                index={index}
                tags={tags}
                names={names}
                hues={hues}
                count={ingredientCounts[index] ?? null}
                onTap={() => onTapIngredient(index)}
              />
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
        )}
        <View style={styles.clearSlot}>
          {!empty && (
            <IconButton
              icon="close"
              label="Empty the mix"
              size={iconSize.sm}
              color={colors.textDim}
              onPress={onClear}
            />
          )}
        </View>
      </View>

      <Text style={styles.hint} numberOfLines={1}>
        {hintFor(draft, active, hover)}
      </Text>

      <View style={styles.actions}>
        <Button
          label={saveLabel}
          icon="bookmark-outline"
          variant="tonal"
          onPress={onSave}
          disabled={empty}
          style={styles.action}
        />
        <Button
          label={shuffleLabel(empty, count)}
          icon="shuffle"
          onPress={onShuffle}
          disabled={count === 0}
          style={[styles.action, styles.shuffle]}
        />
        <KeepOut shown={canKeepOut} />
      </View>
    </View>
  );
}

function shuffleLabel(empty: boolean, count: number | null): string {
  if (count === null) return 'Shuffle';
  if (empty) return `Shuffle all · ${formatCount(count)}`;
  return count === 0 ? 'No songs match' : `Shuffle ${plural(count, 'song')}`;
}

/** The line under the chips: what to try next, or what letting go will do. */
function hintFor(draft: QueryDraft, active: PotItem | null, hover: string): string {
  if (active) {
    if (hover.startsWith('i')) return 'Let go to combine: songs need both';
    if (hover === 'keepOut') return 'Let go to keep its songs out';
    if (active.kind === 'tile') return hover === 'pot' ? 'Let go to add it' : 'Drag it down here to add it';
    if (hover === 'pot') return active.kind === 'excluded' ? 'Let go to add it' : 'Drop it on another to combine';
    return 'Let go to take it out';
  }
  if (draft.ingredients.length === 0 && draft.exclude.length === 0) return 'Hold a tag to drag it';
  if (draft.ingredients.some((tags) => tags.length > 1)) return 'Tap a combined one to split it';
  if (draft.ingredients.length >= 2) return 'Drag one onto another for songs with both';
  return 'Tap one here to send it back';
}

interface IngredientChipProps {
  index: number;
  tags: readonly number[];
  names: ReadonlyMap<number, string>;
  hues: ReadonlyMap<number, string>;
  count: number | null;
  onTap: () => void;
}

/** One ingredient: its tags side by side in their colours, joined by ×, then its song count. */
function IngredientChip({ index, tags, names, hues, count, onTap }: IngredientChipProps) {
  const label = tags.map((id) => names.get(id) ?? '');
  const tint = tags.map((id) => hues.get(id) ?? colors.textDim);
  const { handlers, lifting } = useDraggable({ kind: 'ingredient', index }, { names: label, colors: tint }, onTap);
  const target = useDropTarget({ kind: 'ingredient', index });
  const last = tint[tint.length - 1];

  return (
    <View
      ref={target.ref}
      {...handlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${label.join(' and ')}${count !== null ? `, ${count} songs` : ''}`}
      accessibilityHint={tags.length > 1 ? 'Tap to split' : 'Tap to take it out'}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={onTap}
      style={[styles.chip, target.hovered && styles.chipHovered, lifting && styles.lifting]}
    >
      {label.map((name, i) => (
        <View key={tags[i]} style={styles.segmentRow}>
          {i > 0 && (
            <View style={styles.times}>
              <Text style={styles.timesText}>×</Text>
            </View>
          )}
          <View style={[styles.segment, { backgroundColor: tint[i] }]}>
            <Text style={styles.segmentText} numberOfLines={1}>
              {name}
            </Text>
          </View>
        </View>
      ))}
      <View style={[styles.count, { backgroundColor: last }]}>
        <Text style={styles.countText}>{count === null ? '' : formatCount(count)}</Text>
      </View>
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
  return (
    <View
      {...handlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${name}, kept out`}
      accessibilityHint="Tap to let its songs back in"
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={onTap}
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
    Animated.timing(progress, {
      toValue: shown ? 1 : 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [shown, progress]);

  return (
    <Animated.View
      ref={target.ref}
      pointerEvents="none"
      style={[
        styles.keepOut,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [spacing.md, 0],
              }),
            },
          ],
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
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    height: POT_HEIGHT,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    elevation: 8,
  },
  potHovered: {
    borderColor: colors.accentFg,
  },
  row: {
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
  },
  placeholder: {
    ...font.label,
    flex: 1,
    color: colors.textFaint,
  },
  chipScroller: {
    flex: 1,
  },
  chips: {
    gap: spacing.sm,
    alignItems: 'center',
  },
  clearSlot: {
    width: touchTarget,
    alignItems: 'flex-end',
  },
  // A constant border that only changes colour: never added or removed (see TagTile's outline).
  chip: {
    flexDirection: 'row',
    height: ROW - 4,
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
  segmentRow: {
    flexDirection: 'row',
  },
  segment: {
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  segmentText: {
    ...font.label,
    color: colors.bg,
  },
  times: {
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  timesText: {
    ...font.label,
    color: colors.text,
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
    height: ROW - 8,
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
  hint: {
    ...font.caption,
    height: HINT,
    lineHeight: HINT,
    color: colors.textDim,
  },
  actions: {
    height: ACTIONS,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  // Both pills, so the two read as a pair despite different strengths.
  action: {
    flex: 1,
    borderRadius: radius.pill,
  },
  shuffle: {
    flex: 1.4,
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
