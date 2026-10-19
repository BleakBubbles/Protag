import { StyleSheet } from 'react-native';

import { Button } from './Button';
import { radius } from './theme';

export interface SaveButtonProps {
  /** There are changes to save: the pill fills. */
  dirty: boolean;
  saving: boolean;
  onPress: () => void;
}

/**
 * The header Save for screens with staged changes. Quiet (tonal) until there's
 * something to save, then filled. Only the fill changes, never the label or
 * size, so nothing shifts as you edit.
 */
export function SaveButton({ dirty, saving, onPress }: SaveButtonProps) {
  return (
    <Button
      label="Save"
      size="small"
      variant={dirty ? 'primary' : 'tonal'}
      onPress={onPress}
      disabled={saving}
      style={styles.pill}
    />
  );
}

const styles = StyleSheet.create({
  // A pill in both states, so switching between tonal and filled keeps its shape.
  pill: {
    borderRadius: radius.pill,
  },
});
