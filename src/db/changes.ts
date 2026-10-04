import { useSyncExternalStore } from 'react';

/**
 * A version number bumped by every change to songs or tags.
 *
 * Screens that show library data subscribe to it and reload when it moves, so
 * an edit anywhere — tagging from the player, renaming a tag, an import —
 * refreshes everything on screen without the editor knowing who's displaying
 * what. Deliberately coarse: the library is small enough that reloading a view
 * is cheaper than tracking exactly which rows changed.
 */
let version = 0;
const listeners = new Set<() => void>();

/** Call after any write to songs, tags, or song_tags. */
export function notifyLibraryChanged(): void {
  version += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLibraryVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}
