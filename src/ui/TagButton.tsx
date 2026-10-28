import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from './Icon';
import { font, iconSize, radius, spacing, touchTarget } from './theme';
import { makeStyles, useColors } from './ThemeContext';

export interface TagButtonProps {
  onPress: () => void;
  /** What it tags, for screen readers: "Tag this song", "Tag songs by NewJeans". */
  label: string;
}

/**
 * The round tag button that ends a row of tag chips, dressed like them: one of
 * the row rather than a call to action, but always there and easy to hit.
 */
export function TagButton({ onPress, label }: TagButtonProps) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Icon name="tag" size={iconSize.sm} color={colors.textDim} />
    </Pressable>
  );
}

/**
 * A row of tags with none in it: a faint dashed pill where the chips would be,
 * then the tag button, in its usual place. It states a fact rather than asking
 * for something, and keeps the row's shape, so the first tag simply takes the
 * placeholder's place. The placeholder is a way in too.
 */
export function NoTags({ onPress, label }: TagButtonProps) {
  const styles = useStyles();
  return (
    <View style={styles.line}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`No tags yet. ${label}`}
        style={({ pressed }) => [styles.placeholder, pressed && styles.pressed]}
      >
        <Text style={styles.placeholderText}>No tags yet</Text>
      </Pressable>
      <TagButton onPress={onPress} label={label} />
    </View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  // The tag chip's shape, dashed and empty: a slot, not a thing.
  placeholder: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  placeholderText: {
    ...font.label,
    color: colors.textFaint,
  },
}));
