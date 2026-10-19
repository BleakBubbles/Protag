import { router, useNavigation } from 'expo-router';
// SDK 58: usePreventRemove moves to `expo-router` itself, with a `repeat()` callback (see NOTES.md, task 5b).
import { usePreventRemove, type NavigationAction } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { notifyLibraryChanged } from '../../db/changes';

/**
 * For screens whose library changes are staged and applied by a Save button:
 * `save` applies them (via `apply`, which writes but doesn't notify) and
 * leaves; leaving any other way with unsaved changes asks "Discard changes?"
 * first.
 *
 * Saving or discarding sets `leaving`, which lifts the guard; the effect then
 * goes back once it's down. An action the guard blocked is re-run, not forgotten.
 *
 * The rest of the app hears about the change only once this screen is gone. A
 * screen still sliding out that reloads (it listens for library changes too)
 * re-renders its header, and react-native-screens crashes updating the header
 * of a screen already removed from its stack ("ScreenStackFragment added into a
 * non-stack container").
 */
export function useStagedSave(dirty: boolean, apply: () => Promise<void>) {
  const navigation = useNavigation();
  const [leaving, setLeaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const blockedAction = useRef<NavigationAction | null>(null);
  const saved = useRef(false);
  useEffect(
    () => () => {
      if (saved.current) notifyLibraryChanged();
    },
    []
  );

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
      saved.current = true;
      setLeaving(true);
    } catch (error) {
      setSaving(false);
      Alert.alert("Couldn't save your changes", String(error));
    }
  };

  return { save, saving };
}
