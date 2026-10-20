import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';
import { ArtMosaic } from './ArtMosaic';

export const MIX_CARD_HEIGHT = 56;

export interface MixCardProps {
  name: string;
  /** What the mix is, in words: "kpop × chill, not sad". */
  description: string;
  /** Album ids for the artwork, most played first. */
  albumIds: readonly string[];
  /** For a mix with no artwork: the colour of its first tag. */
  color: string;
  width: number;
  onPress: () => void;
  onLongPress: () => void;
}

/**
 * A saved mix as a compact shortcut, artwork first and the name beside it,
 * like the quick-start grid at the top of other music apps. One tap shuffles
 * it; a long press offers edit, rename, delete.
 */
export function MixCard({ name, description, albumIds, color, width, onPress, onLongPress }: MixCardProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`Shuffle ${name}: ${description}`}
      accessibilityHint="Long press for more options"
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
    >
      <ArtMosaic albumIds={albumIds} size={MIX_CARD_HEIGHT} fallbackColor={color} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.description} numberOfLines={1}>
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: MIX_CARD_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  pressed: {
    opacity: 0.7,
  },
  text: {
    flex: 1,
    gap: 2,
    paddingRight: spacing.sm,
  },
  name: {
    ...font.label,
    color: colors.text,
  },
  description: {
    ...font.caption,
    color: colors.textDim,
  },
});
