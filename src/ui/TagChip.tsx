import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCount } from './format';
import { colors, font, iconSize, radius, spacing, tagColor, touchTarget } from './theme';

export interface TagChipProps {
  name: string;
  /** Shown after the name when given. */
  count?: number;
  onPress?: () => void;
  /** Shows a remove (×) affordance; the whole chip becomes the remove target. */
  onRemove?: () => void;
  disabled?: boolean;
  /** Small, display-only variant for dense rows like the song list. */
  compact?: boolean;
}

export function TagChip({ name, count, onPress, onRemove, disabled, compact }: TagChipProps) {
  const handler = onRemove ?? onPress;
  const label = onRemove
    ? `Remove ${name}`
    : count === undefined
      ? name
      : `${name}, ${count} songs`;

  return (
    <Pressable
      onPress={handler}
      disabled={disabled || !handler}
      accessibilityRole={handler ? 'button' : 'text'}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        compact && styles.compact,
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      <View style={[styles.dot, compact && styles.dotCompact, { backgroundColor: tagColor(name) }]} />
      <Text style={[styles.name, compact && styles.nameCompact]} numberOfLines={1}>
        {name}
      </Text>
      {count !== undefined && <Text style={styles.count}>{formatCount(count)}</Text>}
      {onRemove && <Ionicons name="close" size={iconSize.sm - 4} color={colors.textDim} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '100%',
  },
  compact: {
    minHeight: 0,
    height: 20,
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderWidth: 0,
  },
  dimmed: {
    opacity: 0.5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotCompact: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  name: {
    ...font.label,
    color: colors.text,
    flexShrink: 1,
  },
  nameCompact: {
    ...font.caption,
    color: colors.textDim,
  },
  count: {
    ...font.numeric,
    color: colors.textFaint,
  },
});
