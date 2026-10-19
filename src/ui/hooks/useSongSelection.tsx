import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

import { useLibraryVersion } from '../../db/changes';
import { openEditTags } from '../../navigation';
import { plural } from '../format';
import { IconButton } from '../IconButton';
import { colors } from '../theme';

/**
 * Selection mode for a list of songs (long-press a row to start): which songs
 * are picked, the header to show while picking, and opening the tag editor for
 * them. Used by tag pages and the Library's "Not tagged yet" songs.
 *
 * - Long-press starts selecting; then taps toggle. Only the header's close
 *   button or back leaves selection mode: deselecting everything keeps it, so
 *   the next pick is still one tap.
 * - The tag editor is its own screen. If it saves (the library changes while
 *   it's open), the job is done and selection ends; if it's discarded, the
 *   selection is still there to try again.
 *
 * `songIds` is the list as shown; songs that leave it (retagged elsewhere)
 * drop out of the selection.
 */
export function useSongSelection(songIds: readonly number[] | undefined) {
  const [selection, setSelection] = useState<ReadonlySet<number> | null>(null);
  const selecting = selection !== null;

  const libraryVersion = useLibraryVersion();
  const versionAtEdit = useRef<number | null>(null);
  useEffect(() => {
    if (versionAtEdit.current !== null && libraryVersion !== versionAtEdit.current) {
      versionAtEdit.current = null;
      setSelection(null);
    }
  }, [libraryVersion]);

  const toggle = useCallback(
    (songId: number) =>
      setSelection((prev) => {
        const next = new Set(prev);
        if (next.has(songId)) next.delete(songId);
        else next.add(songId);
        return next;
      }),
    []
  );
  const clear = useCallback(() => setSelection(null), []);

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

  const selected = useMemo(
    () => (selection && songIds ? songIds.filter((id) => selection.has(id)) : []),
    [selection, songIds]
  );
  const allSelected = selected.length > 0 && selected.length === (songIds?.length ?? 0);

  const editTags = () => {
    versionAtEdit.current = libraryVersion;
    openEditTags(selected);
  };

  /** Header options while selecting: a count, close on the left, select-all on the right. */
  const header = {
    title: selected.length > 0 ? `${plural(selected.length, 'song')} selected` : 'Select songs',
    headerTitle: undefined,
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
        <IconButton icon="ellipse-outline" label="Select all" onPress={() => setSelection(new Set(songIds))} />
      ),
  };

  return { selection, selecting, selected, toggle, clear, editTags, header };
}

export type SongSelection = ReturnType<typeof useSongSelection>;
