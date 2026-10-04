import type { SQLiteDatabase } from 'expo-sqlite';

import { flagMissingAfterScan, upsertScannedSong, type ScannedSong } from '../db/songs';

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

/**
 * Finish a scan by flagging songs it didn't see. Returns how many were flagged.
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
  seenCount: number
): Promise<number> {
  if (seenCount === 0) return 0;
  return flagMissingAfterScan(db, scanStartedAt);
}
