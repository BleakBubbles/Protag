import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { BackHandler } from 'react-native';

import { plural } from '../format';
import { IconButton } from '../IconButton';
import { HeaderTitle } from '../stackOptions';
import { useColors } from '../ThemeContext';

/**
 * Selection mode for a list (hold a row to start): which items are picked, and
 * the header to show while picking. Songs (`useSongSelection`) and tags each
 * build on it with their own actions.
 *
 * - Hold starts selecting; then taps toggle. Sliding on from the hold picks
 *   every row passed over (`useDragSelect`). Only the header's close button or
 *   back leaves selection mode: deselecting everything keeps it, so the next
 *   pick is still one tap.
 * - `ids` is the list as shown, in order; items that leave it drop out of the
 *   selection.
 */
export function useSelection(ids: readonly number[] | undefined, noun: string) {
  const colors = useColors();
  const [selection, setSelection] = useState<ReadonlySet<number> | null>(null);
  const selecting = selection !== null;

  const toggle = useCallback(
    (id: number) =>
      setSelection((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    []
  );
  const clear = useCallback(() => setSelection(null), []);
  /** Sets the whole selection at once (a drag across rows), starting selection mode if it isn't on. */
  const replace = useCallback((next: ReadonlySet<number>) => setSelection(next), []);

  useFocusEffect(
    useCallback(() => {
      if (!selecting) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setSelection(null);
        return true;
      });
      return () => sub.remove();
    }, [selecting])
  );

  const selected = useMemo(() => (selection && ids ? ids.filter((id) => selection.has(id)) : []), [selection, ids]);
  const allSelected = selected.length > 0 && selected.length === (ids?.length ?? 0);

  /** Header options while selecting: a count, close on the left, select-all on the right. */
  const header = {
    title: selected.length > 0 ? `${plural(selected.length, noun)} selected` : `Select ${noun}s`,
    headerTitle: HeaderTitle,
    headerLeft: () => <IconButton icon="close" label="Stop selecting" onPress={clear} />,
    // A circle like the rows' own: empty while anything is unselected, filled
    // once everything is.
    headerRight: () =>
      allSelected ? (
        <IconButton
          icon="checkmark-circle"
          label="Deselect all"
          color={colors.accentFg}
          onPress={() => setSelection(new Set())}
        />
      ) : (
        <IconButton icon="ellipse-outline" label="Select all" onPress={() => setSelection(new Set(ids))} />
      ),
  };

  return { selection, selecting, selected, toggle, replace, clear, header };
}

export type Selection = ReturnType<typeof useSelection>;
