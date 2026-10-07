import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { plural } from '../format';
import { colors, font, iconSize, spacing, tagColor } from '../theme';

export const TAG_ROW_HEIGHT = 60;

export interface TagRowProps {
  name: string;
  /** Includes songs tagged with any subtag. */
  songCount: number;
  childCount: number;
  onPress: () => void;
}

export function TagRow({ name, songCount, childCount, onPress }: TagRowProps) {
  const meta = [plural(songCount, 'song'), childCount > 0 ? plural(childCount, 'subtag') : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${meta}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.dot, { backgroundColor: tagColor(name) }]} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    height: TAG_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  text: {
    flex: 1,
  },
  name: {
    ...font.name,
    color: colors.text,
  },
  meta: {
    ...font.caption,
    color: colors.textDim,
  },
});
