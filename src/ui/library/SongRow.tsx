import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TagRow as Tag } from '../../db/types';
import { IconButton } from '../IconButton';
import { Artwork } from '../player/Artwork';
import { TagChip } from '../TagChip';
import { colors, font, spacing } from '../theme';

/**
 * Fixed so the list can compute row positions instead of measuring each one,
 * which keeps scrolling smooth through thousands of songs.
 */
export const SONG_ROW_HEIGHT = 80;
const MAX_CHIPS = 3;
const THUMB = 48;

export interface SongRowProps {
  id: number;
  title: string;
  artist: string | null;
  artworkUri: string | null;
  tags: readonly Tag[];
  /** Highlights the row, e.g. the song currently playing. */
  active?: boolean;
  /**
   * Take the id rather than being pre-bound, so the parent can pass one stable
   * callback to every row and memo actually skips re-rendering unchanged rows.
   */
  onPress: (id: number) => void;
  onEditTags: (id: number) => void;
}

export const SongRow = memo(function SongRow({
  id,
  title,
  artist,
  artworkUri,
  tags,
  active,
  onPress,
  onEditTags,
}: SongRowProps) {
  const hidden = tags.length - MAX_CHIPS;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onPress(id)}
        accessibilityRole="button"
        accessibilityLabel={`Play ${title}${artist ? ` by ${artist}` : ''}`}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <Artwork uri={artworkUri} size={THUMB} />
        <View style={styles.text}>
          <Text style={[styles.title, active && styles.active]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {artist ?? ' '}
          </Text>
          {/* Always present, so every row is the same height whether tagged or not. */}
          <View style={styles.chips}>
            {tags.slice(0, MAX_CHIPS).map((tag) => (
              <TagChip key={tag.id} name={tag.name} compact />
            ))}
            {hidden > 0 && <Text style={styles.more}>+{hidden}</Text>}
          </View>
        </View>
      </Pressable>
      <IconButton
        icon={tags.length > 0 ? 'pricetags' : 'pricetag-outline'}
        label={`Edit tags for ${title}`}
        color={tags.length > 0 ? colors.textDim : colors.textFaint}
        onPress={() => onEditTags(id)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    height: SONG_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.sm,
  },
  main: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingLeft: spacing.lg,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...font.listTitle,
    color: colors.text,
    includeFontPadding: false,
  },
  active: {
    color: colors.accent,
  },
  artist: {
    ...font.caption,
    color: colors.textDim,
    includeFontPadding: false,
  },
  chips: {
    height: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    overflow: 'hidden',
  },
  more: {
    ...font.caption,
    color: colors.textFaint,
  },
});
