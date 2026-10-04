/**
 * Whether expo-audio's Android side can load an artwork URL for the lock screen.
 *
 * It parses `artworkUrl` with `java.net.URL` and loads it via `openConnection()`,
 * which handles http(s) and file but not `content://`. An unparseable URL doesn't
 * just lose the artwork — it rejects the *whole* lock-screen call, which also
 * kills background playback. So anything else must never be sent.
 */
export function isNativeLoadableUrl(url: string | null | undefined): url is string {
  return !!url && /^(https?|file):\/\//i.test(url);
}

/**
 * Stable, filesystem-safe cache key for an artwork URI — the album id for
 * MediaStore art. Null when there's no path to key on, rather than a shared
 * fallback that would make unrelated songs show each other's artwork.
 */
export function artworkCacheKey(uri: string): string | null {
  const path = uri.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').replace(/[?#].*$/, '');
  const last = path.split('/').filter(Boolean).pop() ?? '';
  const key = last.replace(/[^A-Za-z0-9_-]/g, '');
  return key || null;
}
