import type { SQLiteDatabase } from 'expo-sqlite';

import type { SongRow } from './types';

/** One audio file as discovered by a library scan, already mapped from MediaStore. */
export interface ScannedSong {
  mediaId: string;
  uri: string;
  filename: string;
  title: string;
  artist: string | null;
  album: string | null;
  albumId: string | null;
  genre: string | null;
  trackNo: number | null;
  durationMs: number;
  /** When the file arrived on the phone (MediaStore's date added), in ms; null if unknown. */
  addedAt: number | null;
}

/** "03 - Ditto.mp3" -> "Ditto", for files with no title tag. */
export function titleFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  return withoutExt.replace(/^\d+\s*[-._]\s*/, '').trim() || withoutExt;
}

/**
 * Insert a newly discovered file, or refresh an existing one.
 *
 * Metadata is overwritten on every scan: MediaStore is the source of truth, and
 * ProTag never edits metadata itself, so refreshing picks up tag fixes made in
 * other apps without losing anything. Tags live in `song_tags` and are keyed on
 * the row id, so they survive any number of refreshes.
 */
export async function upsertScannedSong(
  db: SQLiteDatabase,
  song: ScannedSong,
  seenAt: number
): Promise<void> {
  await db.runAsync(
    `INSERT INTO songs (media_id, uri, filename, title, artist, album, album_id, genre,
                        track_no, duration_ms, added_at, last_seen_at, is_missing)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(media_id) DO UPDATE SET
       uri          = excluded.uri,
       filename     = excluded.filename,
       title        = excluded.title,
       artist       = excluded.artist,
       album        = excluded.album,
       album_id     = excluded.album_id,
       genre        = excluded.genre,
       track_no     = excluded.track_no,
       duration_ms  = excluded.duration_ms,
       added_at     = excluded.added_at,
       last_seen_at = excluded.last_seen_at,
       is_missing   = 0`,
    song.mediaId,
    song.uri,
    song.filename,
    song.title,
    song.artist,
    song.album,
    song.albumId,
    song.genre,
    song.trackNo,
    song.durationMs,
    // "Recently added" means new to the phone, not new to ProTag: the first scan
    // finds everything at once. Refreshed on rescans so older rows pick it up.
    song.addedAt ?? seenAt,
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
  scanStartedAt: number,
  leftOut: readonly string[] = []
): Promise<{ missing: number; hidden: number }> {
  // Songs in folders the user left out weren't seen either, but they're
  // still on the phone: counted apart, so they aren't reported as gone.
  const hidden =
    leftOut.length === 0
      ? 0
      : ((
          await db.getFirstAsync<{ n: number }>(
            `SELECT COUNT(*) AS n FROM songs
             WHERE last_seen_at < ? AND is_missing = 0
               AND media_id IN (SELECT value FROM json_each(?))`,
            scanStartedAt,
            JSON.stringify(leftOut)
          )
        )?.n ?? 0);
  const result = await db.runAsync(
    'UPDATE songs SET is_missing = 1 WHERE last_seen_at < ? AND is_missing = 0',
    scanStartedAt
  );
  return { missing: result.changes - hidden, hidden };
}

export async function getSong(db: SQLiteDatabase, id: number): Promise<SongRow | null> {
  return db.getFirstAsync<SongRow>('SELECT * FROM songs WHERE id = ?', id);
}

/**
 * Each song's URI, in the order given: what the player hands the audio
 * engine for a whole queue. One query however long the queue (no bound
 * parameter per id), and a song that's gone still holds its place.
 */
/** What playing a song needs: where it is, and what the lock screen shows for it. */
export type PlayableSong = Pick<SongRow, 'id' | 'uri' | 'title' | 'artist' | 'album' | 'album_id'>;

/** The songs of a play order, in that order, from one query. */
export async function getPlayableSongs(db: SQLiteDatabase, ids: readonly number[]): Promise<PlayableSong[]> {
  const rows = await db.getAllAsync<PlayableSong>(
    'SELECT id, uri, title, artist, album, album_id FROM songs WHERE id IN (SELECT value FROM json_each(?))',
    JSON.stringify(ids)
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  // An unplayable placeholder keeps later songs at their indexes; the player skips past it.
  return ids.map(
    (id) =>
      byId.get(id) ?? { id, uri: `content://protag/missing/${id}`, title: 'Missing song', artist: null, album: null, album_id: null }
  );
}

/** Every present song, by title. The Songs view loads them all and filters in memory. */
export async function listAllSongs(db: SQLiteDatabase): Promise<SongRow[]> {
  return db.getAllAsync<SongRow>(
    'SELECT * FROM songs WHERE is_missing = 0 ORDER BY title COLLATE NOCASE'
  );
}

export async function countSongs(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM songs WHERE is_missing = 0'
  );
  return row?.n ?? 0;
}

/** The minimal fields the playlist/backup matcher needs, for every present song. */
export async function listSongsForMatching(
  db: SQLiteDatabase
): Promise<Pick<SongRow, 'id' | 'filename' | 'title' | 'artist'>[]> {
  return db.getAllAsync('SELECT id, filename, title, artist FROM songs WHERE is_missing = 0');
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
