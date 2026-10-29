import * as MusicLibrary from 'expo-music-library';
import type { SQLiteDatabase } from 'expo-sqlite';

import { setSetting, SettingKey } from '../db/settings';
import type { ScannedSong } from '../db/songs';
import { toScannedSong, type SkipReason } from './assets';
import { completeScan, lastSongId, recordScanPage } from './ingest';
import { leftOutOfScan } from './libraryFolders';

const PAGE_SIZE = 500;

export interface ScanProgress {
  scanned: number;
  total: number;
}

export interface ScanSummary {
  /** Songs written to the library this scan. */
  found: number;
  skipped: Record<SkipReason, number>;
  /** Previously known songs this scan didn't see, now flagged missing. */
  missing: number;
  /** Files in folders the user (or a default) left out. */
  leftOut: number;
  /** Previously known songs now hidden because their folder was left out. */
  hidden: number;
}

export class MusicPermissionError extends Error {
  constructor(readonly canAskAgain: boolean) {
    super('Protag needs permission to read your music.');
  }
}

/** Requests audio access if needed. Throws `MusicPermissionError` when refused. */
export async function ensureMusicPermission(): Promise<void> {
  let permission = await MusicLibrary.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) {
    permission = await MusicLibrary.requestPermissionsAsync();
  }
  if (!permission.granted) throw new MusicPermissionError(permission.canAskAgain);
}

/** id → name. Genre only feeds tag suggestions, so failure here must not stop a scan. */
async function loadGenreNames(): Promise<Map<string, string>> {
  try {
    const genres = await MusicLibrary.getGenresAsync();
    return new Map(genres.map((g) => [g.id, g.title]));
  } catch (error) {
    console.warn('[scan] genres unavailable', error);
    return new Map();
  }
}

/**
 * Read the device's music library from MediaStore into Protag's database.
 *
 * One pass: Android has already parsed every file's tags, so metadata arrives
 * with discovery and there's no per-file enrichment step.
 */
export async function scanLibrary(
  db: SQLiteDatabase,
  onProgress?: (progress: ScanProgress) => void
): Promise<ScanSummary> {
  await ensureMusicPermission();
  const genreNames = await loadGenreNames();
  const leftOut = await leftOutOfScan(db);
  const leaveOut = new Set(leftOut);

  const startedAt = Date.now();
  const knownUpTo = await lastSongId(db);
  const summary: ScanSummary = {
    found: 0,
    skipped: { unavailable: 0, 'no-uri': 0, 'too-short': 0 },
    missing: 0,
    leftOut: 0,
    hidden: 0,
  };

  let cursor: string | undefined;
  let scanned = 0;
  let hasNextPage = true;

  while (hasNextPage) {
    const page = await MusicLibrary.getAssetsAsync({
      first: PAGE_SIZE,
      after: cursor,
      // Artwork is derived from albumId at display time; skipping it here
      // avoids a per-asset existence check across the whole library.
      artwork: 'none',
    });

    const songs: ScannedSong[] = [];
    for (const asset of page.assets) {
      if (leaveOut.has(asset.id)) {
        summary.leftOut++;
        continue;
      }
      const mapped = toScannedSong(asset, genreNames);
      if (mapped.ok) songs.push(mapped.song);
      else summary.skipped[mapped.reason]++;
    }

    await recordScanPage(db, songs, startedAt);
    summary.found += songs.length;
    scanned += page.assets.length;
    onProgress?.({ scanned, total: page.totalCount });

    cursor = page.endCursor;
    hasNextPage = page.hasNextPage && page.assets.length > 0;
  }

  // Reached only if every page succeeded — see completeScan.
  const flagged = await completeScan(db, startedAt, summary.found, leftOut, knownUpTo);
  summary.missing = flagged.missing;
  summary.hidden = flagged.hidden;
  await setSetting(db, SettingKey.lastScanAt, String(Date.now()));
  return summary;
}
