import type { SQLiteDatabase } from 'expo-sqlite';

import type { Mix } from '../db/mixes';
import type { SongRow } from '../db/types';
import { findSongs } from '../query/run';
import { buildQuery, pruneDraft } from '../query/types';

/** A mosaic is 2×2. */
export const MOSAIC_TILES = 4;
/** How many of a mix's songs to look through for distinct albums. */
const SAMPLE = 60;

/** The first `max` distinct albums among songs, in the songs' order; songs without an album are skipped. */
export function distinctAlbums(songs: readonly Pick<SongRow, 'album_id'>[], max = MOSAIC_TILES): string[] {
  const albums: string[] = [];
  for (const { album_id } of songs) {
    if (album_id && !albums.includes(album_id)) albums.push(album_id);
    if (albums.length === max) break;
  }
  return albums;
}

/**
 * Album art for each mix: its most-played albums. Deliberately not random, so
 * a mix looks the same every time the screen loads, and what it shows is what
 * that mix actually sounds like to its listener.
 */
export async function loadMixArt(
  db: SQLiteDatabase,
  mixes: readonly Mix[],
  tagIds: ReadonlySet<number>,
  descendants: Map<number, number[]>
): Promise<Map<number, string[]>> {
  const entries = await Promise.all(
    mixes.map(async (mix) => {
      const query = buildQuery(pruneDraft(mix.draft, tagIds));
      const songs = await findSongs(db, query, { order: 'played', limit: SAMPLE, descendants });
      return [mix.id, distinctAlbums(songs)] as const;
    })
  );
  return new Map(entries);
}
