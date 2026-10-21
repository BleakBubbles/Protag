/**
 * What a pot ingredient is made of: a tag, an artist or an album.
 *
 * A tag is its id, as it always was, so tag-only mixes and code read the same;
 * an artist or album is a prefixed string. Plain values, so `===` and
 * `includes` compare them, and drafts store as plain JSON.
 */
export type Ref = number | `artist:${string}` | `album:${string}`;

export const artistRef = (name: string): Ref => `artist:${name}`;
/** By Android's album id, which is only meaningful on this phone (backups carry names). */
export const albumRef = (albumId: string): Ref => `album:${albumId}`;

export type ReadRef =
  | { kind: 'tag'; tagId: number }
  | { kind: 'artist'; name: string }
  | { kind: 'album'; albumId: string };

export function readRef(ref: Ref): ReadRef {
  if (typeof ref === 'number') return { kind: 'tag', tagId: ref };
  if (ref.startsWith('artist:')) return { kind: 'artist', name: ref.slice('artist:'.length) };
  return { kind: 'album', albumId: ref.slice('album:'.length) };
}

export const isTagRef = (ref: Ref): ref is number => typeof ref === 'number';

/** For reading stored drafts: a tag id, or a well-formed artist or album string. */
export function isRef(value: unknown): value is Ref {
  if (typeof value === 'number') return Number.isInteger(value);
  return typeof value === 'string' && /^(artist|album):./.test(value);
}
