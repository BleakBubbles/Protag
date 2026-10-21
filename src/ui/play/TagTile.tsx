import { Ionicons } from '@expo/vector-icons';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';

import type { TagChoice } from '../../query/types';
import { formatCount } from '../format';
import { colors, font, iconSize, radius, spacing, tagColor } from '../theme';
import { useDraggable, usePotDrop } from './PotDrag';

export const TAG_TILE_HEIGHT = 64;
const BADGE = 20;
/** How strongly each state shows the tag's colour (1 = solid). Kept out is still part of the mix, so it's solid too. */
const WASH: Record<TagChoice, number> = { include: 1, off: 0.5, exclude: 1 };

/** The ring that says a tag is in the mix, and how: white for in, red for kept out. */
const RING: Record<Exclude<TagChoice, 'off'>, string> = { include: colors.text, exclude: colors.exclude };
/** The ring sits this far outside the tile, with a sliver of background between. TagGrid's gap leaves room for two. */
const RING_GAP = 2;
const RING_WIDTH = 2;

/** What a tap turns each state into: in or out of the pot. Excluding is by dragging. */
const AFTER_TAP: Record<TagChoice, TagChoice> = { off: 'include', include: 'off', exclude: 'off' };

/** `#RRGGBB` plus an opacity, as `#RRGGBBAA`. */
export const withAlpha = (hex: string, opacity: number) =>
  hex + Math.round(opacity * 255).toString(16).padStart(2, '0');

const CHOICE_LABEL: Record<TagChoice, string> = {
  include: 'in the mix',
  exclude: 'kept out',
  off: 'not used',
};

/** What double-tapping does, as a screen reader says it. */
const TAP_LABEL: Record<TagChoice, string> = {
  off: 'Add to the mix',
  include: 'Take out of the mix',
  exclude: 'Let its songs back in',
};

export interface TagTileProps {
  tagId: number;
  name: string;
  /** The tag's stored colour name. */
  color: string | null;
  songCount: number;
  choice: TagChoice;
  width: number;
  onPress: () => void;
  /** Present when the tag has subtags: an arrow that reveals them. */
  expanded?: boolean;
  onToggleExpanded?: () => void;
}

/**
 * A tag in the Shuffle tab's builder: a big, forgiving target that's coloured
 * like the tag. A tap drops it into the pot (or takes it back out); holding it
 * lifts it, to drag onto something in the pot. Each state is unmistakable:
 * off is a soft wash; anything in the mix is full colour with a ring around
 * it, white with a check when it's in, red with a minus when it's kept out.
 * The ring sits just outside the tile, so it shows against any tag colour.
 */
export function TagTile({ tagId, name, color, songCount, choice, width, onPress, expanded, onToggleExpanded }: TagTileProps) {
  const hue = tagColor(color);
  const included = choice === 'include';
  const excluded = choice === 'exclude';

  // While pressed, the tile already shows the colour the tap leads to, so
  // releasing only adds or removes the marks.
  const { handlers, pressed, lifting } = useDraggable(
    { kind: 'tile', ref: tagId },
    { parts: [{ name, hue, cover: null, round: false }] },
    onPress
  );
  const drop = usePotDrop();
  const shown = pressed ? AFTER_TAP[choice] : choice;
  const text = shown === 'off' ? colors.text : colors.bg;

  return (
    <View style={[styles.tile, { width }, lifting && styles.lifting]}>
      <View
        {...handlers}
        accessible
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${CHOICE_LABEL[choice]}, ${songCount} songs`}
        // Keeping out is a drag for everyone else; here it's an action.
        accessibilityActions={[
          { name: 'activate', label: TAP_LABEL[choice] },
          ...(excluded ? [] : [{ name: 'keepOut', label: 'Keep its songs out' }]),
        ]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName !== 'keepOut') return onPress();
          drop({ kind: 'tile', ref: tagId }, { kind: 'keepOut' });
          AccessibilityInfo.announceForAccessibility(`${name} kept out`);
        }}
        style={[styles.main, { backgroundColor: withAlpha(hue, WASH[shown]) }]}
      >
        <Text style={[styles.name, { color: text }]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.count, { color: shown === 'off' ? colors.textDim : text }]}>
          {`${formatCount(songCount)} ${songCount === 1 ? 'song' : 'songs'}`}
        </Text>
      </View>

      {/* A layer outside rather than a border on the tile: it can't shift the
          text, and the tile never has a border removed (which on Android once
          left its contents blank). */}
      {choice !== 'off' && <View style={[styles.ring, { borderColor: RING[choice] }]} pointerEvents="none" />}

      {choice !== 'off' && (
        <View
          style={[styles.badge, { backgroundColor: included ? colors.bg : colors.exclude }]}
          pointerEvents="none"
        >
          <Ionicons name={included ? 'checkmark' : 'remove'} size={iconSize.sm - 6} color={included ? hue : colors.bg} />
        </View>
      )}

      {onToggleExpanded && (
        <Pressable
          onPress={onToggleExpanded}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={expanded ? `Hide subtags of ${name}` : `Show subtags of ${name}`}
          style={styles.expand}
        >
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={iconSize.sm - 2}
            color={choice === 'off' ? colors.textDim : colors.bg}
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Not clipped, so the ring can sit outside it; the coloured part clips itself.
  tile: {
    height: TAG_TILE_HEIGHT,
  },
  // Picked up: what's left behind is a faint outline of where it came from.
  lifting: {
    opacity: 0.35,
  },
  ring: {
    position: 'absolute',
    top: -RING_GAP - RING_WIDTH,
    right: -RING_GAP - RING_WIDTH,
    bottom: -RING_GAP - RING_WIDTH,
    left: -RING_GAP - RING_WIDTH,
    borderRadius: radius.md + RING_GAP + RING_WIDTH,
    borderWidth: RING_WIDTH,
  },
  main: {
    flex: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
    justifyContent: 'space-between',
    padding: spacing.md,
    paddingRight: spacing.md + BADGE,
  },
  name: {
    ...font.listTitle,
  },
  count: {
    ...font.caption,
  },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expand: {
    position: 'absolute',
    right: spacing.xs,
    bottom: spacing.xs,
    padding: spacing.xs,
  },
});
