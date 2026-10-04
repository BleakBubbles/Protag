import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, iconSize, radius, touchTarget } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export interface IconButtonProps {
  icon: IconName;
  /** Read by screen readers — icon-only buttons have no visible text. */
  label: string;
  onPress: () => void;
  size?: number;
  color?: string;
  /** For toggles (shuffle, repeat): announced as selected and tinted. */
  active?: boolean;
  disabled?: boolean;
  /** Small overlay, e.g. the "1" on repeat-one. */
  badge?: ReactNode;
}

export function IconButton({
  icon,
  label,
  onPress,
  size = iconSize.md,
  color,
  active,
  disabled,
  badge,
}: IconButtonProps) {
  const tint = color ?? (active ? colors.accent : colors.text);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      hitSlop={Math.max(0, (touchTarget - size) / 2)}
      style={({ pressed }) => [styles.button, (pressed || disabled) && styles.dimmed]}
    >
      <Ionicons name={icon} size={size} color={tint} />
      {badge != null && <View style={styles.badge}>{badge}</View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  dimmed: {
    opacity: 0.5,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
});
