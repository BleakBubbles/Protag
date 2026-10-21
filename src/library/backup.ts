import type { SQLiteDatabase } from 'expo-sqlite';

import { listMixes, parseDraft } from '../db/mixes';
import { isTagColor } from '../db/tagColors';
import { albumRef, readRef, type Ref } from '../query/refs';
import { mapDraftRefs, mapDraftTags, pruneDraft, type QueryDraft } from '../query/types';
import { SongMatcher } from './match';

/**
 * Tag backup: the one thing ProTag holds that can't be rebuilt. Songs come back
 * with a scan; the tag tree and which songs carry which tags only live here.
 *
 * The file identifies songs by what's *in* them (filename, artist, title), not by
 * database ids, so it restores onto a new phone or a fresh install, where every
 * id is different. Import matches songs the same way playlist import does.
 */

export const BACKUP_FORMAT = 1;

export interface BackupTag {
  /** Only meaningful inside this file, to link parents and songs to tags. */
  id: number;
  name: string;
  parent: number | null;
  color: string | null;
  createdAt: number;
}

export interface BackupSong {
  filename: string;
  title: string;
  artist: string | null;
  album: string | null;
  durationMs: number;
  /** Tags applied directly, with when each was applied. */
  tags: { tag: number; addedAt: number }[];
}

/**
 * A saved mix; its draft refers to tags by their ids in this file. Album ids
 * are the exporting phone's, so each comes with its name and artist in
 * `albums`, which is how it's found again on another phone. Artists are names
 * already, so they travel as they are.
 */
export interface BackupMix {
  name: string;
  draft: QueryDraft;
  createdAt: number;
  albums?: Record<string, BackupAlbum>;
}

export interface BackupAlbum {
  title: string;
  artist: string | null;
}

/** The album ids a draft refers to. */
function albumIds(draft: QueryDraft): string[] {
  const ids = new Set<string>();
  for (const ref of [...draft.ingredients.flat(), ...draft.exclude]) {
    const read = readRef(ref);
    if (read.kind === 'album') ids.add(read.albumId);
  }
  return [...ids];
}

export interface BackupFile {
  app: 'ProTag';
  format: number;
  exportedAt: string;
  tags: BackupTag[];
  songs: BackupSong[];
  /** Added after format 1 shipped; optional, so older files still read. */
  mixes: BackupMix[];
}

/** Thrown for a file that isn't a backup ProTag can read; the message is for the user. */
export class BackupError extends Error {}

// ------------------------------------------------------------------ export

/**
 * Everything worth keeping: every tag (empty ones too; someone made them on
 * purpose) and every song carrying at least one tag. Songs whose files are
 * currently missing are included: their tags are kept in the app, so they're
 * kept in the backup.
 */
export async function buildBackup(db: SQLiteDatabase, now = new Date()): Promise<BackupFile> {
  const [tags, links, mixes] = await Promise.all([
    db.getAllAsync<{ id: number; name: string; parent_id: number | null; color: string | null; created_at: number }>(
      'SELECT id, name, parent_id, color, created_at FROM tags ORDER BY id'
    ),
    db.getAllAsync<{
      song_id: number;
      filename: string;
      title: string;
      artist: string | null;
      album: string | null;
      duration_ms: number;
      tag_id: number;
      added_at: number;
    }>(
      `SELECT st.song_id, s.filename, s.title, s.artist, s.album, s.duration_ms, st.tag_id, st.added_at
       FROM song_tags st JOIN songs s ON s.id = st.song_id
       ORDER BY st.song_id, st.tag_id`
    ),
    listMixes(db),
  ]);

  const songs = new Map<number, BackupSong>();
  for (const link of links) {
    let song = songs.get(link.song_id);
    if (!song) {
      song = {
        filename: link.filename,
        title: link.title,
        artist: link.artist,
        album: link.album,
        durationMs: link.duration_ms,
        tags: [],
      };
      songs.set(link.song_id, song);
    }
    song.tags.push({ tag: link.tag_id, addedAt: link.added_at });
  }

  return {
    app: 'ProTag',
    format: BACKUP_FORMAT,
    exportedAt: now.toISOString(),
    tags: tags.map((t) => ({
      id: t.id,
      name: t.name,
      parent: t.parent_id,
      color: t.color,
      createdAt: t.created_at,
    })),
    songs: [...songs.values()],
    // Library tag ids are the file's tag ids, so drafts carry over as they are.
    mixes: await Promise.all(
      mixes.map(async (m) => {
        const albums = await describeAlbums(db, albumIds(m.draft));
        return { name: m.name, draft: m.draft, createdAt: m.createdAt, ...(albums && { albums }) };
      })
    ),
  };
}

