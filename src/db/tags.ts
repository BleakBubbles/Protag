import type { SQLiteDatabase } from 'expo-sqlite';

import { nextTagColor, type TagColor } from './tagColors';
import type { SongRow, TagRow, TagWithCounts } from './types';

/** Thrown for tag operations the user could plausibly trigger, so callers can show the message. */
export class TagError extends Error {}

export async function listTags(db: SQLiteDatabase): Promise<TagRow[]> {
  return db.getAllAsync<TagRow>('SELECT * FROM tags ORDER BY sort_order, name COLLATE NOCASE');
}

export async function getTag(db: SQLiteDatabase, id: number): Promise<TagRow | null> {
  return db.getFirstAsync<TagRow>('SELECT * FROM tags WHERE id = ?', id);
}

const TAGS_WITH_COUNTS = `
    WITH RECURSIVE sub(root, id) AS (
      SELECT id, id FROM tags
      UNION ALL
      SELECT sub.root, t.id FROM tags t JOIN sub ON t.parent_id = sub.id
    )
    SELECT
      t.*,
      (
        SELECT COUNT(DISTINCT st.song_id)
        FROM song_tags st
        JOIN songs s ON s.id = st.song_id AND s.is_missing = 0
        WHERE st.tag_id IN (SELECT id FROM sub WHERE sub.root = t.id)
      ) AS song_count,
      (SELECT COUNT(*) FROM tags c WHERE c.parent_id = t.id) AS child_count
    FROM tags t`;

/**
 * Children of `parentId` (or root tags when null), each with an *inherited* song
 * count — songs under the tag or any of its descendants. Missing files are left
 * out so the count matches what a shuffle would actually play.
 */
export async function listTagsWithCounts(
  db: SQLiteDatabase,
  parentId: number | null
): Promise<TagWithCounts[]> {
  return db.getAllAsync<TagWithCounts>(
    `${TAGS_WITH_COUNTS} WHERE t.parent_id IS ? ORDER BY t.sort_order, t.name COLLATE NOCASE`,
    parentId
  );
}

/** The whole tree with counts, in one query: for views that show every level, like the query builder. */
export async function listAllTagsWithCounts(db: SQLiteDatabase): Promise<TagWithCounts[]> {
  return db.getAllAsync<TagWithCounts>(`${TAGS_WITH_COUNTS} ORDER BY t.sort_order, t.name COLLATE NOCASE`);
}

/**
 * Every tag mapped to itself plus all of its descendants.
 *
 * The query compiler resolves inheritance against this map rather than nesting
 * recursive CTEs per query node, which keeps the generated SQL flat and readable.
 */
export async function buildDescendantMap(db: SQLiteDatabase): Promise<Map<number, number[]>> {
  const rows = await db.getAllAsync<{ root: number; id: number }>(`
    WITH RECURSIVE sub(root, id) AS (
      SELECT id, id FROM tags
      UNION ALL
      SELECT sub.root, t.id FROM tags t JOIN sub ON t.parent_id = sub.id
    )
    SELECT root, id FROM sub
  `);

  const map = new Map<number, number[]>();
  for (const { root, id } of rows) {
    const existing = map.get(root);
    if (existing) existing.push(id);
    else map.set(root, [id]);
  }
  return map;
}

/** Root → leaf chain ending at `id`, for breadcrumbs. */
export async function getTagPath(db: SQLiteDatabase, id: number): Promise<TagRow[]> {
  const rows = await db.getAllAsync<TagRow & { depth: number }>(
    `
    WITH RECURSIVE up(id, name, parent_id, sort_order, created_at, color, depth) AS (
      SELECT id, name, parent_id, sort_order, created_at, color, 0 FROM tags WHERE id = ?
      UNION ALL
      SELECT t.id, t.name, t.parent_id, t.sort_order, t.created_at, t.color, up.depth + 1
      FROM tags t JOIN up ON t.id = up.parent_id
    )
    SELECT * FROM up ORDER BY depth DESC
    `,
    id
  );
  return rows;
}

export async function createTag(
  db: SQLiteDatabase,
  name: string,
  parentId: number | null
): Promise<number> {
  const clean = name.trim();
  if (!clean) throw new TagError('Tag name cannot be empty.');

  const duplicate = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM tags WHERE parent_id IS ? AND name = ? COLLATE NOCASE',
    parentId,
    clean
  );
  if (duplicate) throw new TagError(`A tag named "${clean}" already exists here.`);

  // New tags cycle through the palette, carrying on from the newest tag's colour.
  const newest = await db.getFirstAsync<{ color: string | null }>(
    'SELECT color FROM tags ORDER BY id DESC LIMIT 1'
  );
  const result = await db.runAsync(
    'INSERT INTO tags (name, parent_id, sort_order, created_at, color) VALUES (?, ?, 0, ?, ?)',
    clean,
    parentId,
    Date.now(),
    nextTagColor(newest?.color)
  );
  return result.lastInsertRowId;
}

