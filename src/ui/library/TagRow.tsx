import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { plural } from '../format';
import { artworkRadius } from '../player/Artwork';
import { colors, font, iconSize, spacing, tagColor } from '../theme';

export const TAG_ROW_HEIGHT = 72;
/** The same size as a song row's artwork, so folders and songs line up as one directory. */
const TILE = 48;

export interface TagRowProps {
  name: string;
  /** The tag's stored colour name. */
  color: string | null;
  /** Includes songs tagged with any subtag. */
  songCount: number;
  childCount: number;
  onPress: () => void;
}

/**
 * A tag shown as a folder: tags hold songs the way folders hold files, a
 * pattern people already know. A folder icon on the tag's own colour.
 */
export function TagRow({ name, color, songCount, childCount, onPress }: TagRowProps) {
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
      <View style={[styles.tile, { backgroundColor: `${tagColor(color)}38` }]}>
        <Ionicons name="folder" size={iconSize.md} color={tagColor(color)} />
      </View>
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
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: artworkRadius(TILE),
    alignItems: 'center',
    justifyContent: 'center',
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
