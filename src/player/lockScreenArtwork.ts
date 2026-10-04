import { cacheDirectory, copyAsync, getInfoAsync, makeDirectoryAsync } from 'expo-file-system/legacy';

import { artworkCacheKey, isNativeLoadableUrl } from './artworkUrls';

const DIR = cacheDirectory ? `${cacheDirectory}lockscreen-artwork/` : null;

/** One resolution per album per session — including "this album has no art". */
const resolved = new Map<string, Promise<string | null>>();
let dirReady: Promise<void> | null = null;

/**
 * A `file://` copy of a song's album art that the lock screen can load.
 *
 * MediaStore hands out album art as `content://` URIs, which expo-audio can't
 * load (see artworkUrls.ts), so the image is copied into the cache once per
 * album. Resolves to null when there's no art or anything goes wrong — artwork
 * is decoration and must never affect playback.
 */
export function lockScreenArtwork(uri: string | null): Promise<string | null> {
  if (!uri) return Promise.resolve(null);
  if (isNativeLoadableUrl(uri)) return Promise.resolve(uri);

  const key = artworkCacheKey(uri);
  if (!key || !DIR) return Promise.resolve(null);

  let result = resolved.get(key);
  if (!result) {
    result = copyToCache(uri, `${DIR}${key}.img`);
    resolved.set(key, result);
  }
  return result;
}

async function copyToCache(from: string, to: string): Promise<string | null> {
  try {
    if (!(await getInfoAsync(to)).exists) {
      dirReady ??= makeDirectoryAsync(DIR!, { intermediates: true }).catch(() => {});
      await dirReady;
      await copyAsync({ from, to });
    }
    return to;
  } catch {
    // Most often: the album simply has no artwork, so the content URI is empty.
    return null;
  }
}