export async function setTagColor(db: SQLiteDatabase, id: number, color: TagColor): Promise<void> {
  await db.runAsync('UPDATE tags SET color = ? WHERE id = ?', color, id);
}

export async function renameTag(db: SQLiteDatabase, id: number, name: string): Promise<void> {
  const clean = name.trim();
  if (!clean) throw new TagError('Tag name cannot be empty.');

  const tag = await getTag(db, id);
  if (!tag) throw new TagError('Tag no longer exists.');

  const duplicate = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM tags WHERE parent_id IS ? AND name = ? COLLATE NOCASE AND id != ?',
    tag.parent_id,
    clean,
    id
  );
  if (duplicate) throw new TagError(`A tag named "${clean}" already exists here.`);

  await db.runAsync('UPDATE tags SET name = ? WHERE id = ?', clean, id);
}

/**
 * Move a tag under a new parent.
 *
 * Walks up from the proposed parent first: if we reach the tag being moved, the
 * move would detach that whole subtree into a cycle unreachable from any root,
 * so it's rejected. SQLite can't express this constraint, hence the check here.
 */
export async function reparentTag(
  db: SQLiteDatabase,
  id: number,
  newParentId: number | null
): Promise<void> {
  if (id === newParentId) throw new TagError('A tag cannot be its own parent.');

  if (newParentId !== null) {
    const ancestors = await getTagPath(db, newParentId);
    if (ancestors.some((t) => t.id === id)) {
      throw new TagError('Cannot move a tag inside one of its own subtags.');
    }
  }

  const tag = await getTag(db, id);
  if (!tag) throw new TagError('Tag no longer exists.');

  const duplicate = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM tags WHERE parent_id IS ? AND name = ? COLLATE NOCASE AND id != ?',
    newParentId,
    tag.name,
    id
  );
  if (duplicate) {
    throw new TagError(`A tag named "${tag.name}" already exists in the destination.`);
  }

  await db.runAsync('UPDATE tags SET parent_id = ? WHERE id = ?', newParentId, id);
}

/** Deletes the tag and, via ON DELETE CASCADE, its whole subtree and their song links. */
export async function deleteTag(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM tags WHERE id = ?', id);
}

export async function getTagsForSong(db: SQLiteDatabase, songId: number): Promise<TagRow[]> {
  return db.getAllAsync<TagRow>(
    `SELECT t.* FROM tags t
     JOIN song_tags st ON st.tag_id = t.id
     WHERE st.song_id = ?
     ORDER BY t.name COLLATE NOCASE`,
    songId
  );
}

export async function addTagToSong(
  db: SQLiteDatabase,
  songId: number,
  tagId: number
): Promise<void> {
  await db.runAsync(
    'INSERT OR IGNORE INTO song_tags (song_id, tag_id, added_at) VALUES (?, ?, ?)',
    songId,
    tagId,
    Date.now()
  );
}

/** Direct tags for many songs at once, so list rows don't each fire their own query. */
export async function getTagsForSongs(
  db: SQLiteDatabase,
  songIds: number[]
): Promise<Map<number, TagRow[]>> {
  const map = new Map<number, TagRow[]>();
  if (songIds.length === 0) return map;

  const placeholders = songIds.map(() => '?').join(',');
  const rows = await db.getAllAsync<TagRow & { song_id: number }>(
    `SELECT t.*, st.song_id FROM tags t
     JOIN song_tags st ON st.tag_id = t.id
     WHERE st.song_id IN (${placeholders})
     ORDER BY t.name COLLATE NOCASE`,
    ...songIds
  );

  for (const row of rows) {
    const { song_id, ...tag } = row;
    const existing = map.get(song_id);
    if (existing) existing.push(tag as TagRow);
    else map.set(song_id, [tag as TagRow]);
  }
  return map;
}

/**
 * Direct tags for every present song, in one query.
 *
 * `getTagsForSongs` binds one parameter per song, which hits SQLite's
 * bound-parameter limit on a big enough library; this join has no such limit.
 */
