import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Popover, type Rect } from './Popover';
import { colors, font, radius, spacing, touchTarget } from './theme';

export interface MenuAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  /** Shown but not selectable, e.g. the current parent in a "move to" list. */
  disabled?: boolean;
}

export interface PopupMenuProps {
  /** What opened it (a ⋯, a card, a pill); null while closed. See `useAnchor`. */
  anchor: Rect | null;
  actions: readonly MenuAction[];
  onClose: () => void;
}

const WIDTH = 220;

/**
 * A short list of actions dropping from whatever opened it, like Android's
 * overflow menu. Every action closes the menu before running.
 */
export function PopupMenu({ anchor, actions, onClose }: PopupMenuProps) {
  return (
    <Popover anchor={anchor} onClose={onClose} width={WIDTH}>
      <View style={styles.menu} accessibilityRole="menu">
        {actions.map((action) => (
          <Pressable
            key={action.label}
            disabled={action.disabled}
            onPress={() => {
              onClose();
              action.onPress();
            }}
            accessibilityRole="menuitem"
            accessibilityState={{ disabled: action.disabled }}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
          >
            <Text
              style={[styles.label, action.destructive && styles.destructive, action.disabled && styles.disabled]}
              numberOfLines={1}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Popover>
  );
}

const styles = StyleSheet.create({
  // Clips the pressed highlight to the panel's corners.
  menu: {
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  item: {
    minHeight: touchTarget + 4,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  pressed: {
    backgroundColor: colors.border,
  },
  label: {
    ...font.body,
    color: colors.text,
  },
  destructive: {
    color: colors.danger,
  },
  disabled: {
    color: colors.textFaint,
  },
});
