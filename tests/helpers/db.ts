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

  return {
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
    close() {
      db.close();
    },
  };
}

/** A migrated, empty database. */
export async function freshDatabase(): Promise<TestDatabase> {
  const db = createTestDatabase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await migrate(db as any);
  return db;
}

export async function insertSong(
  db: TestDatabase,
  title: string,
  extra: { artist?: string; missing?: boolean; durationMs?: number } = {}
): Promise<number> {
  const now = Date.now();
  const result = await db.runAsync(
    `INSERT INTO songs (media_id, uri, filename, title, artist, duration_ms, added_at, last_seen_at, metadata_state, is_missing)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'done', ?)`,
    `media-${title}`,
    `file:///music/${title}.mp3`,
    `${title}.mp3`,
    title,
    extra.artist ?? null,
    extra.durationMs ?? 180000,
    now,
    now,
    extra.missing ? 1 : 0
  );
  return result.lastInsertRowId;
}
