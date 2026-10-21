/**
 * How the Shuffle tab orders each section. Tapping a section's sort label
 * moves to the next order; the choice is remembered between sessions.
 */

export type TagSort = 'name' | 'played';
export type MusicSort = 'played' | 'name' | 'added';

export interface ShuffleSorts {
  tags: TagSort;
  artists: MusicSort;
  albums: MusicSort;
}

/** Tags read best alphabetically; artists and albums lead with what's listened to. */
export const DEFAULT_SORTS: ShuffleSorts = { tags: 'name', artists: 'played', albums: 'played' };

export const SORT_LABEL: Record<TagSort | MusicSort, string> = {
  name: 'A–Z',
  played: 'Most played',
  added: 'Recently added',
};

const TAG_SORTS: readonly TagSort[] = ['name', 'played'];
const MUSIC_SORTS: readonly MusicSort[] = ['played', 'name', 'added'];

const after = <T>(list: readonly T[], current: T) => list[(list.indexOf(current) + 1) % list.length];
export const nextTagSort = (sort: TagSort) => after(TAG_SORTS, sort);
export const nextMusicSort = (sort: MusicSort) => after(MUSIC_SORTS, sort);

/** The stored JSON, with anything missing or unknown back at its default. */
export function parseSorts(json: string | null): ShuffleSorts {
  let stored: Partial<Record<keyof ShuffleSorts, unknown>> = {};
  try {
    stored = JSON.parse(json ?? '{}') ?? {};
  } catch {}
  const pick = <T>(value: unknown, allowed: readonly T[], fallback: T) =>
    allowed.includes(value as T) ? (value as T) : fallback;
  return {
    tags: pick(stored.tags, TAG_SORTS, DEFAULT_SORTS.tags),
    artists: pick(stored.artists, MUSIC_SORTS, DEFAULT_SORTS.artists),
    albums: pick(stored.albums, MUSIC_SORTS, DEFAULT_SORTS.albums),
  };
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** A copy of `tags` in `sort` order; `plays` by tag id (missing means never played). */
export function sortTags<T extends { id: number; name: string; song_count: number }>(
  tags: readonly T[],
  sort: TagSort,
  plays: ReadonlyMap<number, number>
): T[] {
  return [...tags].sort((a, b) =>
    sort === 'played'
      ? (plays.get(b.id) ?? 0) - (plays.get(a.id) ?? 0) || b.song_count - a.song_count || byName(a.name, b.name)
      : byName(a.name, b.name)
  );
}

/**
 * A copy of artists or albums in `sort` order. Ties in plays go to the one
 * with more songs, so a fresh library still leads with its biggest.
 */
export function sortMusic<T extends { plays: number; added: number; songs: number }>(
  items: readonly T[],
  sort: MusicSort,
  nameOf: (item: T) => string
): T[] {
  return [...items].sort(
    (a, b) =>
      (sort === 'played' ? b.plays - a.plays || b.songs - a.songs : sort === 'added' ? b.added - a.added : 0) ||
      byName(nameOf(a), nameOf(b))
  );
}
