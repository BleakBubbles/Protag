import { useEffect, useRef } from 'react';
import { ToastAndroid } from 'react-native';

import { useLibraryVersion } from '../../db/changes';
import { openEditTags } from '../../navigation';
import { usePlayerActions } from '../../player/PlayerProvider';
import { plural } from '../format';
import type { SelectionAction } from '../library/SelectionBar';
import { useSelection } from './useSelection';

/**
 * Selecting songs (`useSelection`), and what can be done to them: opening the
 * tag editor for them, and queueing them. Used by every song list in the
 * Library: tag pages, "Not tagged yet", the Songs view, and album and artist
 * pages. Hold a song, then Tag…, is how songs are tagged from a list.
 *
 * - Add to queue (`queueActions`) queues the songs, say so in a
 *   toast, and end selection.
 * - The tag editor is its own screen. If it saves (the library changes while
 *   it's open), the job is done and selection ends; if it's discarded, the
 *   selection is still there to try again.
 */
export function useSongSelection(songIds: readonly number[] | undefined) {
  const base = useSelection(songIds, 'song');
  const { selected, clear } = base;

  const libraryVersion = useLibraryVersion();
  const versionAtEdit = useRef<number | null>(null);
  useEffect(() => {
    if (versionAtEdit.current !== null && libraryVersion !== versionAtEdit.current) {
      versionAtEdit.current = null;
      clear();
    }
  }, [libraryVersion, clear]);

  const editTags = () => {
    versionAtEdit.current = libraryVersion;
    openEditTags(selected);
  };

  const { queueSongs } = usePlayerActions();
  /** The bar's queueing actions, beside Tag…: in list order, whatever order they were picked in. */
  const queueActions: SelectionAction[] = [
    {
      label: 'Add to queue',
      icon: 'add-to-queue',
      onPress: () => {
        queueSongs(selected);
        ToastAndroid.show(`${selected.length === 1 ? 'Song' : plural(selected.length, 'song')} added to queue`, ToastAndroid.SHORT);
        clear();
      },
    },
  ];

  return { ...base, editTags, queueActions };
}

export type SongSelection = ReturnType<typeof useSongSelection>;
