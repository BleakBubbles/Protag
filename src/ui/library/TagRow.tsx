import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, type GestureResponderHandlers, type LayoutChangeEvent } from 'react-native';

import { plural } from '../format';
import { feelHold, HOLD_MS } from '../haptics';
import { useScaledHeight } from '../hooks/useScaledHeight';
import { Icon } from '../Icon';
import { artworkRadius } from '../player/Artwork';
import { font, iconSize, spacing, touchTarget } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';

/** Every tag row the same height, growing with the font size: 72 at normal size, the name and count lines (20 + 14) growing. */
export const useTagRowHeight = () => useScaledHeight(72, 34);
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
  /** Starts selecting tags (`TagList`). */
  onLongPress?: () => void;
  /**
   * Selecting tags: a check over the folder, as on a song's artwork, and a
   * handle (`handle`) to drag it to another place among its siblings.
   */
  selecting?: boolean;
  selected?: boolean;
  handle?: GestureResponderHandlers;
  /** TalkBack's way to move it: one place up (-1) or down (1). */
  onNudge?: (step: 1 | -1) => void;
  /** Dimmed and untappable, keeping its place (while selecting songs). */
  disabled?: boolean;
  /** Shown opened, its contents below it (the welcome's example): the arrow points down. */
  open?: boolean;
}

/**
 * A tag shown as a folder: tags hold songs the way folders hold files, a
 * pattern people already know. A folder icon on the tag's own colour.
 */
export function TagRow(props: TagRowProps) {
  const { name, color, songCount, childCount, onPress, onLongPress, selecting, selected, handle, onNudge, disabled, open } =
    props;
  const colors = useColors();
  const styles = useStyles();
  const height = useTagRowHeight();
  const meta = [plural(songCount, 'song'), childCount > 0 ? plural(childCount, 'subtag') : null]
    .filter(Boolean)
    .join(' · ');

  return (
    // As with songs, the selection colour is the feedback while selecting; no pressed highlight on top.
    <Pressable
      onPress={onPress}
      delayLongPress={HOLD_MS}
      onLongPress={
        onLongPress &&
        (() => {
          feelHold();
          onLongPress();
        })
      }
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={selecting ? `${selected ? 'Deselect' : 'Select'} ${name}` : `${name}, ${meta}`}
      accessibilityState={selecting ? { selected } : undefined}
      style={({ pressed }) => [
        styles.row,
        { height },
        selected ? styles.selected : pressed && !selecting && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.tile, { backgroundColor: `${colors.tag(color)}38` }]}>
        <Ionicons name="folder" size={iconSize.md} color={colors.tag(color)} />
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
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {selecting ? (
        // No handle in an order the tags can't be dragged in.
        handle && (
          <View
            {...handle}
            style={[styles.handle, { height }]}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={`Move ${name}`}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => onNudge?.(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
          >
            <Icon name="reorder-three" size={iconSize.sm} color={colors.textDim} />
          </View>
        )
      ) : (
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={iconSize.sm} color={colors.textFaint} />
      )}
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
  const height = useTagRowHeight();
  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="New tag"
      style={({ pressed }) => [styles.row, { height }, pressed && styles.pressed, disabled && styles.disabled]}
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
  // Over the folder: a dark veil with an empty ring, or the accent with a tick (as on a song's artwork).
  check: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: artworkRadius(TILE),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  checkOn: {
    backgroundColor: `${colors.accent}D9`,
  },
  // Takes the arrow's place, at the row's right edge.
  handle: {
    width: touchTarget,
    marginRight: -spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
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
