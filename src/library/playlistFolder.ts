import type { SQLiteDatabase } from 'expo-sqlite';

import { listSongsForMatching } from '../db/songs';
import { parseM3u, playlistNameFromUri } from './m3u';
import { SongMatcher } from './match';
import { importPlaylistAsTag, type PlaylistImportResult } from './playlists';
import { findPlaylistFiles, readTextFile } from './saf';

export interface FolderImportSummary {
  results: PlaylistImportResult[];
  /** Playlist files that couldn't be read. */
  unreadable: number;
}

/**
 * Import every playlist under a SAF folder as a tag.
 *
 * Throws if the folder itself can't be read, so the caller can re-prompt for it.
 * One unreadable playlist file doesn't stop the rest.
 */
export async function importPlaylistsFrom(
  db: SQLiteDatabase,
  folderUri: string
): Promise<FolderImportSummary> {
  const files = await findPlaylistFiles(folderUri);
  const matcher = new SongMatcher(await listSongsForMatching(db));
  const summary: FolderImportSummary = { results: [], unreadable: 0 };

  for (const file of files) {
    let text: string;
    try {
      text = await readTextFile(file);
    } catch {
      summary.unreadable++;
      continue;
    }
    const playlist = parseM3u(text, playlistNameFromUri(file));
    summary.results.push(await importPlaylistAsTag(db, playlist, matcher));
  }
  return summary;
}
