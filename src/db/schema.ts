import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'protag.db';

/** Bump this and add a matching block in `migrate` for every schema change. */
const DATABASE_VERSION = 1;

/**
 * Runs on every app start via `SQLiteProvider`'s `onInit`.
 *
 * Migrations are keyed on `PRAGMA user_version` so each one applies exactly once,
 * in order, no matter which version the user is upgrading from.
 */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  // WAL keeps reads from blocking during a library scan's long write batches.
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version === 0) {
    await db.execAsync(`
      CREATE TABLE songs (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id       TEXT    NOT NULL UNIQUE,
        uri            TEXT    NOT NULL,
        filename       TEXT    NOT NULL,
        title          TEXT    NOT NULL,
        artist         TEXT,
        album          TEXT,
        duration_ms    INTEGER NOT NULL DEFAULT 0,
        year           INTEGER,
        track_no       INTEGER,
        artwork_path   TEXT,
        added_at       INTEGER NOT NULL,
        last_played_at INTEGER,
        play_count     INTEGER NOT NULL DEFAULT 0,
        metadata_state TEXT    NOT NULL DEFAULT 'pending',
        -- Stamped on every scan that sees the file. Rows left behind after a scan
        -- are the ones that vanished, which beats a giant NOT IN (...) of media ids.
        last_seen_at   INTEGER NOT NULL,
        is_missing     INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX idx_songs_title  ON songs(title);
      CREATE INDEX idx_songs_artist ON songs(artist);
      CREATE INDEX idx_songs_state  ON songs(metadata_state);

      -- parent_id NULL = root tag. Names are unique among siblings rather than
      -- globally, so rock/chill and electronic/chill can coexist.
      CREATE TABLE tags (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL,
        parent_id  INTEGER REFERENCES tags(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      -- Two indexes because SQLite treats NULLs as distinct in a UNIQUE index,
      -- which would otherwise let duplicate root tags through.
      CREATE UNIQUE INDEX idx_tags_sibling_name
        ON tags(parent_id, name) WHERE parent_id IS NOT NULL;
      CREATE UNIQUE INDEX idx_tags_root_name
        ON tags(name) WHERE parent_id IS NULL;
      CREATE INDEX idx_tags_parent ON tags(parent_id);

      -- Only directly-applied tags live here. Ancestor implication is resolved at
      -- query time, so re-parenting a tag never rewrites song rows.
      CREATE TABLE song_tags (
        song_id  INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        tag_id   INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
        added_at INTEGER NOT NULL,
        PRIMARY KEY (song_id, tag_id)
      );

      CREATE INDEX idx_song_tags_tag ON song_tags(tag_id);

      CREATE TABLE saved_queries (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL UNIQUE,
        query_json TEXT    NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE play_history (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        song_id   INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
        played_at INTEGER NOT NULL
      );

      CREATE INDEX idx_play_history_song ON play_history(song_id);
    `);
    version = 1;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  if (version !== DATABASE_VERSION) {
    console.warn(`[db] expected version ${DATABASE_VERSION}, migrated to ${version}`);
  }
}
