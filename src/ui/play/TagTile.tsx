import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { NEXT_CHOICE, type TagChoice } from '../../query/types';
import { formatCount } from '../format';
import { colors, font, iconSize, radius, spacing, tagColor } from '../theme';

export const TAG_TILE_HEIGHT = 64;
const BADGE = 20;
/** How strongly each state shows the tag's colour (1 = solid). */
const WASH: Record<TagChoice, number> = { include: 1, off: 0.5, exclude: 0.43 };

/** `#RRGGBB` plus an opacity, as `#RRGGBBAA`. */
const withAlpha = (hex: string, opacity: number) =>
  hex + Math.round(opacity * 255).toString(16).padStart(2, '0');

const CHOICE_LABEL: Record<TagChoice, string> = {
  include: 'included',
  exclude: 'excluded',
  off: 'not used',
};

export interface TagTileProps {
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
 * A tag in the Play tab's builder: a big, forgiving target that's coloured
 * like the tag. Tapping cycles include → exclude → off, and each state is
 * unmistakable: off is a soft wash, included lights up in full colour with a
 * check, excluded keeps a dim trace of its colour (so you still see *which*
 * tag) inside a red outline, with a minus and the name struck through.
 */
export function TagTile({ name, color, songCount, choice, width, onPress, expanded, onToggleExpanded }: TagTileProps) {
  const hue = tagColor(color);
  const included = choice === 'include';
  const excluded = choice === 'exclude';
  const ink = included ? colors.bg : colors.text;

  // While pressed, the tile already shows the colour the tap leads to, so
  // releasing only adds or removes the marks. The preview is tied to the state
  // the press *started* on: Pressable holds a quick tap "pressed" for 130 ms,
  // past the moment the tap lands, and previewing from the new state then would
  // flash a third state.
  const [pressedOn, setPressedOn] = useState<TagChoice | null>(null);
  const shown = pressedOn === choice ? NEXT_CHOICE[choice] : choice;
  const text = shown === 'include' ? colors.bg : colors.text;

  return (
    <View style={[styles.tile, { width }]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => setPressedOn(choice)}
        onPressOut={() => setPressedOn(null)}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${CHOICE_LABEL[choice]}, ${songCount} songs`}
        accessibilityHint="Tap to include, then exclude, then clear"
        style={[styles.main, { backgroundColor: withAlpha(hue, WASH[shown]) }]}
      >
        <Text
          style={[styles.name, { color: text }, excluded && styles.struck]}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text style={[styles.count, { color: excluded ? colors.exclude : shown === 'include' ? text : colors.textDim }]}>
          {`${formatCount(songCount)} ${songCount === 1 ? 'song' : 'songs'}`}
        </Text>
      </Pressable>

      {/* A layer on top rather than a border on the tile: it can't shift the
          text, and the tile never has a border removed (which on Android once
          left its contents blank). */}
      {excluded && <View style={styles.outline} pointerEvents="none" />}

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
            color={included ? ink : colors.textDim}
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    height: TAG_TILE_HEIGHT,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  outline: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.exclude,
  },
  main: {
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing.md,
    paddingRight: spacing.md + BADGE,
  },
  name: {
    ...font.listTitle,
  },
  struck: {
    color: colors.textDim,
    textDecorationLine: 'line-through',
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
