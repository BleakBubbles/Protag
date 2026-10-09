import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TagChoice } from '../../query/types';
import { formatCount } from '../format';
import { colors, font, iconSize, radius, spacing, tagColor } from '../theme';

export const TAG_TILE_HEIGHT = 64;
/** Tag colour opacity (hex alpha) behind tiles that aren't included. */
const WASH = { off: '80', excluded: '59' }; // 50%, 35%
const BADGE = 20;

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

  return (
    <View
      style={[
        styles.tile,
        { width, backgroundColor: included ? hue : `${hue}${excluded ? WASH.excluded : WASH.off}` },
        excluded && styles.excluded,
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${CHOICE_LABEL[choice]}, ${songCount} songs`}
        accessibilityHint="Tap to include, then exclude, then clear"
        android_ripple={{ color: `${colors.text}22` }}
        style={styles.main}
      >
        <Text
          style={[styles.name, { color: ink }, excluded && styles.struck, included && styles.nameOnColor]}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text style={[styles.count, { color: included ? ink : excluded ? colors.exclude : colors.textDim }]}>
          {excluded ? 'not these' : `${formatCount(songCount)} ${songCount === 1 ? 'song' : 'songs'}`}
        </Text>
      </Pressable>

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
  // The border is always there, transparent unless excluded. Removing a border
  // from a rounded, clipped view on Android left the tile's contents blank
  // after cycling back to off; a constant border also keeps the text from
  // shifting by its width when a tile is excluded.
  tile: {
    height: TAG_TILE_HEIGHT,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    overflow: 'hidden',
  },
  excluded: {
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
  nameOnColor: {
    fontWeight: '700',
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
