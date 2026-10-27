import type { SQLiteDatabase } from 'expo-sqlite';

import { listAlbumTitles } from '../db/albums';
import { buildDescendantMap, listTags } from '../db/tags';
import { describeQuery } from '../query/describe';
import { findSongIds } from '../query/run';
import type { Ref } from '../query/refs';
import { isTuned, tuningOf } from '../query/tuning';
import { buildQuery, type QueryDraft, type TagQuery } from '../query/types';
import { fisherYates } from './queue';
import { weave, type Stream } from './weave';

/** Everything the player needs to start a queue: which songs, and how to describe them. */
export interface QueueRequest {
  ids: number[];
  label: string;
}

/**
 * Resolve a tag query into a queue request. This is the bridge between the
 * query engine and the player — every "shuffle X" in the app goes through here,
 * so the player's "Shuffling · …" line always reads the same as the query.
 */
export async function queueForQuery(db: SQLiteDatabase, query: TagQuery): Promise<QueueRequest> {
  const [descendants, tags, albums] = await Promise.all([buildDescendantMap(db), listTags(db), listAlbumTitles(db)]);
  const ids = await findSongIds(db, query, { descendants, order: 'title' });
  const label = describeQuery(query, new Map([...tags.map((t) => [t.id, t.name] as const), ...albums]));
  return { ids, label };
}

/** A mix's ingredient and the songs it brings to the shuffle. */
export interface Ingredient {
  refs: Ref[];
  ids: number[];
}

/**
 * Each ingredient's songs, exclusions applied. A song several ingredients
 * share counts once, for the smallest of them: it's the small ingredients a
 * listener tunes up, so they keep what's theirs.
 */
export async function ingredientSongs(db: SQLiteDatabase, draft: QueryDraft): Promise<Ingredient[]> {
  const descendants = await buildDescendantMap(db);
  const found = await Promise.all(
    draft.ingredients.map((refs) => findSongIds(db, buildQuery({ ...draft, ingredients: [refs] }), { descendants, order: 'title' }))
  );
  const bySize = found.map((ids, k) => k).sort((a, b) => found[a].length - found[b].length);
  const taken = new Set<number>();
  const ids: number[][] = found.map(() => []);
  for (const k of bySize) {
    for (const id of found[k]) {
      if (taken.has(id)) continue;
      taken.add(id);
      ids[k].push(id);
    }
  }
  return draft.ingredients.map((refs, k) => ({ refs, ids: ids[k] }));
}

/** The ingredients as the weave takes them, tuned as the draft says. */
export const streamsOf = (draft: QueryDraft, ingredients: readonly Ingredient[]): Stream[] =>
  ingredients.map(({ refs, ids }) => ({ ids, share: tuningOf(draft, refs).share }));

/** A mix's play order, optionally led by one song: woven if it's tuned, else a plain shuffle. */
export async function tunedOrder(
  db: SQLiteDatabase,
  draft: QueryDraft,
  { first = null, random = Math.random }: { first?: number | null; random?: () => number } = {}
): Promise<number[]> {
  const ingredients = await ingredientSongs(db, draft);
  if (isTuned(draft)) return weave(streamsOf(draft, ingredients), { first, random });
  const ids = ingredients.flatMap((i) => i.ids);
  const lead = first !== null && ids.includes(first) ? [first] : [];
  return [...lead, ...fisherYates(ids.filter((id) => !lead.includes(id)), random)];
}

/**
 * The songs grouped by album, each album in track order, for album shuffle.
 * A song without an album stands alone, so it's shuffled in among the albums.
 */
export async function albumGroups(db: SQLiteDatabase, ids: readonly number[]): Promise<number[][]> {
  const rows = await db.getAllAsync<{ id: number; album_id: string | null }>(
    `SELECT id, album_id FROM songs WHERE id IN (SELECT value FROM json_each(?))
     ORDER BY album_id, track_no IS NULL, track_no, title COLLATE NOCASE`,
    JSON.stringify(ids)
  );
  const albums = new Map<string, number[]>();
  const singles: number[][] = [];
  for (const { id, album_id } of rows) {
    if (album_id === null) singles.push([id]);
    else albums.set(album_id, [...(albums.get(album_id) ?? []), id]);
  }
  return [...albums.values(), ...singles];
}
