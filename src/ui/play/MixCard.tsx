import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewInstance } from 'react-native';

import type { Rect } from '../Popover';
import { colors, font, radius, spacing } from '../theme';
import { ArtMosaic } from './ArtMosaic';

export interface MixCardProps {
  name: string;
  /** What the mix is, in words: "kpop × chill, not sad". */
  description: string;
  /** Album ids for the artwork, most played first. */
  albumIds: readonly string[];
  /** For a mix with no artwork: the colour of its first tag. */
  color: string;
  /** The card is this wide and its artwork square. */
  width: number;
  onPress: () => void;
  /** With where the card is, for its menu to float from. */
  onLongPress: (at: Rect) => void;
}

/**
 * A saved mix, led by its artwork so it's recognisable at a glance. One tap
 * shuffles it; a long press offers edit, rename, delete. Fixed height, so
 * cards line up whatever their text.
 */
export function MixCard({ name, description, albumIds, color, width, onPress, onLongPress }: MixCardProps) {
  const ref = useRef<ViewInstance>(null);
  return (
    <Pressable
      ref={ref}
      onPress={onPress}
      onLongPress={() => ref.current?.measureInWindow((x, y, w, h) => onLongPress({ x, y, width: w, height: h }))}
      accessibilityRole="button"
      accessibilityLabel={`Shuffle ${name}: ${description}`}
      accessibilityHint="Long press for more options"
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
    >
      <View style={styles.art}>
        <ArtMosaic albumIds={albumIds} size={width} fallbackColor={color} />
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