export async function listAllSongTags(db: SQLiteDatabase): Promise<Map<number, TagRow[]>> {
  const rows = await db.getAllAsync<TagRow & { song_id: number }>(
    `SELECT t.*, st.song_id FROM song_tags st
     JOIN tags t  ON t.id = st.tag_id
     JOIN songs s ON s.id = st.song_id AND s.is_missing = 0
     ORDER BY t.name COLLATE NOCASE`
  );
  const map = new Map<number, TagRow[]>();
  for (const { song_id, ...tag } of rows) {
    const existing = map.get(song_id);
    if (existing) existing.push(tag);
    else map.set(song_id, [tag]);
  }
  return map;
}

/** "asian-pop / kpop" → ["asian-pop", "kpop"]. Blank segments are dropped. */
export function parseTagPath(input: string): string[] {
  return input
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/**
 * Find or create each tag along a path and return the last one's id.
 *
 * This is what lets someone type "asian-pop/kpop" to make a nested tag — the
 * Bear/Obsidian convention — without a separate tree editor. Matching is
 * case-insensitive, so existing tags are reused rather than duplicated.
 * `rootParentId` starts the path somewhere other than the top level.
 */
export async function ensureTagPath(
  db: SQLiteDatabase,
  names: readonly string[],
  rootParentId: number | null = null
): Promise<number> {
  if (names.length === 0) throw new TagError('Tag name cannot be empty.');

  let parentId = rootParentId;
  for (const name of names) {
    const existing = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM tags WHERE parent_id IS ? AND name = ? COLLATE NOCASE',
      parentId,
      name.trim()
    );
    parentId = existing ? existing.id : await createTag(db, name, parentId);
  }
  return parentId as number;
}

/**
 * Tags most recently applied to any song, newest first.
 *
 * Someone tagging a run of songs mostly reuses the same handful of tags, so
 * offering these as one-tap chips is what keeps tagging a song to a single tap.
 */
export async function listRecentTags(db: SQLiteDatabase, limit: number): Promise<TagRow[]> {
  return db.getAllAsync<TagRow>(
    `SELECT t.* FROM tags t
     JOIN song_tags st ON st.tag_id = t.id
     GROUP BY t.id
     ORDER BY MAX(st.added_at) DESC, t.name COLLATE NOCASE
     LIMIT ?`,
    limit
  );
}

export interface TagDeletionImpact {
  /** Descendant tags that would be deleted along with it. */
  subtags: number;
  /** Songs that would lose this tag or one of its subtags. The songs themselves stay. */
  songs: number;
}

/** What deleting a tag would remove, for an honest confirmation dialog. */
export async function getTagDeletionImpact(
  db: SQLiteDatabase,
  id: number
): Promise<TagDeletionImpact> {
  const row = await db.getFirstAsync<TagDeletionImpact>(
    `WITH RECURSIVE sub(id) AS (
       SELECT id FROM tags WHERE id = ?
       UNION ALL
       SELECT t.id FROM tags t JOIN sub ON t.parent_id = sub.id
     )
     SELECT
       MAX((SELECT COUNT(*) FROM sub) - 1, 0) AS subtags,
       (SELECT COUNT(DISTINCT song_id) FROM song_tags WHERE tag_id IN (SELECT id FROM sub)) AS songs`,
    id
  );
  return row ?? { subtags: 0, songs: 0 };
}

/**
 * Every song under a tag (subtags included), most recently tagged first — the
 * order a playlist shows new additions in, without asking anyone to arrange it.
 * A song tagged more than once in the subtree counts from its latest tagging.
 */
export async function listSongsInTag(db: SQLiteDatabase, tagId: number): Promise<SongRow[]> {
  return db.getAllAsync<SongRow>(
    `WITH RECURSIVE sub(id) AS (
       SELECT id FROM tags WHERE id = ?
       UNION ALL
       SELECT t.id FROM tags t JOIN sub ON t.parent_id = sub.id
     ),
     members AS (
       SELECT song_id, MAX(added_at) AS tagged_at
       FROM song_tags WHERE tag_id IN (SELECT id FROM sub)
       GROUP BY song_id
     )
     SELECT s.* FROM songs s JOIN members m ON m.song_id = s.id
     WHERE s.is_missing = 0
     ORDER BY m.tagged_at DESC, s.title COLLATE NOCASE`,
    tagId
  );
}

/** Songs carrying this exact tag — not via a subtag. What the add-songs picker toggles. */
export async function listDirectSongIds(db: SQLiteDatabase, tagId: number): Promise<number[]> {
  const rows = await db.getAllAsync<{ song_id: number }>(
    'SELECT song_id FROM song_tags WHERE tag_id = ?',
    tagId
  );
  return rows.map((r) => r.song_id);
}

