import { TAG_COLORS } from '../db/tagColors';

/**
 * How the Play tab orders each section. Tapping a section's sort label
 * moves to the next order; the choice is remembered between sessions.
 */

/** Tags, on the Play tab and in the Library alike. */
export type TagSort = 'name' | 'used' | 'played';
export type MusicSort = 'played' | 'name' | 'added';
/**
 * The tag editor's order: "used" is by song count, "color" puts each colour on
 * lines of its own, "family" gives each tag with subtags a section of its own.
 */
export type EditorSort = 'name' | 'used' | 'color' | 'family';
/** The Library's Songs list: by title, or kept together by artist or album. */
export type SongSort = 'name' | 'artist' | 'album' | 'added' | 'played';

export interface ShuffleSorts {
  tags: TagSort;
  artists: MusicSort;
  albums: MusicSort;
}

/** Tags read best alphabetically; artists and albums lead with what's listened to. */
export const DEFAULT_SORTS: ShuffleSorts = { tags: 'name', artists: 'played', albums: 'played' };

export const SORT_LABEL: Record<TagSort | MusicSort | EditorSort | SongSort, string> = {
  name: 'A–Z',
  artist: 'Artist',
  album: 'Album',
  played: 'Most played',
  added: 'Recently added',
  used: 'Most used',
  color: 'Colour',
  family: 'Family',
};

export const TAG_SORTS: readonly TagSort[] = ['name', 'used', 'played'];
const MUSIC_SORTS: readonly MusicSort[] = ['played', 'name', 'added'];
/** The Library's own lists, each starting (and by default sorted) A–Z as they always were. */
export const LIBRARY_MUSIC_SORTS: readonly MusicSort[] = ['name', 'played', 'added'];
export const SONG_SORTS: readonly SongSort[] = ['name', 'artist', 'album', 'added', 'played'];

const after = <T>(list: readonly T[], current: T) => list[(list.indexOf(current) + 1) % list.length];
export const nextTagSort = (sort: TagSort) => after(TAG_SORTS, sort);
export const nextMusicSort = (sort: MusicSort) => after(MUSIC_SORTS, sort);
/** The order after `current` in `list`. */
export const nextSort = after;
/** A stored choice from `list`; anything missing or unknown is the list's first. */
export const parseSort = <T>(value: string | null, list: readonly T[]): T =>
  list.includes(value as T) ? (value as T) : list[0];

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

/**
 * A copy of `tags` in `sort` order; `plays` by tag id (missing means never
 * played). "Most used" is by song count.
 */
export function sortTags<T extends { id: number; name: string; song_count: number }>(
  tags: readonly T[],
  sort: TagSort,
  plays: ReadonlyMap<number, number>
): T[] {
  return [...tags].sort((a, b) =>
    sort === 'played'
      ? (plays.get(b.id) ?? 0) - (plays.get(a.id) ?? 0) || b.song_count - a.song_count || byName(a.name, b.name)
      : sort === 'used'
        ? b.song_count - a.song_count || byName(a.name, b.name)
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

/** Unknowns (no artist, no album) go after everything named. */
const byMaybe = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : byName(a, b);

/**
 * A copy of `songs` in `sort` order. Artist and Album keep each album
 * together in track order, so playing from one runs through it as it was made.
 */
export function sortSongs<
  T extends {
    title: string;
    artist: string | null;
    album: string | null;
    album_id: string | null;
    track_no: number | null;
    added_at: number;
    play_count: number;
  },
>(songs: readonly T[], sort: SongSort): T[] {
  // Untracked songs after the numbered ones (Infinity - Infinity is NaN, so 0).
  const inAlbum = (a: T, b: T) =>
    byMaybe(a.album, b.album) ||
    byMaybe(a.album_id, b.album_id) ||
    (a.track_no ?? Infinity) - (b.track_no ?? Infinity) ||
    0;
  return [...songs].sort(
    (a, b) =>
      (sort === 'artist'
        ? byMaybe(a.artist, b.artist) || inAlbum(a, b)
        : sort === 'album'
          ? inAlbum(a, b)
          : sort === 'added'
            ? b.added_at - a.added_at
            : sort === 'played'
              ? b.play_count - a.play_count
              : 0) || byName(a.title, b.title)
  );
}

const EDITOR_SORTS: readonly EditorSort[] = ['name', 'used', 'color', 'family'];
export const nextEditorSort = (sort: EditorSort) => after(EDITOR_SORTS, sort);
export const parseEditorSort = (value: string | null): EditorSort =>
  EDITOR_SORTS.includes(value as EditorSort) ? (value as EditorSort) : 'name';

/** Where a colour sits in the picker's palette; unknown colours (and none) last. */
const hue = (color: string | null) => {
  const at = (TAG_COLORS as readonly (string | null)[]).indexOf(color);
  return at < 0 ? TAG_COLORS.length : at;
};

/**
 * A copy of `tags` in the tag editor's `sort` order. Colour follows the
 * picker's palette, and within a colour, A–Z; Family is A–Z (the sections are
 * the editor's).
 */
export function sortEditorTags<T extends { name: string; song_count: number; color: string | null }>(
  tags: readonly T[],
  sort: EditorSort
): T[] {
  return [...tags].sort(
    (a, b) =>
      (sort === 'used' ? b.song_count - a.song_count : sort === 'color' ? hue(a.color) - hue(b.color) : 0) ||
      byName(a.name, b.name)
  );
}

/** Tags in colour order, split where the colour changes: a run of chips per colour. */
export function colorGroups<T extends { name: string; song_count: number; color: string | null }>(
  tags: readonly T[]
): T[][] {
  const groups: T[][] = [];
  for (const tag of sortEditorTags(tags, 'color')) {
    const last = groups.at(-1);
    if (last && hue(last[0].color) === hue(tag.color)) last.push(tag);
    else groups.push([tag]);
  }
  return groups;
}
