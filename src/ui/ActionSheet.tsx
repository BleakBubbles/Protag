import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font, radius, spacing, touchTarget } from './theme';

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
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.sm }]}>
        {title ? <Text style={styles.title}>{title}</Text> : null}
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.sm,
    maxHeight: '70%',
  },
  title: {
    ...font.caption,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
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
