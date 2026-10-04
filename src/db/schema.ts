import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'protag.db';

/**
 * Schema migrations, in order. Entry `i` upgrades a database from version `i`
 * to version `i + 1`, so the current schema version is `MIGRATIONS.length`.
 *
 * Never edit an entry once it has shipped — devices that already ran it will not
 * run it again. Append a new entry instead.
 */
export const MIGRATIONS: readonly string[] = [
  // v1 — initial schema.
  `
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
    `,

  // v2 — metadata now comes from MediaStore during discovery, so the enrichment
  // bookkeeping and the copied-artwork path go away. Artwork is derived from
  // album_id at display time instead of being written to disk.
  `
      DROP INDEX idx_songs_state;
      ALTER TABLE songs DROP COLUMN metadata_state;
      ALTER TABLE songs DROP COLUMN artwork_path;
      ALTER TABLE songs ADD COLUMN album_id TEXT;

      -- Stored to *suggest* tags for an untagged library; never applied as one.
      ALTER TABLE songs ADD COLUMN genre TEXT;
      CREATE INDEX idx_songs_genre ON songs(genre);

      -- App state not worth its own table, e.g. the remembered playlist folder.
      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/**
 * Runs on every app start via `SQLiteProvider`'s `onInit`.
 *
 * Each migration runs in its own transaction together with its `user_version`
 * bump, so a crash mid-migration rolls back cleanly instead of leaving a
 * half-applied schema that would fail to re-run ("duplicate column") on every
 * subsequent launch.
 */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  // WAL keeps reads from blocking during a library scan's write batches. It
  // cannot be changed inside a transaction, so it is set before migrating.
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version++) {
    try {
      await db.execAsync(
        `BEGIN; ${MIGRATIONS[version]} PRAGMA user_version = ${version + 1}; COMMIT;`
      );
    } catch (error) {
      await db.execAsync('ROLLBACK;').catch(() => {});
      throw new Error(`Database migration to v${version + 1} failed: ${String(error)}`);
    }
  }
}
