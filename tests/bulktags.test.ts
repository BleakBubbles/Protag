import test from 'node:test';
import assert from 'node:assert/strict';

import { freshDatabase, insertSong } from './helpers/db.ts';
import { addTagToSong, applyBulkTagEdit, createTag } from '../src/db/tags.ts';
import { countTags, markFor, nextMark, planBulkEdit, type TagMark } from '../src/library/bulkTags.ts';

// Three songs that don't share all their tags: 10 on all, 20 on two, 30 on one.
const songs = [1, 2, 3];
const tagsOf = new Map([
  [1, [10, 20]],
  [2, [10, 20, 30]],
  [3, [10]],
]);

test('each tag is checked, partial or unchecked by how many selected songs carry it', () => {
  const counts = countTags(songs, tagsOf);
  assert.equal(markFor(counts.get(10) ?? 0, 3), 'all');
  assert.equal(markFor(counts.get(20) ?? 0, 3), 'some');
  assert.equal(markFor(counts.get(99) ?? 0, 3), 'none');
});

test('a partial tag cycles all, none, then back to as-it-was; others just toggle', () => {
  let mark: TagMark = 'some';
  const seen = [];
  for (let i = 0; i < 3; i++) seen.push((mark = nextMark('some', mark)));
  assert.deepEqual(seen, ['all', 'none', 'some']);
  assert.equal(nextMark('all', 'all'), 'none');
  assert.equal(nextMark('all', 'none'), 'all');
  assert.equal(nextMark('none', 'none'), 'all');
});

test('only touched tags change, and only where they need to', () => {
  const marks = new Map<number, TagMark>([
    [20, 'all'], // add to the one song without it
    [30, 'none'], // remove from the one song with it
    [10, 'all'], // already on all: nothing to do
  ]);
  assert.deepEqual(planBulkEdit(songs, tagsOf, marks), { add: [[3, 20]], remove: [[2, 30]] });
  assert.deepEqual(planBulkEdit(songs, tagsOf, new Map([[20, 'some']])), { add: [], remove: [] }, 'as it was');
});

test('a bulk edit applies links and new tags together', async () => {
  const db = await freshDatabase();
  const kpop = await createTag(db as never, 'kpop', null);
  const sad = await createTag(db as never, 'sad', null);
  const [a, b] = await Promise.all(['A', 'B'].map((t) => insertSong(db, t)));
  await addTagToSong(db as never, a, sad);

  await applyBulkTagEdit(db as never, [a, b], { add: [[a, kpop], [b, kpop]], remove: [[a, sad]] }, [['driving', 'night']]);

  const tags = async (song: number) =>
    (
      await db.getAllAsync<{ name: string }>(
        'SELECT t.name FROM song_tags st JOIN tags t ON t.id = st.tag_id WHERE st.song_id = ? ORDER BY t.name',
        song
      )
    ).map((r) => r.name);
  assert.deepEqual(await tags(a), ['kpop', 'night']);
  assert.deepEqual(await tags(b), ['kpop', 'night']);
  const parent = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM tags WHERE name = 'driving' AND parent_id IS NULL"
  );
  assert.equal(parent?.n, 1, 'the typed path is created as a nested tag');
  db.close();
});