/** Each album's name and artist, for finding it again on another phone; missing songs count too. */
async function describeAlbums(db: SQLiteDatabase, ids: string[]): Promise<Record<string, BackupAlbum> | undefined> {
  if (ids.length === 0) return undefined;
  const albums: Record<string, BackupAlbum> = {};
  for (const id of ids) {
    const row = await db.getFirstAsync<{ album: string; artist: string | null }>(
      'SELECT album, artist FROM songs WHERE album_id = ? AND album IS NOT NULL ORDER BY is_missing LIMIT 1',
      id
    );
    if (row) albums[id] = { title: row.album, artist: row.artist };
  }
  return albums;
}

/**
 * This phone's id for an album described in a backup: same title, and same
 * artist when the backup knows it (case aside). Null when it isn't here.
 */
async function findAlbum(db: SQLiteDatabase, album: BackupAlbum): Promise<string | null> {
  const row = await db.getFirstAsync<{ album_id: string }>(
    `SELECT album_id FROM songs
     WHERE album_id IS NOT NULL AND album = ? COLLATE NOCASE
       AND (? IS NULL OR artist = ? COLLATE NOCASE)
     ORDER BY is_missing LIMIT 1`,
    album.title,
    album.artist,
    album.artist
  );
  return row?.album_id ?? null;
}

// ------------------------------------------------------------------ reading

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const optString = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/**
 * Parse and check a backup file. Tolerant of extra fields (a newer app may add
 * some) but strict about the ones import relies on, so a damaged file fails
 * here with a clear message instead of half-importing.
 */
export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError("This file isn't a ProTag backup.");
  }
  if (!isObject(data) || data.app !== 'ProTag' || !isNumber(data.format)) {
    throw new BackupError("This file isn't a ProTag backup.");
  }
  if (data.format > BACKUP_FORMAT) {
    throw new BackupError('This backup was made by a newer version of ProTag. Update the app to import it.');
  }
  if (!Array.isArray(data.tags) || !Array.isArray(data.songs)) {
    throw new BackupError('This backup is damaged and can’t be imported.');
  }

  const tags: BackupTag[] = [];
  for (const t of data.tags) {
    if (!isObject(t) || !isNumber(t.id) || typeof t.name !== 'string' || !t.name.trim()) {
      throw new BackupError('This backup is damaged and can’t be imported.');
    }
    tags.push({
      id: t.id,
      name: t.name.trim(),
      parent: isNumber(t.parent) ? t.parent : null,
      color: optString(t.color),
      createdAt: isNumber(t.createdAt) ? t.createdAt : Date.now(),
    });
  }

  const tagIds = new Set(tags.map((t) => t.id));
  const songs: BackupSong[] = [];
  for (const s of data.songs) {
    if (!isObject(s) || typeof s.filename !== 'string' || typeof s.title !== 'string' || !Array.isArray(s.tags)) {
      throw new BackupError('This backup is damaged and can’t be imported.');
    }
    songs.push({
      filename: s.filename,
      title: s.title,
      artist: optString(s.artist),
      album: optString(s.album),
      durationMs: isNumber(s.durationMs) ? s.durationMs : 0,
      // A link to a tag that isn't in the file is dropped rather than failing the whole import.
      tags: s.tags
        .filter((l): l is { tag: number; addedAt?: unknown } => isObject(l) && isNumber(l.tag) && tagIds.has(l.tag))
        .map((l) => ({ tag: l.tag, addedAt: isNumber(l.addedAt) ? l.addedAt : Date.now() })),
    });
  }

  const mixes: BackupMix[] = [];
  for (const m of Array.isArray(data.mixes) ? data.mixes : []) {
    if (!isObject(m) || typeof m.name !== 'string' || !m.name.trim()) continue;
    const albums: Record<string, BackupAlbum> = {};
    if (isObject(m.albums)) {
      for (const [id, album] of Object.entries(m.albums)) {
        if (isObject(album) && typeof album.title === 'string') {
          albums[id] = { title: album.title, artist: optString(album.artist) };
        }
      }
    }
    mixes.push({
      name: m.name.trim(),
      draft: pruneDraft(parseDraft(JSON.stringify(m.draft ?? {})), tagIds),
      createdAt: isNumber(m.createdAt) ? m.createdAt : Date.now(),
      albums,
    });
  }

  return { app: 'ProTag', format: data.format, exportedAt: optString(data.exportedAt) ?? '', tags, songs, mixes };
}

