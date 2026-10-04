import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatCount } from './format';
import { colors, font, radius, spacing, tagColor, touchTarget } from './theme';

export interface TagChipProps {
  name: string;
  /** Shown after the name when given. */
  count?: number;
  onPress?: () => void;
  disabled?: boolean;
}

export function TagChip({ name, count, onPress, disabled }: TagChipProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={count === undefined ? name : `${name}, ${count} songs`}
      style={({ pressed }) => [styles.chip, (pressed || disabled) && styles.dimmed]}
    >
      <View style={[styles.dot, { backgroundColor: tagColor(name) }]} />
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      {count !== undefined && <Text style={styles.count}>{formatCount(count)}</Text>}
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
  dimmed: {
    opacity: 0.5,
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
  count: {
    ...font.numeric,
    color: colors.textFaint,
  },
});
