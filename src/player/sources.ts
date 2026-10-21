import type { SQLiteDatabase } from 'expo-sqlite';

import { listAlbumTitles } from '../db/albums';
import { buildDescendantMap, listTags } from '../db/tags';
import { describeQuery } from '../query/describe';
import { findSongIds } from '../query/run';
import type { TagQuery } from '../query/types';

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