// ------------------------------------------------------------------ import

export interface ImportPlan {
  backup: BackupFile;
  /** For each backup song, by position: the library song it matched, or null. */
  songIdsBySong: (number | null)[];
  /** Backup tags with no same-named tag in the same place in the library. */
  newTags: number;
  existingTags: number;
  matchedSongs: number;
  /** Songs in the backup that aren't on this phone (yet). */
  unmatchedSongs: BackupSong[];
  /** Tag applications the import would add (ones already present don't count). */
  newLinks: number;
  /** Mixes whose name isn't taken here; a same-named mix already here is kept as it is. */
  newMixes: BackupMix[];
}

interface LibraryTag {
  id: number;
  name: string;
  parent_id: number | null;
}

/** Resolve each backup tag to the library tag at the same path, if one exists. */
function resolveTags(backup: BackupFile, library: readonly LibraryTag[]): Map<number, number | null> {
  const byPlace = new Map<string, number>();
  for (const t of library) byPlace.set(`${t.parent_id ?? ''}/${t.name.toLowerCase()}`, t.id);

  const byId = new Map(backup.tags.map((t) => [t.id, t]));
  const resolved = new Map<number, number | null>();
  const resolve = (tagId: number, seen = new Set<number>()): number | null => {
    if (resolved.has(tagId)) return resolved.get(tagId)!;
    const tag = byId.get(tagId)!;
    let parentLibraryId: number | null = null;
    // A parent that's missing from the file, or a loop, puts the tag at the top level.
    if (tag.parent !== null && byId.has(tag.parent) && !seen.has(tag.parent)) {
      seen.add(tagId);
      parentLibraryId = resolve(tag.parent, seen);
      // The parent is new, so nothing under it can exist yet.
      if (parentLibraryId === null) {
        resolved.set(tagId, null);
        return null;
      }
    }
    const id = byPlace.get(`${parentLibraryId ?? ''}/${tag.name.toLowerCase()}`) ?? null;
    resolved.set(tagId, id);
    return id;
  };
  for (const t of backup.tags) resolve(t.id);
  return resolved;
}

/**
 * Work out what importing would do, without changing anything, so the user
 * sees a summary before committing. Import always *merges*: existing tags are
 * reused (matched by name and place in the tree, ignoring case), nothing is
 * deleted, and re-importing the same file changes nothing.
 */
