import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './Icon';
import { colors, font, iconSize, radius, spacing, touchTarget } from './theme';

export interface TagButtonProps {
  onPress: () => void;
  /** What it tags, for screen readers: "Tag this song", "Tag songs by NewJeans". */
  label: string;
  /**
   * Shows `label` beside the button too, outside it so the button stays small:
   * for when there are no tag chips to sit next to. The whole line is the target.
   */
  showLabel?: boolean;
}

/**
 * The round tag button that ends a row of tag chips, dressed like them: one of
 * the row rather than a call to action, but always there and easy to hit.
 */
export function TagButton({ onPress, label, showLabel }: TagButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.line, pressed && styles.pressed]}
    >
      <View style={styles.button}>
        <Icon name="tag" size={iconSize.sm} color={colors.textDim} />
      </View>
      {showLabel && (
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.6,
  },
  button: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    ...font.body,
    flexShrink: 1,
    color: colors.textDim,
  },
});
