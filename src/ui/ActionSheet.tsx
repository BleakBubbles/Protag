import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { BottomSheet } from './BottomSheet';
import { colors, font, spacing, touchTarget } from './theme';

export interface SheetAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  /** Shown but not selectable, e.g. the current parent in a "move to" list. */
  disabled?: boolean;
}

export interface ActionSheetProps {
  visible: boolean;
  title?: string;
  actions: readonly SheetAction[];
  onClose: () => void;
}

/**
 * Bottom sheet of choices. Exists because Android's Alert allows at most three
 * buttons, and a list like "move to…" can be arbitrarily long. Scrolls when it
 * needs to. Every action closes the sheet before running.
 */
export function ActionSheet({ visible, title, actions, onClose }: ActionSheetProps) {
  return (
    <BottomSheet visible={visible} title={title} onClose={onClose}>
      <ScrollView style={styles.list} bounces={false}>
        {actions.map((action) => (
          <Pressable
            key={action.label}
            disabled={action.disabled}
            onPress={() => {
              onClose();
              action.onPress();
            }}
            accessibilityRole="button"
            accessibilityState={{ disabled: action.disabled }}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Text
              style={[
                styles.label,
                action.destructive && styles.destructive,
                action.disabled && styles.disabled,
              ]}
              numberOfLines={1}
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        style={({ pressed }) => [styles.action, styles.cancel, pressed && styles.pressed]}
      >
        <Text style={styles.label}>Cancel</Text>
      </Pressable>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: {
    flexGrow: 0,
  },
  action: {
    minHeight: touchTarget + 4,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  pressed: {
    backgroundColor: colors.surfaceAlt,
  },
  cancel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.xs,
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
