import { useNavigation, usePreventRemove } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

/**
 * For screens whose changes are staged and applied by a Save button: `save`
 * applies them (via `apply`) and leaves; leaving any other way with unsaved
 * changes asks "Discard changes?" first.
 *
 * Saving or discarding sets `leaving`, which lifts the guard; the effect then
 * goes back once it's down. An action the guard blocked is re-run, not forgotten.
 */
export function useStagedSave(dirty: boolean, apply: () => Promise<void>) {
  const navigation = useNavigation();
  const [leaving, setLeaving] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Re-runs the navigation the guard blocked, once the guard is down. */
  const repeatBlocked = useRef<(() => void) | null>(null);

  usePreventRemove(dirty && !leaving, ({ repeat }) => {
    Alert.alert('Discard changes?', "Your changes haven't been saved.", [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          repeatBlocked.current = repeat;
          setLeaving(true);
        },
      },
    ]);
  });

  // Exactly once, and from this screen's own navigation. The effect can run
  // again after the screen leaves its stack (its `navigation` is replaced),
  // and a second "back" popped the screen underneath mid-animation, which
  // crashed react-native-screens ("ScreenStackFragment added into a non-stack
  // container") on every save.
  const left = useRef(false);
  useEffect(() => {
    if (!leaving || left.current) return;
    left.current = true;
    if (repeatBlocked.current) repeatBlocked.current();
    else navigation.goBack();
  }, [leaving, navigation]);

  const save = async () => {
    if (saving) return;
    if (!dirty) {
      setLeaving(true);
      return;
    }
    setSaving(true);
    try {
      await apply();
      setLeaving(true);
    } catch (error) {
      setSaving(false);
      Alert.alert("Couldn't save your changes", String(error));
    }
  };

  return { save, saving };
}
