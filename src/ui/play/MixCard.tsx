import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, radius, spacing } from '../theme';
import { ArtMosaic } from './ArtMosaic';

export const MIX_CARD_WIDTH = 148;

export interface MixCardProps {
  name: string;
  /** What the mix is, in words: "driving AND kpop, not sad". */
  description: string;
  /** Album ids for the artwork, most played first. */
  albumIds: readonly string[];
  /** For a mix with no artwork: the colour of its first tag. */
  color: string;
  onPress: () => void;
  onLongPress: () => void;
}

/**
 * A saved mix, led by its artwork so it's recognisable at a glance. One tap
 * shuffles it; a long press offers edit, rename, delete. Fixed height, so
 * cards line up whatever their text.
 */
export function MixCard({ name, description, albumIds, color, onPress, onLongPress }: MixCardProps) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`Shuffle ${name}: ${description}`}
      accessibilityHint="Long press for more options"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.art}>
        <ArtMosaic albumIds={albumIds} size={MIX_CARD_WIDTH} fallbackColor={color} />
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.description} numberOfLines={1}>
        {description}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: MIX_CARD_WIDTH,
    gap: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  art: {
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.xs,
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
