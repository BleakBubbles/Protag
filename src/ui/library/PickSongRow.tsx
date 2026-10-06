import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Artwork } from '../player/Artwork';
import { colors, font, iconSize, spacing } from '../theme';

/** Fixed, for the same reason as SongRow: the list computes positions instead of measuring. */
export const PICK_ROW_HEIGHT = 64;
const THUMB = 40;

export interface PickSongRowProps {
  id: number;
  title: string;
  artist: string | null;
  artworkUri: string | null;
  /** Has the tag itself — what tapping toggles. */
  selected: boolean;
  /** Already under the tag through a subtag, e.g. "seoul". Shown so it isn't mistaken for untagged. */
  viaSubtag?: string | null;
  onToggle: (id: number) => void;
}

/** A song in the add-songs picker. One tap toggles it in or out. */
export const PickSongRow = memo(function PickSongRow({
  id,
  title,
  artist,
  artworkUri,
  selected,
  viaSubtag,
  onToggle,
}: PickSongRowProps) {
  const subtitle = viaSubtag && !selected ? `in via ${viaSubtag}` : (artist ?? ' ');
  return (
    <Pressable
      onPress={() => onToggle(id)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}${artist ? ` by ${artist}` : ''}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Artwork uri={artworkUri} size={THUMB} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.subtitle, viaSubtag && !selected && styles.via]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={iconSize.md}
        color={selected ? colors.accent : colors.textFaint}
      />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    height: PICK_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  text: {
    flex: 1,
  },
  title: {
    ...font.body,
    color: colors.text,
    includeFontPadding: false,
  },
  subtitle: {
    ...font.caption,
    color: colors.textDim,
    includeFontPadding: false,
  },
  via: {
    color: colors.accent,
  },
});
