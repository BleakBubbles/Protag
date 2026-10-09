import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, font, iconSize, radius, spacing, touchTarget } from './theme';

const HEIGHT = 32;

export interface FilterChipProps {
  label: string;
  selected: boolean;
  onToggle: () => void;
}

/**
 * An on/off filter for a list, shown in a row above it. On, it takes the tonal
 * accent with a check, so it's clear at a glance which filters are applied.
 */
export function FilterChip({ label, selected, onToggle }: FilterChipProps) {
  const color = selected ? colors.accentFg : colors.textDim;
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={(touchTarget - HEIGHT) / 2}
      accessibilityRole="switch"
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && styles.pressed]}
    >
      {selected && <Ionicons name="checkmark" size={iconSize.sm - 4} color={color} />}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selected: {
    backgroundColor: colors.accentTint,
    borderColor: 'transparent',
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    ...font.label,
  },
});
