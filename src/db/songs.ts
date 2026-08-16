import type { SQLiteDatabase } from 'expo-sqlite';

import type { SongRow } from './types';

export interface ScannedSong {
  mediaId: string;
  uri: string;
  filename: string;
  durationMs: number;
}

export interface SongMetadata {
  title?: string;
  artist?: string;
  album?: string;
  year?: number;
  trackNo?: number;
  artworkPath?: string;
}

/** "03 - Ditto.mp3" -> "Ditto", used until real metadata arrives. */
export function titleFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  return withoutExt.replace(/^\d+\s*[-._]\s*/, '').trim() || withoutExt;
}

/**
 * Insert a newly discovered file, or refresh the fields that can change on disk.
 *
 * Deliberately leaves `title`/`artist`/`album` and `metadata_state` alone on
 * update: those are owned by the enrichment phase, and clobbering them would
 * throw away work every single re-scan.
 */
export async function upsertScannedSong(
  db: SQLiteDatabase,
  song: ScannedSong,
  seenAt: number
): Promise<void> {
  await db.runAsync(
    `INSERT INTO songs (media_id, uri, filename, title, duration_ms, added_at, last_seen_at, metadata_state, is_missing)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0)
     ON CONFLICT(media_id) DO UPDATE SET
       uri          = excluded.uri,
       filename     = excluded.filename,
       duration_ms  = excluded.duration_ms,
       last_seen_at = excluded.last_seen_at,
       is_missing   = 0`,
    song.mediaId,
    song.uri,
    song.filename,
    titleFromFilename(song.filename),
    song.durationMs,
    seenAt,
    seenAt
  );
}

/**
 * Flag rows this scan never touched.
 *
 * Flagged rather than deleted on purpose: an unmounted SD card must not wipe
 * tagging work. Rows come back automatically on the next scan that sees them.
 */
export async function flagMissingAfterScan(
  db: SQLiteDatabase,
  scanStartedAt: number
): Promise<number> {
  const result = await db.runAsync(
    'UPDATE songs SET is_missing = 1 WHERE last_seen_at < ? AND is_missing = 0',
    scanStartedAt
  );
  return result.changes;
}

export async function getPendingMetadata(
  db: SQLiteDatabase,
  limit: number
): Promise<SongRow[]> {
  return db.getAllAsync<SongRow>(
    "SELECT * FROM songs WHERE metadata_state = 'pending' AND is_missing = 0 ORDER BY id LIMIT ?",
    limit
  );
}

export async function countPendingMetadata(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM songs WHERE metadata_state = 'pending' AND is_missing = 0"
  );
  return row?.n ?? 0;
}

export async function applyMetadata(
  db: SQLiteDatabase,
  songId: number,
  meta: SongMetadata
): Promise<void> {
  // COALESCE so a file missing an artist tag keeps the filename-derived title
  // instead of being blanked out.
  await db.runAsync(
    `UPDATE songs SET
       title          = COALESCE(?, title),
       artist         = COALESCE(?, artist),
       album          = COALESCE(?, album),
       year           = COALESCE(?, year),
       track_no       = COALESCE(?, track_no),
       artwork_path   = COALESCE(?, artwork_path),
       metadata_state = 'done'
     WHERE id = ?`,
    meta.title ?? null,
    meta.artist ?? null,
    meta.album ?? null,
    meta.year ?? null,
    meta.trackNo ?? null,
    meta.artworkPath ?? null,
    songId
  );
}

export async function markMetadataFailed(db: SQLiteDatabase, songId: number): Promise<void> {
  await db.runAsync("UPDATE songs SET metadata_state = 'failed' WHERE id = ?", songId);
}

export async function getSong(db: SQLiteDatabase, id: number): Promise<SongRow | null> {
  return db.getFirstAsync<SongRow>('SELECT * FROM songs WHERE id = ?', id);
}

/** Returns rows in the order the ids were given, which is what a queue needs. */
export async function getSongsByIds(
  db: SQLiteDatabase,
  ids: number[]
): Promise<SongRow[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.getAllAsync<SongRow>(
    `SELECT * FROM songs WHERE id IN (${placeholders})`,
    ...ids
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is SongRow => r !== undefined);
}

export async function listSongs(
  db: SQLiteDatabase,
  options: { search?: string; limit?: number; offset?: number } = {}
): Promise<SongRow[]> {
  const { search, limit = 500, offset = 0 } = options;

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    return db.getAllAsync<SongRow>(
      `SELECT * FROM songs
       WHERE is_missing = 0 AND (title LIKE ? OR artist LIKE ? OR album LIKE ?)
       ORDER BY title COLLATE NOCASE
       LIMIT ? OFFSET ?`,
      term,
      term,
      term,
      limit,
      offset
    );
  }

  return db.getAllAsync<SongRow>(
    `SELECT * FROM songs WHERE is_missing = 0
     ORDER BY title COLLATE NOCASE
     LIMIT ? OFFSET ?`,
    limit,
    offset
  );
}

export async function countSongs(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM songs WHERE is_missing = 0'
  );
  return row?.n ?? 0;
}

export async function recordPlay(db: SQLiteDatabase, songId: number): Promise<void> {
  const now = Date.now();
  await db.runAsync(
    'UPDATE songs SET play_count = play_count + 1, last_played_at = ? WHERE id = ?',
    now,
    songId
  );
  await db.runAsync('INSERT INTO play_history (song_id, played_at) VALUES (?, ?)', songId, now);
}
