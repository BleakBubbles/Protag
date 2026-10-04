import { baseName, splitArtistTitle, type PlaylistEntry } from './m3u';

/** The fields of a song row the matcher looks at. */
export interface MatchCandidate {
  id: number;
  filename: string;
  title: string;
  artist: string | null;
}

/** What we know about the song being looked for. Any field may be missing. */
export interface MatchQuery {
  fileName?: string | null;
  artist?: string | null;
  title?: string | null;
}

/**
 * Case-, accent-, and punctuation-insensitive form for comparing names:
 * "Beyoncé – Halo (Remastered)" and "beyonce halo remastered" compare equal.
 */
export function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function artistTitleKey(artist: string, title: string): string {
  return `${normalize(artist)}\u0000${normalize(title)}`;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Finds which library song a playlist (or backup) entry refers to.
 *
 * Tiers, first confident hit wins:
 *   1. exact filename (case-insensitive)
 *   2. normalized artist + title
 *
 * There's deliberately no path tier: Android 10+ doesn't expose file paths, so
 * there's nothing to compare against. And it never guesses — if a tier yields
 * several candidates that the next tier can't narrow to one, the entry is left
 * unmatched. A wrong tag costs more to clean up than a missing one costs to add.
 *
 * Shared by playlist import and backup import, which have the same problem.
 */
export class SongMatcher {
  private readonly byFilename = new Map<string, MatchCandidate[]>();
  private readonly byArtistTitle = new Map<string, MatchCandidate[]>();

  constructor(candidates: readonly MatchCandidate[]) {
    for (const song of candidates) {
      push(this.byFilename, song.filename.toLowerCase(), song);
      if (song.artist) push(this.byArtistTitle, artistTitleKey(song.artist, song.title), song);
    }
  }

  match(query: MatchQuery): number | null {
    const byName = query.fileName ? this.byFilename.get(query.fileName.toLowerCase()) : undefined;
    if (byName?.length === 1) return byName[0].id;

    if (query.artist && query.title) {
      const byMeta = this.byArtistTitle.get(artistTitleKey(query.artist, query.title));
      if (byMeta) {
        // Several files share a name (every album has an "Intro.mp3"): use the
        // metadata to pick among *those*, not across the whole library.
        const pool = byName ? byMeta.filter((s) => byName.includes(s)) : byMeta;
        if (pool.length === 1) return pool[0].id;
      }
    }

    return null;
  }

  /** Match a playlist entry, using `#EXTINF` metadata or, failing that, an "Artist - Title" filename. */
  matchEntry(entry: PlaylistEntry): number | null {
    const fileName = baseName(entry.location);
    const fromName = splitArtistTitle(fileName.replace(/\.[^.]+$/, ''));
    return this.match({
      fileName,
      artist: entry.artist ?? fromName.artist,
      title: entry.title ?? fromName.title,
    });
  }

  /** Match every entry; matched ids are de-duplicated and keep playlist order. */
  matchAll(entries: readonly PlaylistEntry[]): { matched: number[]; unmatched: PlaylistEntry[] } {
    const matched: number[] = [];
    const seen = new Set<number>();
    const unmatched: PlaylistEntry[] = [];

    for (const entry of entries) {
      const id = this.matchEntry(entry);
      if (id === null) unmatched.push(entry);
      else if (!seen.has(id)) {
        seen.add(id);
        matched.push(id);
      }
    }
    return { matched, unmatched };
  }
}
