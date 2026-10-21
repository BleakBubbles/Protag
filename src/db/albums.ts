import type { SQLiteDatabase } from 'expo-sqlite';

import { albumRef, type Ref } from '../query/refs';
import type { SongRow } from './types';

/**
 * Artists and albums, read straight from the songs' own metadata: nothing is
 * stored for them. Songs missing from the phone are left out, as everywhere.
 *
 * Android gives each song its artist but not the album's artist, so an album
 * shows under its most common artist, and a compilation's songs scatter
 * across their own artists. Tags are the way round anything the metadata
 * gets wrong.
 */

export interface AlbumSummary {
  /** Android's album id, which is also how its cover is found. */
  albumId: string;
  title: string;
  artist: string | null;
  songs: number;
  /** Plays across its songs, and when its newest song arrived (epoch ms): for sorting. */
  plays: number;
  added: number;
}

export interface ArtistSummary {
  name: string;
  songs: number;
  albums: number;
  /** The album they have most songs on, for their picture. */
  coverAlbumId: string | null;
  plays: number;
  added: number;
}

const ALBUM_SELECT = `
  SELECT s.album_id AS albumId,
         MIN(s.album) AS title,
         (SELECT a.artist FROM songs a
           WHERE a.album_id = s.album_id AND a.is_missing = 0 AND a.artist IS NOT NULL
           GROUP BY a.artist ORDER BY COUNT(*) DESC, a.artist LIMIT 1) AS artist,
         COUNT(*) AS songs,
         SUM(s.play_count) AS plays,
         MAX(s.added_at) AS added
  FROM songs s
  WHERE s.is_missing = 0 AND s.album_id IS NOT NULL AND s.album IS NOT NULL`;

export async function listAlbums(db: SQLiteDatabase): Promise<AlbumSummary[]> {
  return db.getAllAsync<AlbumSummary>(`${ALBUM_SELECT} GROUP BY s.album_id ORDER BY title COLLATE NOCASE`);
}

export async function getAlbum(db: SQLiteDatabase, albumId: string): Promise<AlbumSummary | null> {
  return db.getFirstAsync<AlbumSummary>(`${ALBUM_SELECT} AND s.album_id = ? GROUP BY s.album_id`, albumId);
}

/** An album's songs in track order (untracked ones last, by title). */
export async function listAlbumSongs(db: SQLiteDatabase, albumId: string): Promise<SongRow[]> {
  return db.getAllAsync<SongRow>(
    `SELECT * FROM songs WHERE album_id = ? AND is_missing = 0
     ORDER BY track_no IS NULL, track_no, title COLLATE NOCASE`,
    albumId
  );
}

const ARTIST_SELECT = `
  SELECT s.artist AS name,
         COUNT(*) AS songs,
         COUNT(DISTINCT s.album_id) AS albums,
         (SELECT a.album_id FROM songs a
           WHERE a.artist = s.artist AND a.is_missing = 0 AND a.album_id IS NOT NULL
           GROUP BY a.album_id ORDER BY COUNT(*) DESC, a.album_id LIMIT 1) AS coverAlbumId,
         SUM(s.play_count) AS plays,
         MAX(s.added_at) AS added
  FROM songs s
  WHERE s.is_missing = 0 AND s.artist IS NOT NULL`;

export async function listArtists(db: SQLiteDatabase): Promise<ArtistSummary[]> {
  return db.getAllAsync<ArtistSummary>(`${ARTIST_SELECT} GROUP BY s.artist ORDER BY name COLLATE NOCASE`);
}

export async function getArtist(db: SQLiteDatabase, name: string): Promise<ArtistSummary | null> {
  return db.getFirstAsync<ArtistSummary>(`${ARTIST_SELECT} AND s.artist = ? GROUP BY s.artist`, name);
}

/** An artist's albums, the most songs first. */
export async function listArtistAlbums(db: SQLiteDatabase, name: string): Promise<AlbumSummary[]> {
  return db.getAllAsync<AlbumSummary>(
    `${ALBUM_SELECT} AND s.album_id IN (SELECT album_id FROM songs WHERE artist = ? AND is_missing = 0)
     GROUP BY s.album_id ORDER BY songs DESC, title COLLATE NOCASE`,
    name
  );
}

/** An artist's songs, album by album in track order. */
export async function listArtistSongs(db: SQLiteDatabase, name: string): Promise<SongRow[]> {
  return db.getAllAsync<SongRow>(
    `SELECT * FROM songs WHERE artist = ? AND is_missing = 0
     ORDER BY album COLLATE NOCASE, track_no IS NULL, track_no, title COLLATE NOCASE`,
    name
  );
}

/** Every album's title by its ref: what describing a mix needs ("kpop + SOS"). */
export async function listAlbumTitles(db: SQLiteDatabase): Promise<Map<Ref, string>> {
  const rows = await db.getAllAsync<{ albumId: string; title: string }>(
    `SELECT album_id AS albumId, MIN(album) AS title FROM songs
     WHERE album_id IS NOT NULL AND album IS NOT NULL GROUP BY album_id`
  );
  return new Map(rows.map((r) => [albumRef(r.albumId), r.title]));
}
