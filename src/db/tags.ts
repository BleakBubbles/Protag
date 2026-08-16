import type { SQLiteDatabase } from 'expo-sqlite';

import type { TagRow, TagWithCounts } from './types';

/** Thrown for tag operations the user could plausibly trigger, so callers can show the message. */
export class TagError extends Error {}

export async function listTags(db: SQLiteDatabase): Promise<TagRow[]> {
  return db.getAllAsync<TagRow>('SELECT * FROM tags ORDER BY sort_order, name COLLATE NOCASE');
}

export async function getTag(db: SQLiteDatabase, id: number): Promise<TagRow | null> {
  return db.getFirstAsync<TagRow>('SELECT * FROM tags WHERE id = ?', id);
}

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
    `
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
    FROM tags t
    WHERE t.parent_id IS ?
    ORDER BY t.sort_order, t.name COLLATE NOCASE
    `,
    parentId
  );
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
    WITH RECURSIVE up(id, name, parent_id, sort_order, created_at, depth) AS (
      SELECT id, name, parent_id, sort_order, created_at, 0 FROM tags WHERE id = ?
      UNION ALL
      SELECT t.id, t.name, t.parent_id, t.sort_order, t.created_at, up.depth + 1
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

  const result = await db.runAsync(
    'INSERT INTO tags (name, parent_id, sort_order, created_at) VALUES (?, ?, 0, ?)',
    clean,
    parentId,
    Date.now()
  );
  return result.lastInsertRowId;
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

export async function removeTagFromSong(
  db: SQLiteDatabase,
  songId: number,
  tagId: number
): Promise<void> {
  await db.runAsync('DELETE FROM song_tags WHERE song_id = ? AND tag_id = ?', songId, tagId);
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
