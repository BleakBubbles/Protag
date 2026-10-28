import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import { plural } from '../format';
import { artworkRadius } from '../player/Artwork';
import { font, iconSize, spacing } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';

export const TAG_ROW_HEIGHT = 72;
/** The same size as a song row's artwork, so folders and songs line up as one directory. */
const TILE = 48;

export interface TagRowProps {
  name: string;
  /** The tag's stored colour name. */
  color: string | null;
  /** Includes songs tagged with any subtag. */
  songCount: number;
  childCount: number;
  onPress: () => void;
}

/**
 * A tag shown as a folder: tags hold songs the way folders hold files, a
 * pattern people already know. A folder icon on the tag's own colour.
 */
export function TagRow({ name, color, songCount, childCount, onPress }: TagRowProps) {
  const colors = useColors();
  const styles = useStyles();
  const meta = [plural(songCount, 'song'), childCount > 0 ? plural(childCount, 'subtag') : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${meta}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.tile, { backgroundColor: `${colors.tag(color)}38` }]}>
        <Ionicons name="folder" size={iconSize.md} color={colors.tag(color)} />
      </View>
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textFaint} />
    </Pressable>
  );
}

export interface NewTagRowProps {
  onPress: () => void;
  /** Dimmed and untappable, keeping its place (while selecting songs). */
  disabled?: boolean;
  onLayout?: (e: LayoutChangeEvent) => void;
}

/**
 * "New tag" as the next folder in line: an empty slot after the tags, so making
 * another sits right where it'll appear, even with only one tag above it.
 */
export function NewTagRow({ onPress, disabled = false, onLayout }: NewTagRowProps) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="New tag"
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <View style={[styles.tile, styles.slot]}>
        <Ionicons name="add" size={iconSize.md} color={colors.textDim} />
      </View>
      <Text style={[styles.name, styles.newLabel]}>New tag</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  row: {
    height: TAG_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: artworkRadius(TILE),
    alignItems: 'center',
    justifyContent: 'center',
  },
  // An empty folder's outline.
  slot: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  disabled: {
    opacity: 0.4,
  },
  text: {
    flex: 1,
  },
  name: {
    ...font.name,
    color: colors.text,
  },
  newLabel: {
    color: colors.textDim,
  },
  meta: {
    ...font.caption,
    color: colors.textDim,
  },
}));
