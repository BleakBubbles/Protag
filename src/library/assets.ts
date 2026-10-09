import type { Asset } from 'expo-music-library';

import { titleFromFilename, type ScannedSong } from '../db/songs';

/** Shorter than this is almost always a ringtone, notification sound, or voice memo. */
export const MIN_DURATION_MS = 30_000;

export type SkipReason = 'unavailable' | 'no-uri' | 'too-short';

export type MappedAsset = { ok: true; song: ScannedSong } | { ok: false; reason: SkipReason };

/**
 * Placeholders that mean "no value". `expo-music-library` substitutes the first
 * two for a missing title/artist, and Android's own MediaStore stores `<unknown>`.
 *
 * Storing them as real values would show junk in the UI and, worse, make the
 * artist+title matcher pair unrelated songs ("Unknown Artist – Track 1").
 */
const PLACEHOLDERS = new Set(['unknown title', 'unknown artist', 'unknown album', '<unknown>']);

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || PLACEHOLDERS.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

function positiveInt(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * Map a MediaStore asset to the row ProTag stores, or say why it was skipped.
 *
 * Pure, so the scan's filtering and normalization rules are unit-testable
 * without a device.
 */
export function toScannedSong(asset: Asset, genreNames: Map<string, string>): MappedAsset {
  if ((asset.availability && asset.availability !== 'local') || asset.isPlayable === false) {
    return { ok: false, reason: 'unavailable' };
  }

  // On Android 10+ there are no file paths; the content URI is what plays.
  const uri = asset.contentUri || asset.uri || null;
  if (!uri) return { ok: false, reason: 'no-uri' };

  // The library reports seconds (MediaStore's milliseconds / 1000).
  const durationMs = Math.round((asset.duration ?? 0) * 1000);
  if (durationMs < MIN_DURATION_MS) return { ok: false, reason: 'too-short' };

  return {
    ok: true,
    song: {
      mediaId: asset.id,
      uri,
      filename: asset.filename,
      title: clean(asset.title) ?? titleFromFilename(asset.filename),
      artist: clean(asset.artist),
      album: clean(asset.albumTitle),
      albumId: asset.albumId || null,
      genre: asset.genreId ? clean(genreNames.get(asset.genreId)) : null,
      trackNo: positiveInt(asset.trackNumber),
      durationMs,
      addedAt: positiveInt(asset.creationTime),
    },
  };
}

/**
 * Album art straight from MediaStore. `<Image>` renders `content://` URIs
 * directly on Android, so nothing is copied to disk. The image may not exist,
 * so callers should show a placeholder on load error.
 */
export function albumArtUri(albumId: string | null): string | null {
  return albumId ? `content://media/external/audio/albumart/${albumId}` : null;
}
