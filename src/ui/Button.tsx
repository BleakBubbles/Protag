import { createContext, useContext } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './Icon';
import { colors, font, iconSize, radius, spacing, touchTarget } from './theme';

/**
 * Every button is a pill, whatever its variant, so buttons side by side match.
 *
 * - `primary`: filled accent, for the one main action on a screen.
 * - `tonal`: a soft accent tint, for actions that should be noticed without
 *   shouting: a card's main action, the call to action in an empty state.
 * - `secondary`: outlined and neutral; a card's other action.
 */
export type ButtonVariant = 'primary' | 'tonal' | 'secondary';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  /** Shown before the label. */
  icon?: IconName;
  /** `small` fits beside a section heading; its touch area still meets the minimum. */
  size?: 'regular' | 'small';
  style?: StyleProp<ViewStyle>;
}

const SMALL_HEIGHT = 32;

/**
 * True inside a row whose buttons share its width equally (`CardActions`):
 * each button stretches to its share instead of hugging its label.
 */
export const ButtonFillContext = createContext(false);

const LABEL_COLOR: Record<ButtonVariant, string> = {
  primary: colors.onAccent,
  tonal: colors.accentFg,
  secondary: colors.text,
};

export function Button({
  label,
  onPress,
  disabled,
  variant = 'primary',
  icon,
  size = 'regular',
  style,
}: ButtonProps) {
  const color = LABEL_COLOR[variant];
  const fill = useContext(ButtonFillContext);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      hitSlop={size === 'small' ? (touchTarget - SMALL_HEIGHT) / 2 : undefined}
      style={({ pressed }) => [
        styles.button,
        variant === 'tonal' && styles.tonal,
        variant === 'secondary' && styles.secondary,
        size === 'small' && styles.small,
        fill && styles.fill,
        (pressed || disabled) && styles.dimmed,
        style,
      ]}
    >
      {icon && <Icon name={icon} size={size === 'small' ? iconSize.sm - 4 : iconSize.sm} color={color} />}
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
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
    borderRadius: radius.pill,
    minHeight: touchTarget,
    paddingHorizontal: spacing.xl,
    alignSelf: 'flex-start',
  },
  tonal: {
    backgroundColor: colors.accentTint,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
  fill: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing.md,
  },
  small: {
    minHeight: SMALL_HEIGHT,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  dimmed: {
    opacity: 0.6,
  },
  label: {
    ...font.label,
  },
});
