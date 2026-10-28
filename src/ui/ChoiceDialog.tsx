import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Button } from './Button';
import type { MenuAction } from './PopupMenu';
import { font, radius, spacing, touchTarget } from './theme';
import { makeStyles } from './ThemeContext';

export interface ChoiceDialogProps {
  visible: boolean;
  title: string;
  choices: readonly MenuAction[];
  onClose: () => void;
}

/**
 * Pick one from a list that can be long (every tag, for "move to…"): a
 * dialog like the rename one, its list scrolling inside. Picking closes it.
 */
export function ChoiceDialog({ visible, title, choices, onClose }: ChoiceDialogProps) {
  const styles = useStyles();
  const screen = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cancel" />
      <View style={styles.positioner} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <ScrollView style={{ maxHeight: screen.height * 0.5 }} bounces={false}>
            {choices.map((choice) => (
              <Pressable
                key={choice.label}
                disabled={choice.disabled}
                onPress={() => {
                  onClose();
                  choice.onPress();
                }}
                accessibilityRole="button"
                accessibilityState={{ disabled: choice.disabled }}
                style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
              >
                <Text style={[styles.label, choice.disabled && styles.disabled]} numberOfLines={1}>
                  {choice.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.buttons}>
            <Button label="Cancel" variant="secondary" onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  positioner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xl,
    gap: spacing.md,
  },
  title: {
    ...font.heading,
    color: colors.text,
    paddingHorizontal: spacing.xl,
  },
  choice: {
    minHeight: touchTarget + 4,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  pressed: {
    backgroundColor: colors.surfaceAlt,
  },
  label: {
    ...font.body,
    color: colors.text,
  },
  disabled: {
    color: colors.textFaint,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.xl,
  },
}));
