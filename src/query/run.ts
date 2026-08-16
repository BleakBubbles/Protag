import type { SQLiteDatabase } from 'expo-sqlite';

import { buildDescendantMap } from '@/db/tags';
import type { SongRow } from '@/db/types';

import { compileCountSelect, compileSongSelect, type DescendantMap, type SongOrder } from './compile';
import type { TagQuery } from './types';

/**
 * Callers that run several queries in a row (the builder's live count, a shuffle)
 * should build the map once and pass it in; it only changes when the tag tree does.
 */
export async function findSongs(
  db: SQLiteDatabase,
  query: TagQuery,
  options: { order?: SongOrder; limit?: number; descendants?: DescendantMap } = {}
): Promise<SongRow[]> {
  const descendants = options.descendants ?? (await buildDescendantMap(db));
  const { sql, params } = compileSongSelect(query, descendants, {
    order: options.order,
    limit: options.limit,
  });
  return db.getAllAsync<SongRow>(sql, ...params);
}

export async function countMatching(
  db: SQLiteDatabase,
  query: TagQuery,
  descendants?: DescendantMap
): Promise<number> {
  const map = descendants ?? (await buildDescendantMap(db));
  const { sql, params } = compileCountSelect(query, map);
  const row = await db.getFirstAsync<{ n: number }>(sql, ...params);
  return row?.n ?? 0;
}

/** Song ids only — what the player queue actually stores. */
export async function findSongIds(
  db: SQLiteDatabase,
  query: TagQuery,
  options: { order?: SongOrder; limit?: number; descendants?: DescendantMap } = {}
): Promise<number[]> {
  const songs = await findSongs(db, query, options);
  return songs.map((s) => s.id);
}
