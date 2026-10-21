import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../../src/db/schema.ts';

/**
 * Adapts Node's built-in synchronous SQLite to the slice of `expo-sqlite`'s
 * async interface the repositories actually use.
 *
 * This lets the tests exercise the *real* migrations, repository functions, and
 * compiled SQL against a real SQLite engine — no mocks, no native build, and no
 * test-only copy of the schema that could drift from the shipped one.
 */
export interface TestDatabase {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]>;
  runAsync(
    source: string,
    ...params: unknown[]
  ): Promise<{ lastInsertRowId: number; changes: number }>;
  withExclusiveTransactionAsync(task: (txn: TestDatabase) => Promise<void>): Promise<void>;
  close(): void;
}

// expo-sqlite accepts either variadic params or a single array; normalise both,
// and strip null-prototypes so spread/destructuring behaves like the real driver.
function normalise(params: unknown[]): unknown[] {
  const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  return flat.map((p) => (p === undefined ? null : p));
}

function plain<T>(row: unknown): T {
  return { ...(row as object) } as T;
}

export function createTestDatabase(): TestDatabase {
  const db = new DatabaseSync(':memory:');

  const api: TestDatabase = {
    async execAsync(source) {
      db.exec(source);
    },
    async getFirstAsync<T>(source: string, ...params: unknown[]) {
      const row = db.prepare(source).get(...(normalise(params) as never[]));
      return row === undefined ? null : plain<T>(row);
    },
    async getAllAsync<T>(source: string, ...params: unknown[]) {
      const rows = db.prepare(source).all(...(normalise(params) as never[]));
      return rows.map((r: unknown) => plain<T>(r));
    },
    async runAsync(source: string, ...params: unknown[]) {
      const result = db.prepare(source).run(...(normalise(params) as never[]));
      return {
        lastInsertRowId: Number(result.lastInsertRowid),
        changes: Number(result.changes),
      };
    },
    // Same contract as expo-sqlite: commit if the task resolves, roll back if it throws.
    async withExclusiveTransactionAsync(task) {
      db.exec('BEGIN EXCLUSIVE');
      try {
        await task(api);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    close() {
      db.close();
    },
  };
  return api;
}

/** A migrated, empty database. */
export async function freshDatabase(): Promise<TestDatabase> {
  const db = createTestDatabase();
  await migrate(db as never);
  return db;
}

export async function insertSong(
  db: TestDatabase,
  title: string,
  extra: {
    artist?: string;
    missing?: boolean;
    durationMs?: number;
    filename?: string;
    album?: string;
    albumId?: string;
    trackNo?: number;
  } = {}
): Promise<number> {
  const now = Date.now();
  const result = await db.runAsync(
    `INSERT INTO songs (media_id, uri, filename, title, artist, album, album_id, track_no, duration_ms, added_at, last_seen_at, is_missing)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    `media-${title}`,
    `content://media/external/audio/media/${title}`,
    extra.filename ?? `${title}.mp3`,
    title,
    extra.artist ?? null,
    extra.album ?? null,
    extra.albumId ?? null,
    extra.trackNo ?? null,
    extra.durationMs ?? 180000,
    now,
    now,
    extra.missing ? 1 : 0
  );
  return result.lastInsertRowId;
}
