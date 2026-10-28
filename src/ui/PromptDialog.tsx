import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';

import { Button } from './Button';
import { font, radius, spacing, touchTarget } from './theme';
import { makeStyles, useColors } from './ThemeContext';

export interface PromptDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  /**
   * Runs the action. Throw to keep the dialog open and show the error's message
   * — e.g. a duplicate tag name — so the user can fix it without retyping.
   */
  onSubmit: (value: string) => Promise<void>;
  onClose: () => void;
}

/**
 * Why the keyboard needs a delay: an Android Modal is its own window, and the
 * keyboard only opens for a field in a window that has finished taking focus.
 * Neither `autoFocus` nor focusing in `onShow` waits for that (tested: no
 * keyboard), so focus is requested a moment later. A well-known React Native
 * quirk; if it ever proves flaky, draw the dialog inside the app's own window
 * instead of a Modal and `autoFocus` works as-is.
 */
const KEYBOARD_DELAY_MS = 100;

/** Text-input dialog. React Native's `Alert.prompt` is iOS-only, hence this. */
export function PromptDialog({
  visible,
  title,
  message,
  initialValue = '',
  placeholder,
  confirmLabel = 'Save',
  onSubmit,
  onClose,
}: PromptDialogProps) {
  const colors = useColors();
  const styles = useStyles();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<TextInputInstance>(null);

  // Reset each time it opens.
  useEffect(() => {
    if (visible) {
      setValue(initialValue);
      setError(null);
    }
  }, [visible, initialValue]);

  const submit = async () => {
    if (busy || !value.trim()) return;
    setBusy(true);
    try {
      await onSubmit(value);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onShow={() => {
        setTimeout(() => inputRef.current?.focus(), KEYBOARD_DELAY_MS);
      }}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cancel" />
      {/* Sits in the upper part of the screen so the keyboard never covers it. */}
      <View style={styles.positioner} pointerEvents="box-none">
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <TextInput
            ref={inputRef}
            value={value}
            onChangeText={(text) => {
              setValue(text);
              setError(null);
            }}
            placeholder={placeholder}
            placeholderTextColor={colors.textFaint}
            selectionColor={colors.accentFg}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={submit}
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.buttons}>
            <Button label="Cancel" variant="secondary" onPress={onClose} />
            <Button label={confirmLabel} onPress={submit} disabled={busy || !value.trim()} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  positioner: {
    flex: 1,
    paddingTop: '20%',
    paddingHorizontal: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    ...font.heading,
    color: colors.text,
  },
  message: {
    ...font.body,
    color: colors.textDim,
  },
  input: {
    ...font.body,
    color: colors.text,
    minHeight: touchTarget,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  error: {
    ...font.label,
    color: colors.danger,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
}));
