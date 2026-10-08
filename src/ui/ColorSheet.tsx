import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { TAG_COLORS, type TagColor } from '@/db/tagColors';

import { BottomSheet } from './BottomSheet';
import { colors, iconSize, spacing, tagColors, touchTarget } from './theme';

export interface ColorSheetProps {
  visible: boolean;
  title?: string;
  /** The current colour, marked with a check. */
  selected: string | null | undefined;
  onSelect: (color: TagColor) => void;
  onClose: () => void;
}

/** Swatches for every tag colour. Picking one closes the sheet. */
export function ColorSheet({ visible, title, selected, onSelect, onClose }: ColorSheetProps) {
  return (
    <BottomSheet visible={visible} title={title} onClose={onClose}>
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
            style={({ pressed }) => [
              styles.swatch,
              { backgroundColor: tagColors[color] },
              pressed && styles.pressed,
            ]}
          >
            {color === selected && <Ionicons name="checkmark" size={iconSize.sm} color={colors.bg} />}
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  swatch: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
