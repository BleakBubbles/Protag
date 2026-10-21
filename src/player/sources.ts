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
