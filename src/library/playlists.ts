import type { SQLiteDatabase } from 'expo-sqlite';

import { createTag } from '../db/tags';
import type { ParsedPlaylist } from './m3u';
import type { SongMatcher } from './match';

export interface PlaylistImportResult {
  name: string;
  /** Null when nothing matched, in which case no tag is created. */
  tagId: number | null;
  createdTag: boolean;
  matched: number;
  unmatched: number;
  /** Links actually added — lower than `matched` when re-importing. */
  added: number;
}

/**
 * Turn one parsed playlist into a root tag applied to its matched songs.
 *
 * - An existing root tag with the same name (case-insensitive) is reused, so
 *   re-importing is idempotent and a playlist merges into a tag you already made.
 * - A playlist where nothing matched creates no tag. An empty tag named after a
 *   playlist would just be clutter the user has to delete.
 */
export async function importPlaylistAsTag(
  db: SQLiteDatabase,
  playlist: ParsedPlaylist,
  matcher: SongMatcher
): Promise<PlaylistImportResult> {
  const name = playlist.name.trim() || 'Imported playlist';
  const { matched, unmatched } = matcher.matchAll(playlist.entries);

  const result: PlaylistImportResult = {
    name,
    tagId: null,
    createdTag: false,
    matched: matched.length,
    unmatched: unmatched.length,
    added: 0,
  };
  if (matched.length === 0) return result;

  await db.withExclusiveTransactionAsync(async (txn) => {
    const existing = await txn.getFirstAsync<{ id: number }>(
      'SELECT id FROM tags WHERE parent_id IS NULL AND name = ? COLLATE NOCASE',
      name
    );
    const tagId = existing?.id ?? (await createTag(txn, name, null));
    result.tagId = tagId;
    result.createdTag = !existing;

    const now = Date.now();
    for (const songId of matched) {
      const insert = await txn.runAsync(
        'INSERT OR IGNORE INTO song_tags (song_id, tag_id, added_at) VALUES (?, ?, ?)',
        songId,
        tagId,
        now
      );
      result.added += insert.changes;
    }
  });

  return result;
}
