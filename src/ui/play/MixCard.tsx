import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, font, radius, spacing } from '../theme';

export const MIX_CARD_WIDTH = 160;

export interface MixCardProps {
  name: string;
  /** What the mix is, in words: "driving AND kpop, not sad". */
  description: string;
  onPress: () => void;
  onLongPress: () => void;
}

/** A saved mix: one tap shuffles it, a long press offers edit, rename, delete. */
export function MixCard({ name, description, onPress, onLongPress }: MixCardProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`Shuffle ${name}: ${description}`}
      accessibilityHint="Long press for more options"
      android_ripple={{ color: colors.border }}
      style={styles.card}
    >
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.description} numberOfLines={2}>
        {description}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: MIX_CARD_WIDTH,
    minHeight: 72,
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  name: {
    ...font.listTitle,
    color: colors.text,
  },
  description: {
    ...font.caption,
    color: colors.textDim,
  },
});
