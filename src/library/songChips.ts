import type { SQLiteDatabase } from 'expo-sqlite';

import { getTagsForSong, listAllSongTags, listTags } from '../db/tags';
import type { TagRow } from '../db/types';
import { buildTagIndex, type TagIndex } from './tagTree';

/** One of a song's tags as its chip shows it: the tag, after the names that place it ("kpop" before "gen 4"). */
export interface SongChip {
  tag: TagRow;
  /** Names before the tag's own, top first; empty for a top-level tag. */
  prefix: string[];
}

/**
 * How a song's tags read on its chips. A subtag means something only inside
 * its parent ("gen 4" is kpop's gen 4), so it carries the names above it:
 *
 * - The top of the chain always shows, and the tag itself.
 * - Subtags in between show only if some song is tagged with them directly; one
 *   that holds no songs of its own is there to organise, and is skipped.
 * - A tag another of the song's tags sits under is dropped: "kpop › gen 4" says kpop.
 * - On a tag's page (`context`), that tag and what's above it are a given: they
 *   don't show, and a chain starts below them ("gen 4" on kpop's page).
 *
 * Sorted by how they read. `held`: ids of tags some song is tagged with directly.
 */
export function chipsFor(
  direct: readonly TagRow[],
  index: TagIndex,
  held: ReadonlySet<number>,
  context: number | null = null
): SongChip[] {
  const paths = direct.map((tag) => index.path(tag.id)).filter((path) => path.length > 0);
  const contextPath = context === null ? [] : index.path(context).map((t) => t.id);

  const chips: SongChip[] = [];
  for (const path of paths) {
    const tag = path[path.length - 1];
    // Under another of the song's tags, or the page itself (or above it).
    if (paths.some((other) => other !== path && other.length > path.length && other[path.length - 1].id === tag.id)) continue;
    if (contextPath.includes(tag.id)) continue;

    // Below the page's tag, the chain starts under it.
    const at = context === null ? -1 : path.findIndex((t) => t.id === context);
    const chain = path.slice(at + 1);
    const prefix = chain.slice(0, -1).filter((t, i) => i === 0 || held.has(t.id));
    chips.push({ tag, prefix: prefix.map((t) => t.name) });
  }
  const reads = (chip: SongChip) => [...chip.prefix, chip.tag.name].join(' ');
  return chips.sort((a, b) => reads(a).localeCompare(reads(b), undefined, { sensitivity: 'base' }));
}

/** Every song's chips, for a list of songs; `context` is the tag whose page it is. */
export async function listSongChips(db: SQLiteDatabase, context: number | null = null): Promise<Map<number, SongChip[]>> {
  const [tags, songTags] = await Promise.all([listTags(db), listAllSongTags(db)]);
  const index = buildTagIndex(tags);
  const held = new Set<number>();
  for (const applied of songTags.values()) for (const tag of applied) held.add(tag.id);
  const chips = new Map<number, SongChip[]>();
  for (const [songId, applied] of songTags) chips.set(songId, chipsFor(applied, index, held, context));
  return chips;
}

/** One song's chips (the player). */
export async function getSongChips(db: SQLiteDatabase, songId: number): Promise<SongChip[]> {
  const [tags, direct, held] = await Promise.all([
    listTags(db),
    getTagsForSong(db, songId),
    db.getAllAsync<{ tag_id: number }>(
      'SELECT DISTINCT st.tag_id FROM song_tags st JOIN songs s ON s.id = st.song_id AND s.is_missing = 0'
    ),
  ]);
  return chipsFor(direct, buildTagIndex(tags), new Set(held.map((r) => r.tag_id)));
}
