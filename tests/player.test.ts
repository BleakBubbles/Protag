import test from 'node:test';
import assert from 'node:assert/strict';

import { freshDatabase, insertSong } from './helpers/db.ts';
import { getPlayableSongs } from '../src/db/songs.ts';
import { addTagToSong, createTag } from '../src/db/tags.ts';
import { albumGroups, ingredientSongs, queueForQuery } from '../src/player/sources.ts';
import { MATCH_ALL } from '../src/query/types.ts';
import { formatCount, formatDaysAgo, formatTime, plural } from '../src/ui/format.ts';

test('formatTime renders player timestamps', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(5.9), '0:05');
  assert.equal(formatTime(185.6), '3:05');
  assert.equal(formatTime(3725), '1:02:05');
  assert.equal(formatTime(Number.NaN), '0:00');
  assert.equal(formatTime(-12), '0:00');
});

test('counts are grouped and pluralised', () => {
  assert.equal(formatCount(1234567), '1,234,567');
  assert.equal(plural(1, 'song'), '1 song');
  assert.equal(plural(1200, 'song'), '1,200 songs');
});

// queueForQuery goes through src/query/run.ts, which imports via the `@/` alias —
// so this also proves the test resolve hook handles it.
test('a query becomes a queue whose label reads like the query', async () => {
  const db = await freshDatabase();
  const asianPop = await createTag(db as never, 'asian-pop', null);
  const kpop = await createTag(db as never, 'kpop', asianPop);
  const ditto = await insertSong(db, 'Ditto');
  const hypeBoy = await insertSong(db, 'Hype Boy');
  await insertSong(db, 'Lemon');
  await insertSong(db, 'Ghost', { missing: true });
  await addTagToSong(db as never, ditto, kpop);
  await addTagToSong(db as never, hypeBoy, kpop);

  const all = await queueForQuery(db as never, MATCH_ALL);
  assert.equal(all.label, 'Everything');
  assert.equal(all.ids.length, 3, 'missing files never enter a queue');

  // Shuffling the parent picks up songs tagged only with the child.
  const parent = await queueForQuery(db as never, {
    type: 'tag',
    tagId: asianPop,
    includeDescendants: true,
  });
  assert.equal(parent.label, 'asian-pop');
  assert.deepEqual(parent.ids, [ditto, hypeBoy]);
  db.close();
});

// ---------------------------------------------------------------- lock-screen artwork

test('days ago counts calendar days, not 24-hour spans', () => {
  const now = new Date(2026, 9, 8, 0, 30).getTime();
  assert.equal(formatDaysAgo(new Date(2026, 9, 8, 0, 5).getTime(), now), 'today');
  assert.equal(formatDaysAgo(new Date(2026, 9, 7, 23, 50).getTime(), now), 'yesterday');
  assert.equal(formatDaysAgo(new Date(2026, 9, 1).getTime(), now), '7 days ago');
  assert.equal(formatDaysAgo(new Date(2026, 5, 1).getTime(), now), '4 months ago');
});

test('a queue’s songs come back in queue order, each song holding its place', async () => {
  const db = await freshDatabase();
  const a = await insertSong(db, 'A');
  const b = await insertSong(db, 'B');
  const songs = await getPlayableSongs(db as never, [b, 999, a, b]);
  assert.deepEqual(songs.map((s) => s.uri), [
    'content://media/external/audio/media/B',
    'content://protag/missing/999',
    'content://media/external/audio/media/A',
    'content://media/external/audio/media/B',
  ]);
  db.close();
});

test('album shuffle groups a queue by album, in track order; songs without one stand alone', async () => {
  const db = await freshDatabase();
  const b = await insertSong(db, 'B', { albumId: '1', trackNo: 2 });
  const a = await insertSong(db, 'A', { albumId: '1', trackNo: 1 });
  const loose = await insertSong(db, 'Loose');
  const c = await insertSong(db, 'C', { albumId: '2', trackNo: 1 });
  await insertSong(db, 'Not queued', { albumId: '1', trackNo: 3 });
  assert.deepEqual(await albumGroups(db as never, [b, loose, a, c]), [[a, b], [c], [loose]]);
  db.close();
});

test('a song in two ingredients counts once, for the smaller', async () => {
  const db = await freshDatabase();
  const big = await createTag(db as never, 'big', null);
  const small = await createTag(db as never, 'small', null);
  const songs = [];
  for (const title of ['A', 'B', 'C', 'D']) songs.push(await insertSong(db, title));
  for (const id of songs) await addTagToSong(db as never, id, big);
  await addTagToSong(db as never, songs[0], small);
  const found = await ingredientSongs(db as never, { ingredients: [[big], [small]], exclude: [], includeDescendants: true });
  assert.deepEqual(found.map((i) => i.ids.length), [3, 1]);
  assert.deepEqual(found[1].ids, [songs[0]]);
  db.close();
});
