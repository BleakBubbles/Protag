import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewInstance } from 'react-native';

import { feelHold, HOLD_MS } from '../haptics';
import { Icon } from '../Icon';
import type { Rect } from '../Popover';
import { font, radius, spacing } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';
import { ArtMosaic } from './ArtMosaic';

const RING_GAP = 2;
const PIN_SIZE = 16;
const RING_WIDTH = 2;
/** How far the ring stands out from the artwork. */
const RING_OUT = RING_GAP + RING_WIDTH;

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
  /** With where its artwork is, ring and all, for its menu to open under and line up with. */
  onLongPress: (at: Rect) => void;
  /** Its menu is open: ringed like a tile in the mix, so it's clear which mix it's for. */
  held?: boolean;
  /** Pinned to the front of the shelf: a pin before its name says why it's there. */
  pinned?: boolean;
}

/**
 * A saved mix, led by its artwork so it's recognisable at a glance. One tap
 * shuffles it; held, it opens a menu (edit, rename, delete) under its
 * artwork. Fixed height, so cards line up whatever their text.
 */
export function MixCard({ name, description, albumIds, color, width, onPress, onLongPress, held, pinned }: MixCardProps) {
  const colors = useColors();
  const styles = useStyles();
  const art = useRef<ViewInstance>(null);
  return (
    <Pressable
      onPress={onPress}
      delayLongPress={HOLD_MS}
      onLongPress={() => {
        feelHold();
        // The ring the card wears while its menu is open, not the bare artwork.
        art.current?.measureInWindow((x, y, w, h) =>
          onLongPress({ x: x - RING_OUT, y: y - RING_OUT, width: w + RING_OUT * 2, height: h + RING_OUT * 2 })
        );
      }}
      accessibilityRole="button"
      accessibilityLabel={`Shuffle ${name}${pinned ? ', pinned' : ''}: ${description}`}
      accessibilityHint="Long press for more options"
      style={({ pressed }) => [styles.card, { width }, pressed && styles.pressed]}
    >
      <View ref={art} collapsable={false} style={styles.artBox}>
        <View style={styles.art}>
          <ArtMosaic albumIds={albumIds} size={width} fallbackColor={color} />
        </View>
        {held && <View pointerEvents="none" style={styles.ring} />}
      </View>
      <View style={styles.nameRow}>
        {pinned && <Icon name="pin-filled" size={PIN_SIZE} color={colors.textDim} />}
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <Text style={styles.description} numberOfLines={1}>
        {description}
      </Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  card: {
    gap: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  // Its margin outside it, so what's measured is just the artwork.
  artBox: {
    marginBottom: spacing.xs,
  },
  art: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  // The same white ring as a tile in the mix: this is the one its menu is for.
  ring: {
    position: 'absolute',
    top: -RING_OUT,
    left: -RING_OUT,
    right: -RING_OUT,
    bottom: -RING_OUT,
    borderRadius: radius.md + RING_OUT,
    borderWidth: RING_WIDTH,
    borderColor: colors.text,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  name: {
    ...font.listTitle,
    color: colors.text,
    flexShrink: 1,
  },
  description: {
    ...font.caption,
    color: colors.textDim,
  },
}));
