import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { plural } from '../format';
import { Icon } from '../Icon';
import { colors, font, iconSize, radius, spacing } from '../theme';
import { ArtMosaic } from './ArtMosaic';
import { useDragToAct } from './FoldHandle';
import { FinishButtons, type ShuffleCount } from './Pot';

/** The artwork's size when there's room for it; smaller only on a screen too short for it. */
export const COVER_ART = 168;
const DOT = 10;
const MAX_DOTS = 6;
const WELL = 140;
const HANDLE = 36;

export interface PotCoverProps {
  empty: boolean;
  /** The mix in words: "kpop × chill + lofi". */
  title: string;
  /** Its tags' colours, in order, for the dots. */
  hues: readonly string[];
  /** Album ids for the artwork, most played first. */
  covers: readonly string[];
  counted: ShuffleCount | null;
  editing: string | null;
  /** Opens the pot to change it: a tap anywhere on the cover. */
  onOpen: () => void;
  onSave: () => void;
  onShuffle: () => void;
  /** The artwork's size, if not `COVER_ART`. */
  artSize?: number;
}

/**
 * The pot folded away: not the form you build in, but the mix as it stands,
 * like a mix card. Its artwork, what it is in words and colours, how many
 * songs, and the two ways to finish. It looks like something that opens (a
 * card with a grab handle, giving under the finger) and the whole of it is
 * the target: tap it, or swipe it up. Empty, it holds one big dashed place
 * to start.
 */
export function PotCover({ empty, title, hues, covers, counted, editing, onOpen, onSave, onShuffle, artSize = COVER_ART }: PotCoverProps) {
  const none = counted?.count === 0;
  // Dragged up, the card rises with the finger, and opens if it goes far enough.
  const lift = useRef(new Animated.Value(0)).current;
  const drag = useDragToAct({ offset: lift, direction: -1, act: onOpen });
  return (
    <Animated.View {...drag} style={{ transform: [{ translateY: lift }] }}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={empty ? 'Add tags, artists or albums' : `${title}. Change the mix`}
        style={({ pressed }) => [styles.cover, pressed && styles.pressed]}
      >
        <View style={styles.handle} />
        {empty ? (
          <View style={styles.well}>
            <Icon name="add" size={iconSize.lg} color={colors.textDim} />
            <Text style={styles.wellText}>Add tags, artists or albums</Text>
          </View>
        ) : (
          <>
            <ArtMosaic albumIds={covers} size={artSize} fallbackColor={hues[0] ?? colors.raised} />
            <View style={styles.words}>
              <Text style={styles.title} numberOfLines={2}>
                {editing ?? title}
              </Text>
              {hues.length > 0 && (
                <View style={styles.dots}>
                  {hues.slice(0, MAX_DOTS).map((hue, i) => (
                    <View key={i} style={[styles.dot, { backgroundColor: hue }]} />
                  ))}
                </View>
              )}
              <Text style={styles.count}>
                {counted === null ? ' ' : none ? 'No songs match' : plural(counted.count, 'song')}
              </Text>
            </View>
          </>
        )}
        <View style={styles.finish}>
          <FinishButtons empty={empty} editing={editing} counted={counted} onSave={onSave} onShuffle={onShuffle} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // A card, a step up from the page, like the mix cards: something to pick up.
  cover: {
    alignItems: 'center',
    gap: spacing.lg,
    marginHorizontal: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  // The usual sign of something that opens or expands.
  handle: {
    width: HANDLE,
    height: 4,
    borderRadius: 2,
    marginBottom: -spacing.xs,
    backgroundColor: colors.raised,
  },
  words: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Full width, centred inside: see EmptyState's title for why.
  title: {
    ...font.title,
    alignSelf: 'stretch',
    textAlign: 'center',
    color: colors.text,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
  },
  count: {
    ...font.label,
    color: colors.textDim,
  },
  well: {
    alignSelf: 'stretch',
    height: WELL,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  wellText: {
    ...font.label,
    color: colors.textDim,
  },
  finish: {
    alignSelf: 'stretch',
  },
});
