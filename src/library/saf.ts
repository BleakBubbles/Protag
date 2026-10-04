import { readAsStringAsync, StorageAccessFramework } from 'expo-file-system/legacy';

import { documentName, isPlaylistFile } from './m3u';

/**
 * Ask the user to pick a folder via Android's Storage Access Framework.
 *
 * Playlist files aren't audio, so MediaStore never surfaces them — SAF is the
 * only way to reach them without an all-files permission Google Play restricts.
 */
export async function pickFolder(initialUri?: string | null): Promise<string | null> {
  const result = await StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri ?? null);
  return result.granted ? result.directoryUri : null;
}

// Anything that looks like `name.ext` is treated as a file and not descended
// into. This keeps a walk through a music folder from making one IPC call per
// track. Folders named like "AC.DC" get skipped too, but playlists rarely live
// inside album folders.
const LOOKS_LIKE_FILE = /\.[a-z0-9]{2,5}$/i;

/**
 * Find `.m3u`/`.m3u8` files under a SAF folder, breadth-first.
 *
 * Bounded in depth and in folders visited, because a large library can have
 * thousands of folders and this runs while the user waits.
 */
export async function findPlaylistFiles(
  rootUri: string,
  { maxDepth = 4, maxFolders = 300 }: { maxDepth?: number; maxFolders?: number } = {}
): Promise<string[]> {
  const found: string[] = [];
  let queue: string[] = [rootUri];
  let visited = 0;

  for (let depth = 0; depth <= maxDepth && queue.length > 0; depth++) {
    const next: string[] = [];
    for (const dir of queue) {
      if (visited++ >= maxFolders) return found;

      let children: string[];
      try {
        children = await StorageAccessFramework.readDirectoryAsync(dir);
      } catch (error) {
        // Losing access to the root (e.g. a remembered folder whose permission
        // was revoked) must surface so the caller can re-prompt; reporting "no
        // playlists found" would be a lie. A failing subfolder is just skipped.
        if (dir === rootUri) throw error;
        continue;
      }

      for (const child of children) {
        const name = documentName(child);
        if (isPlaylistFile(name)) found.push(child);
        else if (!LOOKS_LIKE_FILE.test(name)) next.push(child);
      }
    }
    queue = next;
  }
  return found;
}

export async function readTextFile(uri: string): Promise<string> {
  return readAsStringAsync(uri);
}
