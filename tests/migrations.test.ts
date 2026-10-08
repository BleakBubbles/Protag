import test from 'node:test';
import assert from 'node:assert/strict';

import { createTestDatabase, freshDatabase, type TestDatabase } from './helpers/db.ts';
import { migrate, MIGRATIONS, SCHEMA_VERSION } from '../src/db/schema.ts';
import { TAG_COLOR_CYCLE } from '../src/db/tagColors.ts';

async function columns(db: TestDatabase, table: string): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.map((r) => r.name);
}

async function version(db: TestDatabase): Promise<number> {
  return (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))!.user_version;
}

/** A database exactly as the v1 app left it — what's on the phone right now. */
async function v1Database(): Promise<TestDatabase> {
  const db = createTestDatabase();
  await db.execAsync(`${MIGRATIONS[0]} PRAGMA user_version = 1;`);
  return db;
}

test('a fresh install lands on the latest schema', async () => {
  const db = await freshDatabase();
  assert.equal(await version(db), SCHEMA_VERSION);

  const songCols = await columns(db, 'songs');
  for (const col of ['album_id', 'genre']) assert.ok(songCols.includes(col), `missing ${col}`);
  for (const col of ['metadata_state', 'artwork_path']) assert.ok(!songCols.includes(col), `kept ${col}`);
  assert.deepEqual(await columns(db, 'settings'), ['key', 'value']);
  db.close();
});

test('upgrading from v1 keeps every song, tag, and tag link', async () => {
  const db = await v1Database();
  await db.execAsync(`
    INSERT INTO songs (media_id, uri, filename, title, artist, added_at, last_seen_at, metadata_state)
      VALUES ('m1', 'file:///a.mp3', 'a.mp3', 'Ditto', 'NewJeans', 1, 1, 'done');
    INSERT INTO tags (name, parent_id, created_at) VALUES ('kpop', NULL, 1);
    INSERT INTO song_tags (song_id, tag_id, added_at) VALUES (1, 1, 1);
  `);

  await migrate(db as never);

  assert.equal(await version(db), SCHEMA_VERSION);
  const song = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM songs');
  assert.equal(song?.title, 'Ditto');
  assert.equal(song?.artist, 'NewJeans');
  assert.equal(song?.genre, null, 'new columns start empty until the next scan');
  assert.ok(!('metadata_state' in song!), 'dropped column is gone');

  const link = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM song_tags');
  assert.equal(link?.n, 1, 'the tagging work survives the migration');
  db.close();
});

test('running migrate again is a no-op', async () => {
  const db = await freshDatabase();
  await migrate(db as never);
  assert.equal(await version(db), SCHEMA_VERSION);
  db.close();
});

test('a failed migration rolls back completely and can be retried', async () => {
  const db = await v1Database();
  // Sabotage v2: it creates `settings`, so a pre-existing one makes it fail
  // partway through — after it has already dropped and added columns.
  await db.execAsync('CREATE TABLE settings (x INTEGER);');

  await assert.rejects(() => migrate(db as never), /migration to v2 failed/);

  assert.equal(await version(db), 1, 'version not bumped');
  const songCols = await columns(db, 'songs');
  assert.ok(songCols.includes('metadata_state'), 'dropped column restored by rollback');
  assert.ok(!songCols.includes('genre'), 'added column removed by rollback');

  // Without atomic migrations this retry would die on "duplicate column".
  await db.execAsync('DROP TABLE settings;');
  await migrate(db as never);
  assert.equal(await version(db), SCHEMA_VERSION);
  db.close();
});

test('upgrading gives existing tags colours from the cycle, in creation order', async () => {
  const db = await v1Database();
  for (let i = 0; i < TAG_COLOR_CYCLE.length + 1; i++) {
    await db.runAsync('INSERT INTO tags (name, parent_id, created_at) VALUES (?, NULL, 1)', `t${i}`);
  }

  await migrate(db as never);

  const rows = await db.getAllAsync<{ color: string }>('SELECT color FROM tags ORDER BY id');
  assert.deepEqual(
    rows.map((r) => r.color),
    [...TAG_COLOR_CYCLE, TAG_COLOR_CYCLE[0]],
    'the migration matches the cycle new tags use'
  );
  db.close();
});
