import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCount } from './format';
import { colors, font, iconSize, radius, spacing, tagColor, touchTarget } from './theme';

export interface TagChipProps {
  name: string;
  /** The tag's stored colour name. */
  color?: string | null;
  /** Shown after the name when given. */
  count?: number;
  onPress?: () => void;
  /** Shows a remove (×) affordance; the whole chip becomes the remove target. */
  onRemove?: () => void;
  disabled?: boolean;
  /** Small, display-only variant for dense rows like the song list. */
  compact?: boolean;
  /**
   * Tapping creates this tag rather than applying an existing one. Shown dashed
   * with a plus, so a suggestion never silently creates something new.
   */
  isNew?: boolean;
}

export function TagChip({ name, color, count, onPress, onRemove, disabled, compact, isNew }: TagChipProps) {
  const handler = onRemove ?? onPress;
  let label = name;
  if (onRemove) label = `Remove ${name}`;
  else if (isNew) label = `Create tag ${name}`;
  else if (count !== undefined) label = `${name}, ${count} songs`;

  return (
    <Pressable
      onPress={handler}
      disabled={disabled || !handler}
      accessibilityRole={handler ? 'button' : 'text'}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        compact && styles.compact,
        isNew && styles.isNew,
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      {isNew ? (
        <Ionicons name="add" size={iconSize.sm - 4} color={colors.textDim} />
      ) : (
        <View style={[styles.dot, compact && styles.dotCompact, { backgroundColor: tagColor(color) }]} />
      )}
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
  isNew: {
    backgroundColor: 'transparent',
    borderStyle: 'dashed',
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
