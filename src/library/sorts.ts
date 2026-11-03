import { TAG_COLORS } from '../db/tagColors';

/**
 * How the Play tab orders each section. Tapping a section's sort label
 * moves to the next order; the choice is remembered between sessions.
 */

export type TagSort = 'name' | 'played' | 'custom';
export type MusicSort = 'played' | 'name' | 'added';
/**
 * The tag editor's order: "used" is by song count, "color" puts each colour on
 * lines of its own, "family" gives each tag with subtags a section of its own.
 */
export type EditorSort = 'custom' | 'name' | 'used' | 'color' | 'family';

export interface ShuffleSorts {
  tags: TagSort;
  artists: MusicSort;
  albums: MusicSort;
}

/** Tags read best alphabetically; artists and albums lead with what's listened to. */
export const DEFAULT_SORTS: ShuffleSorts = { tags: 'name', artists: 'played', albums: 'played' };

export const SORT_LABEL: Record<TagSort | MusicSort | EditorSort, string> = {
  name: 'A–Z',
  played: 'Most played',
  added: 'Recently added',
  custom: 'Your order',
  used: 'Most used',
  color: 'Colour',
  family: 'Family',
};

const TAG_SORTS: readonly TagSort[] = ['name', 'played', 'custom'];
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

/**
 * A copy of `tags` in `sort` order; `plays` by tag id (missing means never
 * played). "Your order" is the one arranged in the Library (`sort_order`;
 * never-arranged tags, all 0, fall back to A–Z).
 */
export function sortTags<T extends { id: number; name: string; song_count: number; sort_order: number }>(
  tags: readonly T[],
  sort: TagSort,
  plays: ReadonlyMap<number, number>
): T[] {
  return [...tags].sort((a, b) =>
    sort === 'played'
      ? (plays.get(b.id) ?? 0) - (plays.get(a.id) ?? 0) || b.song_count - a.song_count || byName(a.name, b.name)
      : sort === 'custom'
        ? a.sort_order - b.sort_order || byName(a.name, b.name)
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

const EDITOR_SORTS: readonly EditorSort[] = ['custom', 'name', 'used', 'color', 'family'];
export const nextEditorSort = (sort: EditorSort) => after(EDITOR_SORTS, sort);
export const parseEditorSort = (value: string | null): EditorSort =>
  EDITOR_SORTS.includes(value as EditorSort) ? (value as EditorSort) : 'custom';

/** Where a colour sits in the picker's palette; unknown colours (and none) last. */
const hue = (color: string | null) => {
  const at = (TAG_COLORS as readonly (string | null)[]).indexOf(color);
  return at < 0 ? TAG_COLORS.length : at;
};

/**
 * A copy of `tags` in the tag editor's `sort` order. Colour follows the
 * picker's palette, and within a colour, your order; Family is your order
 * (the sections are the editor's).
 */
export function sortEditorTags<T extends { name: string; song_count: number; sort_order: number; color: string | null }>(
  tags: readonly T[],
  sort: EditorSort
): T[] {
  return [...tags].sort(
    (a, b) =>
      (sort === 'used' ? b.song_count - a.song_count : sort === 'color' ? hue(a.color) - hue(b.color) : 0) ||
      (sort === 'name' ? 0 : a.sort_order - b.sort_order) ||
      byName(a.name, b.name)
  );
}

/** Tags in colour order, split where the colour changes: a run of chips per colour. */
export function colorGroups<T extends { name: string; song_count: number; sort_order: number; color: string | null }>(
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
