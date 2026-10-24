import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewInstance } from 'react-native';

import type { Rect } from '../Popover';
import { colors, font, radius, spacing } from '../theme';
import { ArtMosaic } from './ArtMosaic';

const RING_GAP = 2;
const RING_WIDTH = 2;

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
  /** With where its artwork is, for its menu to open under. */
  onLongPress: (at: Rect) => void;
  /** Its menu is open: ringed like a tile in the mix, so it's clear which mix it's for. */
  held?: boolean;
}

/**
 * A saved mix, led by its artwork so it's recognisable at a glance. One tap
 * shuffles it; held, it opens a menu (edit, rename, delete) under its
 * artwork. Fixed height, so cards line up whatever their text.
 */
export function MixCard({ name, description, albumIds, color, width, onPress, onLongPress, held }: MixCardProps) {
  const art = useRef<ViewInstance>(null);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={() => art.current?.measureInWindow((x, y, w, h) => onLongPress({ x, y, width: w, height: h }))}
      accessibilityRole="button"
      accessibilityLabel={`Shuffle ${name}: ${description}`}
      accessibilityHint="Long press for more options"
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
    >
      <View ref={art} collapsable={false}>
        <View style={styles.art}>
          <ArtMosaic albumIds={albumIds} size={width} fallbackColor={color} />
        </View>
        {held && <View pointerEvents="none" style={styles.ring} />}
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
  // The same white ring as a tile in the mix: this is the one its menu is for.
  ring: {
    position: 'absolute',
    top: -RING_GAP - RING_WIDTH,
    left: -RING_GAP - RING_WIDTH,
    right: -RING_GAP - RING_WIDTH,
    bottom: spacing.xs - RING_GAP - RING_WIDTH,
    borderRadius: radius.md + RING_GAP + RING_WIDTH,
    borderWidth: RING_WIDTH,
    borderColor: colors.text,
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
