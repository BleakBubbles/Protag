import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import type { IconName } from './IconButton';
import { colors, font, iconSize, radius, spacing, touchTarget } from './theme';

/**
 * - `primary`: filled accent, for the one main action on a screen.
 * - `tonal`: a soft accent tint, for actions that should be noticed without
 *   shouting, like the call to action in an empty state.
 * - `secondary`: outlined and neutral.
 */
export type ButtonVariant = 'primary' | 'tonal' | 'secondary';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  /** Shown before the label. */
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}

const LABEL_COLOR: Record<ButtonVariant, string> = {
  primary: colors.onAccent,
  tonal: colors.accentFg,
  secondary: colors.text,
};

export function Button({ label, onPress, disabled, variant = 'primary', icon, style }: ButtonProps) {
  const color = LABEL_COLOR[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        variant === 'tonal' && styles.tonal,
        variant === 'secondary' && styles.secondary,
        (pressed || disabled) && styles.dimmed,
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={iconSize.sm} color={color} />}
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    minHeight: touchTarget,
    paddingHorizontal: spacing.lg,
    alignSelf: 'flex-start',
  },
  tonal: {
    backgroundColor: colors.accentTint,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dimmed: {
    opacity: 0.6,
  },
  label: {
    ...font.label,
  },
});
