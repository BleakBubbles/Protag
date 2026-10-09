import { memo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TagRow as Tag } from '../../db/types';
import { IconButton } from '../IconButton';
import { Artwork } from '../player/Artwork';
import { TagChip } from '../TagChip';
import { colors, font, iconSize, spacing, touchTarget } from '../theme';

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
   * In a list's selection mode: the tag button becomes a check circle in the
   * same spot (so nothing shifts), and taps are the list's to interpret.
   */
  selecting?: boolean;
  selected?: boolean;
  /**
   * Take the id rather than being pre-bound, so the parent can pass one stable
   * callback to every row and memo actually skips re-rendering unchanged rows.
   */
  onPress: (id: number) => void;
  /** More options for the song, e.g. removing it from the tag being viewed. */
  onLongPress?: (id: number) => void;
  onEditTags: (id: number) => void;
}

export const SongRow = memo(function SongRow({
  id,
  title,
  artist,
  artworkUri,
  tags,
  active,
  selecting,
  selected,
  onPress,
  onLongPress,
  onEditTags,
}: SongRowProps) {
  const hidden = tags.length - MAX_CHIPS;

  return (
    <View style={[styles.row, selected && styles.selected]}>
      <Pressable
        onPress={() => onPress(id)}
        onLongPress={onLongPress && (() => onLongPress(id))}
        accessibilityRole="button"
        accessibilityLabel={
          selecting
            ? `${selected ? 'Deselect' : 'Select'} ${title}`
            : `Play ${title}${artist ? ` by ${artist}` : ''}`
        }
        accessibilityState={selecting ? { selected } : undefined}
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
              <TagChip key={tag.id} name={tag.name} color={tag.color} compact />
            ))}
            {hidden > 0 && <Text style={styles.more}>+{hidden}</Text>}
          </View>
        </View>
      </Pressable>
      {selecting ? (
        <View style={styles.check} pointerEvents="none">
          <Ionicons
            name={selected ? 'checkmark-circle' : 'ellipse-outline'}
            size={iconSize.md}
            color={selected ? colors.accentFg : colors.textFaint}
          />
        </View>
      ) : (
        <IconButton
          icon={tags.length > 0 ? 'pricetags' : 'pricetag-outline'}
          label={`Edit tags for ${title}`}
          color={tags.length > 0 ? colors.textDim : colors.textFaint}
          onPress={() => onEditTags(id)}
        />
      )}
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
  selected: {
    backgroundColor: colors.accentTint,
  },
  check: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: colors.accentFg,
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
