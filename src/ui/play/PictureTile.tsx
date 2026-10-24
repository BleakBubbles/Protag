import { Ionicons } from '@expo/vector-icons';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';

import { albumArtUri } from '../../library/assets';
import type { Ref } from '../../query/refs';
import type { TagChoice } from '../../query/types';
import { Artwork } from '../player/Artwork';
import { colors, font, iconSize, radius, spacing } from '../theme';
import { useDraggable, usePotDrop } from './PotDrag';

export const PICTURE_TILE_SIZE = 76;
const BADGE = 20;
const RING_GAP = 2;
const RING_WIDTH = 2;

/** The same rings as a tag tile: white when it's in the mix, red when it's kept out. */
const RING: Record<Exclude<TagChoice, 'off'>, string> = { include: colors.text, exclude: colors.exclude };

const TAP_LABEL: Record<TagChoice, string> = {
  off: 'Add to the mix',
  include: 'Take out of the mix',
  exclude: 'Let its songs back in',
};

export interface PictureTileProps {
  refId: Ref;
  name: string;
  /** Album id of the picture. */
  cover: string | null;
  /** Round for an artist (a person), square for an album. */
  round: boolean;
  choice: TagChoice;
  onPress: () => void;
}

/**
 * An artist or album in the Play tab: its picture with its name under it,
 * working exactly like a tag tile — tap to put it in the pot, hold to drag it,
 * a white ring and ✓ when it's in, a red ring and − when it's kept out.
 */
export function PictureTile({ refId, name, cover, round, choice, onPress }: PictureTileProps) {
  const { handlers, pressed, lifting } = useDraggable(
    { kind: 'tile', ref: refId },
    // Lifts as its picture, not as text.
    { parts: [{ name, hue: null, cover, round }], picture: true },
    onPress
  );
  const drop = usePotDrop();
  const corner = round ? PICTURE_TILE_SIZE / 2 : radius.md;

  return (
    <View
      {...handlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${round ? 'artist' : 'album'}${choice === 'include' ? ', in the mix' : choice === 'exclude' ? ', kept out' : ''}`}
      accessibilityActions={[
        { name: 'activate', label: TAP_LABEL[choice] },
        ...(choice === 'exclude' ? [] : [{ name: 'keepOut', label: 'Keep its songs out' }]),
      ]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName !== 'keepOut') return onPress();
        drop({ kind: 'tile', ref: refId }, { kind: 'keepOut' });
        AccessibilityInfo.announceForAccessibility(`${name} kept out`);
      }}
      style={[styles.tile, (pressed || lifting) && styles.dimmed]}
    >
      <View>
        <Artwork uri={cover ? albumArtUri(cover) : null} size={PICTURE_TILE_SIZE} cornerRadius={corner} />
        {choice !== 'off' && (
          <>
            <View
              pointerEvents="none"
              style={[styles.ring, { borderColor: RING[choice], borderRadius: corner + RING_GAP + RING_WIDTH }]}
            />
            <View style={[styles.badge, { backgroundColor: choice === 'include' ? colors.text : colors.exclude }]}>
              <Ionicons name={choice === 'include' ? 'checkmark' : 'remove'} size={iconSize.sm - 6} color={colors.bg} />
            </View>
          </>
        )}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

/** The end of a picture row: the way to every artist or album, in a searchable sheet. */
export function SeeAllTile({ label, round, onPress }: { label: string; round: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.tile, pressed && styles.dimmed]}
    >
      <View style={[styles.seeAll, { borderRadius: round ? PICTURE_TILE_SIZE / 2 : radius.md }]}>
        <Ionicons name="search" size={iconSize.md} color={colors.textDim} />
      </View>
      <Text style={[styles.name, styles.seeAllName]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  seeAll: {
    width: PICTURE_TILE_SIZE,
    height: PICTURE_TILE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  seeAllName: {
    color: colors.textDim,
  },
  tile: {
    width: PICTURE_TILE_SIZE,
    alignItems: 'center',
    gap: spacing.sm,
  },
  dimmed: {
    opacity: 0.5,
  },
  ring: {
    position: 'absolute',
    top: -RING_GAP - RING_WIDTH,
    right: -RING_GAP - RING_WIDTH,
    bottom: -RING_GAP - RING_WIDTH,
    left: -RING_GAP - RING_WIDTH,
    borderWidth: RING_WIDTH,
  },
  badge: {
    position: 'absolute',
    top: -RING_GAP,
    right: -RING_GAP,
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    ...font.label,
    color: colors.text,
    textAlign: 'center',
    alignSelf: 'stretch',
  },
});
