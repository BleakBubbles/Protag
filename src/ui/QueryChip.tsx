import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TagChoice } from '../query/types';
import { colors, font, iconSize, radius, spacing, tagColor, touchTarget } from './theme';

const HEIGHT = 36;
const ICON = iconSize.sm - 4;

const CHOICE_LABEL: Record<TagChoice, string> = {
  include: 'included',
  exclude: 'excluded',
  off: 'not used',
};

export interface QueryChipProps {
  name: string;
  /** The tag's stored colour name. */
  color: string | null;
  choice: TagChoice;
  onPress: () => void;
  /** Present when the tag has subtags: shows an arrow that reveals them. */
  expanded?: boolean;
  onToggleExpanded?: () => void;
}

/**
 * A tag in the query builder. Tapping cycles include → exclude → off, and
 * each state looks distinct: filled in the tag's colour with a check, struck
 * through with a minus, or plain.
 */
export function QueryChip({ name, color, choice, onPress, expanded, onToggleExpanded }: QueryChipProps) {
  const hue = tagColor(color);
  return (
    <View
      style={[
        styles.chip,
        choice === 'include' && { backgroundColor: `${hue}38`, borderColor: hue },
        choice === 'exclude' && styles.excluded,
      ]}
    >
      <Pressable
        onPress={onPress}
        hitSlop={{ top: (touchTarget - HEIGHT) / 2, bottom: (touchTarget - HEIGHT) / 2 }}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${CHOICE_LABEL[choice]}`}
        accessibilityHint="Tap to include, then exclude, then clear"
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        {choice === 'include' ? (
          <Ionicons name="checkmark" size={ICON} color={hue} />
        ) : choice === 'exclude' ? (
          <Ionicons name="remove" size={ICON} color={colors.exclude} />
        ) : (
          <View style={[styles.dot, { backgroundColor: hue }]} />
        )}
        <Text style={[styles.name, choice === 'exclude' && styles.nameExcluded]} numberOfLines={1}>
          {name}
        </Text>
      </Pressable>
      {onToggleExpanded && (
        <Pressable
          onPress={onToggleExpanded}
          hitSlop={{ top: (touchTarget - HEIGHT) / 2, bottom: (touchTarget - HEIGHT) / 2, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel={expanded ? `Hide subtags of ${name}` : `Show subtags of ${name}`}
          style={({ pressed }) => [styles.expand, pressed && styles.pressed]}
        >
          <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={ICON} color={colors.textDim} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  excluded: {
    backgroundColor: 'transparent',
    borderColor: colors.exclude,
    borderStyle: 'dashed',
  },
  main: {
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    flexShrink: 1,
  },
  expand: {
    height: '100%',
    justifyContent: 'center',
    paddingLeft: spacing.xs,
    paddingRight: spacing.sm + 2,
    marginLeft: -spacing.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  name: {
    ...font.label,
    color: colors.text,
    flexShrink: 1,
  },
  nameExcluded: {
    color: colors.textDim,
    textDecorationLine: 'line-through',
  },
});
