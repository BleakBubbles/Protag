/** One track reference from a playlist file. */
export interface PlaylistEntry {
  /** The path or URL line as written in the file. */
  location: string;
  /** From `#EXTINF`, when present. */
  artist: string | null;
  title: string | null;
}

export interface ParsedPlaylist {
  name: string;
  entries: PlaylistEntry[];
}

const PLAYLIST_EXTENSIONS = /\.m3u8?$/i;

export function isPlaylistFile(name: string): boolean {
  return PLAYLIST_EXTENSIONS.test(name);
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Last path segment of a playlist location or SAF URI, decoded.
 *
 * Handles Windows (`\`) and POSIX (`/`) separators, `file://` URLs, and
 * percent-encoding — exporters disagree on all three.
 */
export function baseName(location: string): string {
  const decoded = safeDecode(location.replace(/^file:\/\//i, ''));
  const parts = decoded.split(/[\\/]/);
  return parts[parts.length - 1] ?? decoded;
}

/**
 * File or folder name from a SAF document URI such as
 * `content://…/document/primary%3AMusic%2FPlaylists%2FDriving.m3u` → `Driving.m3u`.
 * The document id is percent-encoded with its path inside, so decode it and take
 * the basename of that.
 */
export function documentName(uri: string): string {
  return baseName(uri.split('/').pop() ?? uri);
}

/** How a playlist entry reads to a person: "Artist – Title", or its file name. */
export function entryLabel(entry: PlaylistEntry): string {
  if (entry.title) return entry.artist ? `${entry.artist} – ${entry.title}` : entry.title;
  return baseName(entry.location).replace(/\.[^.]+$/, '') || entry.location;
}

/** Playlist name from a SAF document URI: `…%2FDriving.m3u` → `Driving`. */
export function playlistNameFromUri(uri: string): string {
  return documentName(uri).replace(PLAYLIST_EXTENSIONS, '');
}

/** "NewJeans - Ditto" → { artist, title }. No separator means title only. */
export function splitArtistTitle(text: string): { artist: string | null; title: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { artist: null, title: null };
  const separator = trimmed.indexOf(' - ');
  if (separator === -1) return { artist: null, title: trimmed };
  return {
    artist: trimmed.slice(0, separator).trim() || null,
    title: trimmed.slice(separator + 3).trim() || null,
  };
}

/**
 * Parse an M3U / M3U8 playlist.
 *
 * Tolerant by design, since these come from many different exporters: a BOM,
 * CRLF line endings, a missing `#EXTM3U` header, and unknown directives are all
 * accepted. Network streams are skipped; there's no local file to match.
 */
export function parseM3u(text: string, fallbackName: string): ParsedPlaylist {
  let name = fallbackName;
  let pending: { artist: string | null; title: string | null } | null = null;
  const entries: PlaylistEntry[] = [];

  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith('#')) {
      const extinf = /^#EXTINF:[^,]*,(.*)$/i.exec(line);
      if (extinf) {
        pending = splitArtistTitle(extinf[1]);
        continue;
      }
      const playlistName = /^#PLAYLIST:(.*)$/i.exec(line);
      if (playlistName && playlistName[1].trim()) name = playlistName[1].trim();
      continue;
    }

    // Any scheme other than file:// is a stream, not a local file.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(line) && !/^file:\/\//i.test(line)) {
      pending = null;
      continue;
    }

    entries.push({
      location: line,
      artist: pending?.artist ?? null,
      title: pending?.title ?? null,
    });
    pending = null;
  }

  return { name, entries };
}
