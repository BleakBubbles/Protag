import type { SQLiteDatabase } from 'expo-sqlite';

import { flagMissingAfterScan, upsertScannedSong, type ScannedSong } from '../db/songs';
import { SongMatcher } from './match';

/**
 * Write one page of scan results atomically.
 *
 * Exclusive rather than plain `withTransactionAsync`, which can interleave other
 * queries issued while it runs — and the UI keeps reading during a scan.
 */
export async function recordScanPage(
  db: SQLiteDatabase,
  songs: ScannedSong[],
  seenAt: number
): Promise<void> {
  if (songs.length === 0) return;
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const song of songs) {
      await upsertScannedSong(txn, song, seenAt);
    }
  });
}

/** The newest song row before a scan: rows above it are the ones the scan added. */
export async function lastSongId(db: SQLiteDatabase): Promise<number> {
  return (await db.getFirstAsync<{ n: number | null }>('SELECT MAX(id) AS n FROM songs'))?.n ?? 0;
}

/**
 * Finish a scan by flagging songs it didn't see: `missing` are gone from the
 * phone, `hidden` are in folders left out (their media ids are `leftOut`).
 * Either way their tags are kept, and they come back when seen again.
 *
 * A song that only looks gone because Android gave its file a new number
 * (moved to another folder or the SD card, copied over again, or the whole
 * database restored onto a new phone) is found again among the songs this
 * scan added (rows above `addedAfter`) and keeps its tags: see `relinkMoved`.
 *
 * Only call this after the enumeration completed without throwing — a partial
 * scan would flag everything it hadn't reached yet.
 *
 * A scan that saw nothing at all is treated as untrustworthy rather than as
 * "the user deleted their whole library": revoked permission, unmounted storage,
 * or a provider hiccup all look like zero results, and flagging the entire
 * library missing on that evidence would make it vanish from the app. Flagged
 * rows recover on the next good scan, but there's no reason to cause that.
 */
export async function completeScan(
  db: SQLiteDatabase,
  scanStartedAt: number,
  seenCount: number,
  leftOut: readonly string[] = [],
  addedAfter: number | null = null
): Promise<{ missing: number; hidden: number }> {
  if (seenCount === 0) return { missing: 0, hidden: 0 };
  const flagged = await flagMissingAfterScan(db, scanStartedAt, leftOut);
  if (addedAfter === null || flagged.missing === 0) return flagged;
  const relinked = await relinkMoved(db, addedAfter, leftOut);
  return { missing: flagged.missing - relinked, hidden: flagged.hidden };
}

type SongFields = {
  id: number;
  media_id: string;
  uri: string;
  filename: string;
  title: string;
  artist: string | null;
  album: string | null;
  album_id: string | null;
  genre: string | null;
  track_no: number | null;
  duration_ms: number;
  last_seen_at: number;
};

/**
 * Reunite songs gone missing with the new rows that are really them, matched
 * by filename, then artist and title, as a backup restore does. The old row
 * takes the new one's file and metadata and the new row goes, so the song
 * keeps its id: its tags, plays and place in a queue stay as they were. Only
 * one-to-one matches: an old song with several lookalikes, or two old songs
 * after one new file, stay as they are. Returns how many were reunited.
 */
async function relinkMoved(db: SQLiteDatabase, addedAfter: number, leftOut: readonly string[]): Promise<number> {
  const added = await db.getAllAsync<SongFields>(
    `SELECT id, media_id, uri, filename, title, artist, album, album_id, genre, track_no, duration_ms, last_seen_at
     FROM songs WHERE id > ? AND is_missing = 0`,
    addedAfter
  );
  if (added.length === 0) return 0;
  // Songs in a left-out folder aren't gone, just hidden: nothing to reunite.
  const gone = await db.getAllAsync<{ id: number; filename: string; title: string; artist: string | null }>(
    `SELECT id, filename, title, artist FROM songs
     WHERE id <= ? AND is_missing = 1 AND media_id NOT IN (SELECT value FROM json_each(?))`,
    addedAfter,
    JSON.stringify(leftOut)
  );
  if (gone.length === 0) return 0;

  const matcher = new SongMatcher(added);
  const claims = new Map<number, number[]>();
  for (const song of gone) {
    const match = matcher.match({ fileName: song.filename, artist: song.artist, title: song.title });
    if (match !== null) claims.set(match, [...(claims.get(match) ?? []), song.id]);
  }
  const byId = new Map(added.map((s) => [s.id, s]));
  const pairs = [...claims].filter(([, olds]) => olds.length === 1).map(([id, [old]]) => ({ old, now: byId.get(id)! }));
  if (pairs.length === 0) return 0;

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const { old, now } of pairs) {
      // The new row first, so its media id is free for the old one.
      await txn.runAsync('DELETE FROM songs WHERE id = ?', now.id);
      await txn.runAsync(
        `UPDATE songs SET media_id = ?, uri = ?, filename = ?, title = ?, artist = ?, album = ?, album_id = ?,
           genre = ?, track_no = ?, duration_ms = ?, last_seen_at = ?, is_missing = 0
         WHERE id = ?`,
        now.media_id,
        now.uri,
        now.filename,
        now.title,
        now.artist,
        now.album,
        now.album_id,
        now.genre,
        now.track_no,
        now.duration_ms,
        now.last_seen_at,
        old
      );
    }
  });
  return pairs.length;
}