export async function planImport(db: SQLiteDatabase, backup: BackupFile): Promise<ImportPlan> {
  const [library, songs, links, mixes] = await Promise.all([
    db.getAllAsync<LibraryTag>('SELECT id, name, parent_id FROM tags'),
    // Missing songs too: their rows (and tags) wait for the file to come back.
    db.getAllAsync<{ id: number; filename: string; title: string; artist: string | null }>(
      'SELECT id, filename, title, artist FROM songs'
    ),
    db.getAllAsync<{ song_id: number; tag_id: number }>('SELECT song_id, tag_id FROM song_tags'),
    listMixes(db),
  ]);
  const mixNames = new Set(mixes.map((m) => m.name.toLowerCase()));

  const resolved = resolveTags(backup, library);
  const matcher = new SongMatcher(songs);
  const present = new Set(links.map((l) => `${l.song_id}:${l.tag_id}`));

  const songIdsBySong = backup.songs.map((s) =>
    matcher.match({ fileName: s.filename, artist: s.artist, title: s.title })
  );

  // Counted as a set: two backup entries can match the same library song.
  const added = new Set<string>();
  backup.songs.forEach((song, i) => {
    const songId = songIdsBySong[i];
    if (songId === null) return;
    for (const link of song.tags) {
      const tagId = resolved.get(link.tag);
      const key = tagId == null ? `${songId}:new${link.tag}` : `${songId}:${tagId}`;
      if (!present.has(key)) added.add(key);
    }
  });

  const existingTags = [...resolved.values()].filter((id) => id !== null).length;
  return {
    backup,
    songIdsBySong,
    newTags: backup.tags.length - existingTags,
    existingTags,
    matchedSongs: songIdsBySong.filter((id) => id !== null).length,
    unmatchedSongs: backup.songs.filter((_, i) => songIdsBySong[i] === null),
    newLinks: added.size,
    newMixes: backup.mixes.filter((m) => !mixNames.has(m.name.toLowerCase())),
  };
}

/**
 * Carry out a plan, all or nothing. Tags are re-resolved inside the
 * transaction rather than trusted from the plan, so anything that changed in
 * between (a tag made while the summary was up) can't cause a duplicate.
 * New tags keep their colour and creation time; existing ones keep theirs.
 */
export async function applyImport(db: SQLiteDatabase, plan: ImportPlan): Promise<void> {
  const { backup, songIdsBySong } = plan;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const byId = new Map(backup.tags.map((t) => [t.id, t]));
    const libraryIds = new Map<number, number>();

    const ensure = async (tagId: number, seen = new Set<number>()): Promise<number> => {
      const known = libraryIds.get(tagId);
      if (known !== undefined) return known;
      const tag = byId.get(tagId)!;
      let parentId: number | null = null;
      if (tag.parent !== null && byId.has(tag.parent) && !seen.has(tag.parent)) {
        seen.add(tagId);
        parentId = await ensure(tag.parent, seen);
      }
      const existing = await txn.getFirstAsync<{ id: number }>(
        'SELECT id FROM tags WHERE parent_id IS ? AND name = ? COLLATE NOCASE',
        parentId,
        tag.name
      );
      const id =
        existing?.id ??
        (
          await txn.runAsync(
            'INSERT INTO tags (name, parent_id, sort_order, created_at, color) VALUES (?, ?, 0, ?, ?)',
            tag.name,
            parentId,
            tag.createdAt,
            tag.color && isTagColor(tag.color) ? tag.color : null
          )
        ).lastInsertRowId;
      libraryIds.set(tagId, id);
      return id;
    };

    for (const tag of backup.tags) await ensure(tag.id);

    for (let i = 0; i < backup.songs.length; i++) {
      const songId = songIdsBySong[i];
      if (songId === null) continue;
      for (const link of backup.songs[i].tags) {
        await txn.runAsync(
          'INSERT OR IGNORE INTO song_tags (song_id, tag_id, added_at) VALUES (?, ?, ?)',
          songId,
          libraryIds.get(link.tag)!,
          link.addedAt
        );
      }
    }

    for (const mix of plan.newMixes) {
      // Albums are found again by name and artist; one that isn't on this phone drops out.
      const localAlbums = new Map<string, string | null>();
      for (const id of albumIds(mix.draft)) {
        const described = mix.albums?.[id];
        localAlbums.set(id, described ? await findAlbum(txn, described) : null);
      }
      const draft = mapDraftRefs(mapDraftTags(mix.draft, (id) => libraryIds.get(id)!), (ref): Ref | null => {
        const read = readRef(ref);
        if (read.kind !== 'album') return ref;
        const local = localAlbums.get(read.albumId);
        return local ? albumRef(local) : null;
      });
      // OR IGNORE: a mix of that name made while the summary was up wins.
      await txn.runAsync(
        'INSERT OR IGNORE INTO saved_queries (name, query_json, created_at) VALUES (?, ?, ?)',
        mix.name,
        JSON.stringify(draft),
        mix.createdAt
      );
    }
  });
}
