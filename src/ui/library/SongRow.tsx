import { memo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { SongChip } from '../../library/songChips';
import { feelHold, HOLD_MS } from '../haptics';
import { Artwork, artworkRadius } from '../player/Artwork';
import { TagChip } from '../TagChip';
import { font, iconSize, spacing } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';

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
  /** Its tags as chips read (`listSongChips`). */
  chips: readonly SongChip[];
  /** Highlights the row, e.g. the song currently playing. */
  active?: boolean;
  /**
   * In a list's selection mode: a check shows over the artwork (so nothing
   * moves when selection starts), and taps are the list's to interpret.
   */
  selecting?: boolean;
  selected?: boolean;
  /**
   * Take the id rather than being pre-bound, so the parent can pass one stable
   * callback to every row and memo actually skips re-rendering unchanged rows.
   */
  onPress: (id: number) => void;
  /** Starts a list's selection mode, which is how songs are tagged from a list. */
  onLongPress?: (id: number) => void;
  /** Dimmed and untappable, keeping its place (while selecting tags above it). */
  disabled?: boolean;
}

export const SongRow = memo(function SongRow({
  id,
  title,
  artist,
  artworkUri,
  chips,
  active,
  selecting,
  selected,
  onPress,
  onLongPress,
  disabled,
}: SongRowProps) {
  const colors = useColors();
  const styles = useStyles();
  const hidden = chips.length - MAX_CHIPS;

  return (
    // One touch area for the whole row. While selecting, the selection colour
    // is the feedback; a pressed highlight on top would linger (Android holds a
    // quick tap "pressed" for 130 ms) and briefly disagree with it.
    <Pressable
      onPress={() => onPress(id)}
      delayLongPress={HOLD_MS}
      onLongPress={
        onLongPress &&
        (() => {
          feelHold();
          onLongPress(id);
        })
      }
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={
        selecting ? `${selected ? 'Deselect' : 'Select'} ${title}` : `Play ${title}${artist ? ` by ${artist}` : ''}`
      }
      accessibilityState={selecting ? { selected } : undefined}
      style={({ pressed }) => [
        styles.row,
        selected ? styles.selected : pressed && !selecting && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View>
        <Artwork uri={artworkUri} size={THUMB} />
        {selecting && (
          <View style={[styles.check, selected && styles.checkOn]} pointerEvents="none">
            <Ionicons
              name={selected ? 'checkmark' : 'ellipse-outline'}
              size={selected ? iconSize.md : iconSize.sm}
              color={colors.text}
            />
          </View>
        )}
      </View>
      <View style={styles.text}>
        <Text style={[styles.title, active && styles.active]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {artist ?? ' '}
        </Text>
        {/* Always present, so every row is the same height whether tagged or not. */}
        <View style={styles.chips}>
          {chips.slice(0, MAX_CHIPS).map(({ tag, prefix }) => (
            <TagChip key={tag.id} name={tag.name} prefix={prefix} color={tag.color} compact />
          ))}
          {hidden > 0 && <Text style={styles.more}>+{hidden}</Text>}
        </View>
      </View>
    </Pressable>
  );
});

const useStyles = makeStyles((colors) => StyleSheet.create({
  row: {
    height: SONG_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  selected: {
    backgroundColor: colors.selectedTint,
  },
  disabled: {
    opacity: 0.4,
  },
  // Over the artwork: a dark veil with an empty ring, or the accent with a tick.
  check: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: artworkRadius(THUMB),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  checkOn: {
    backgroundColor: `${colors.accent}D9`,
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
    color: colors.textDim,
  },
}));
