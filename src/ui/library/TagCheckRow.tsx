import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TagMark } from '../../library/bulkTags';
import { font, iconSize, radius, spacing } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';

export const TAG_CHECK_ROW_HEIGHT = 56;
const BOX = 22;

const MARK_LABEL: Record<TagMark, string> = {
  all: 'on all selected songs',
  some: 'on some selected songs',
  none: 'on none of the selected songs',
};

export interface TagCheckRowProps {
  id: number;
  label: string;
  /** The tag's stored colour name. */
  color: string | null;
  mark: TagMark;
  /** Short note on the right, e.g. "2 of 3" or "new". */
  note?: string;
  onPress: (id: number) => void;
}

/**
 * A tag with a tri-state checkbox, for editing several songs' tags at once:
 * checked (every song has it), a minus (some do), or empty (none do). The
 * whole row is the target.
 */
export const TagCheckRow = memo(function TagCheckRow({ id, label, color, mark, note, onPress }: TagCheckRowProps) {
  const colors = useColors();
  const styles = useStyles();
  const on = mark !== 'none';
  return (
    <Pressable
      onPress={() => onPress(id)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: mark === 'some' ? 'mixed' : mark === 'all' }}
      accessibilityLabel={`${label}, ${MARK_LABEL[mark]}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.box, on && styles.boxOn]}>
        {on && <Ionicons name={mark === 'all' ? 'checkmark' : 'remove'} size={iconSize.sm - 4} color={colors.bg} />}
      </View>
      <View style={[styles.dot, { backgroundColor: colors.tag(color) }]} />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </Pressable>
  );
});

const useStyles = makeStyles((colors) => StyleSheet.create({
  row: {
    height: TAG_CHECK_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.textFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: {
    backgroundColor: colors.accentFg,
    borderColor: colors.accentFg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    ...font.name,
    color: colors.text,
    flex: 1,
  },
  note: {
    ...font.caption,
    color: colors.textDim,
  },
}));
