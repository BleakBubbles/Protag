import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { TAG_COLORS, type TagColor } from '@/db/tagColors';

import { Popover, type Rect } from './Popover';
import { iconSize, spacing } from './theme';
import { useColors } from './ThemeContext';

const SWATCH = 36;
const PER_ROW = 6;
const WIDTH = SWATCH * PER_ROW + spacing.sm * (PER_ROW - 1) + spacing.lg * 2;

export interface ColorPopoverProps {
  /** The colour dot it opened from; null while closed. See `useAnchor`. */
  anchor: Rect | null;
  /** The current colour, marked with a check. */
  selected: string | null | undefined;
  onSelect: (color: TagColor) => void;
  onClose: () => void;
}

/** Every tag colour as a swatch, pointing at the dot it changes. Picking one closes it. */
export function ColorPopover({ anchor, selected, onSelect, onClose }: ColorPopoverProps) {
  const colors = useColors();
  return (
    <Popover anchor={anchor} onClose={onClose} width={WIDTH} pointer>
      <View style={styles.grid}>
        {TAG_COLORS.map((color) => (
          <Pressable
            key={color}
            onPress={() => {
              onClose();
              onSelect(color);
            }}
            accessibilityRole="button"
            accessibilityLabel={color}
            accessibilityState={{ selected: color === selected }}
            hitSlop={spacing.sm / 2}
            style={({ pressed }) => [styles.swatch, { backgroundColor: colors.tag(color) }, pressed && styles.pressed]}
          >
            {color === selected && <Ionicons name="checkmark" size={iconSize.sm} color={colors.bg} />}
          </Pressable>
        ))}
      </View>
    </Popover>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  swatch: {
    width: SWATCH,
    height: SWATCH,
    borderRadius: SWATCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
