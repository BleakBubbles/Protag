import { router, useNavigation } from 'expo-router';
// SDK 58: usePreventRemove moves to `expo-router` itself, with a `repeat()` callback (see NOTES.md, task 5b).
import { usePreventRemove, type NavigationAction } from 'expo-router/react-navigation';
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
  const blockedAction = useRef<NavigationAction | null>(null);

  usePreventRemove(dirty && !leaving, ({ data }) => {
    Alert.alert('Discard changes?', "Your changes haven't been saved.", [
      { text: 'Keep editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          blockedAction.current = data.action;
          setLeaving(true);
        },
      },
    ]);
  });

  useEffect(() => {
    if (!leaving) return;
    if (blockedAction.current) navigation.dispatch(blockedAction.current);
    else router.back();
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