/**
 * Songs likely to belong in a tag: other songs by artists already in it,
 * strongest-represented artist first.
 *
 * If a tag holds three NewJeans songs, the rest of your NewJeans probably fits
 * too — the user's own tagging is the signal, no model involved. Songs already
 * under the tag (including via subtags) are never suggested.
 */
export async function suggestSongsForTag(
  db: SQLiteDatabase,
  tagId: number,
  limit: number
): Promise<SongRow[]> {
  return db.getAllAsync<SongRow>(
    `WITH RECURSIVE sub(id) AS (
       SELECT id FROM tags WHERE id = ?
       UNION ALL
       SELECT t.id FROM tags t JOIN sub ON t.parent_id = sub.id
     ),
     members AS (
       SELECT DISTINCT song_id AS id FROM song_tags WHERE tag_id IN (SELECT id FROM sub)
     ),
     artists AS (
       SELECT s.artist AS artist, COUNT(*) AS weight
       FROM songs s JOIN members m ON m.id = s.id
       WHERE s.artist IS NOT NULL
       GROUP BY s.artist COLLATE NOCASE
     )
     SELECT s.* FROM songs s
     JOIN artists a ON a.artist = s.artist COLLATE NOCASE
     WHERE s.is_missing = 0 AND s.id NOT IN (SELECT id FROM members)
     ORDER BY a.weight DESC, s.artist COLLATE NOCASE, s.title COLLATE NOCASE
     LIMIT ?`,
    tagId,
    limit
  );
}

// ------------------------------------------------------------------ batch edits

const SUBTREE = `WITH RECURSIVE sub(id) AS (
  SELECT id FROM tags WHERE id = ?
  UNION ALL
  SELECT t.id FROM tags t JOIN sub ON t.parent_id = sub.id
)`;

const placeholders = (ids: readonly number[]) => ids.map(() => '?').join(', ');

/**
 * Take songs out of a tag entirely, subtags included, so they leave its page.
 * The songs themselves are untouched.
 */
export async function removeSongsFromTag(
  db: SQLiteDatabase,
  songIds: readonly number[],
  tagId: number
): Promise<void> {
  if (songIds.length === 0) return;
  await db.runAsync(
    `${SUBTREE}
     DELETE FROM song_tags
     WHERE tag_id IN (SELECT id FROM sub) AND song_id IN (${placeholders(songIds)})`,
    tagId,
    ...songIds
  );
}

/**
 * Apply the add-songs picker's staged changes to one tag as a single step:
 * songs to tag with it directly, and songs to take it off. Only direct links
 * are touched, so a song that's under the tag through a subtag stays there.
 */
export async function updateSongsOfTag(
  db: SQLiteDatabase,
  tagId: number,
  changes: { add: readonly number[]; remove: readonly number[] }
): Promise<void> {
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (txn) => {
    if (changes.remove.length > 0) {
      await txn.runAsync(
        `DELETE FROM song_tags WHERE tag_id = ? AND song_id IN (${placeholders(changes.remove)})`,
        tagId,
        ...changes.remove
      );
    }
    for (const songId of changes.add) {
      await txn.runAsync(
        'INSERT OR IGNORE INTO song_tags (song_id, tag_id, added_at) VALUES (?, ?, ?)',
        songId,
        tagId,
        now
      );
    }
  });
}

/**
 * Apply a multi-song tag edit (see `library/bulkTags.ts`) as one step: the
 * links to add and remove, plus any tags typed in as new, created and given to
 * every song in `songIds`. All or nothing.
 */
export async function applyBulkTagEdit(
  db: SQLiteDatabase,
  songIds: readonly number[],
  edit: { add: readonly (readonly [number, number])[]; remove: readonly (readonly [number, number])[] },
  newTagPaths: readonly (readonly string[])[] = []
): Promise<void> {
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const [songId, tagId] of edit.remove) {
      await txn.runAsync('DELETE FROM song_tags WHERE song_id = ? AND tag_id = ?', songId, tagId);
    }
    const links: (readonly [number, number])[] = [...edit.add];
    for (const path of newTagPaths) {
      const tagId = await ensureTagPath(txn, path);
      for (const songId of songIds) links.push([songId, tagId]);
    }
    for (const [songId, tagId] of links) {
      await txn.runAsync(
        'INSERT OR IGNORE INTO song_tags (song_id, tag_id, added_at) VALUES (?, ?, ?)',
        songId,
        tagId,
        now
      );
    }
  });
}
