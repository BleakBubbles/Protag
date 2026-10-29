import { createContext, useContext } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { Icon, type IconName } from './Icon';
import { font, iconSize, radius, spacing, touchTarget, type Palette } from './theme';
import { makeStyles, useColors } from './ThemeContext';

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
  /** Shown before the label, or after it with `iconAfter` (an arrow onwards: Next). */
  icon?: IconName;
  iconAfter?: boolean;
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

const LABEL_COLOR: Record<ButtonVariant, keyof Palette> = {
  primary: 'onAccent',
  tonal: 'accentFg',
  secondary: 'text',
};

export function Button({
  label,
  onPress,
  disabled,
  variant = 'primary',
  icon,
  iconAfter = false,
  size = 'regular',
  style,
}: ButtonProps) {
  const styles = useStyles();
  const colors = useColors();
  const color = colors[LABEL_COLOR[variant]] as string;
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
      {icon && !iconAfter && <Icon name={icon} size={size === 'small' ? iconSize.sm - 4 : iconSize.sm} color={color} />}
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
      {icon && iconAfter && <Icon name={icon} size={size === 'small' ? iconSize.sm - 4 : iconSize.sm} color={color} />}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
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
}));
