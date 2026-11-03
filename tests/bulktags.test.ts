import test from 'node:test';
import assert from 'node:assert/strict';

import { freshDatabase, insertSong } from './helpers/db.ts';
import { addTagToSong, applyBulkTagEdit, createTag } from '../src/db/tags.ts';
import { chipState, countTags, markFor, nextMark, planBulkEdit, shownMark, tapTag, type TagMark } from '../src/library/bulkTags.ts';

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

// kpop (1) › gen 4 (2), gen 3 (3); chill (4) on top level. Songs start with gen 3 on some.
const start = new Map<number, TagMark>([[3, 'some']]);
const initial = (id: number) => start.get(id) ?? 'none';
const tap = (marks: Map<number, TagMark>, id: number) =>
  tapTag(marks, initial, id, id === 1 ? [2, 3] : [], id === 2 || id === 3 ? [1] : []);
const shown = (marks: Map<number, TagMark>, id: number) =>
  shownMark(marks.get(id) ?? initial(id), (id === 1 ? [2, 3] : []).map((k) => marks.get(k) ?? initial(k)));

test('a parent shows what its subtags say', () => {
  assert.equal(shown(new Map(), 1), 'some');
  assert.equal(shown(new Map([[2, 'all']]), 1), 'all');
});

test('a subtag picked on the way down replaces the parent turned on to get there', () => {
  let marks = tap(new Map(), 1); // kpop showed partial: on
  assert.equal(marks.get(1), 'all');
  marks = tap(marks, 2); // gen 4
  assert.equal(marks.get(2), 'all');
  assert.equal(marks.has(1), false);
  assert.equal(shown(marks, 1), 'all');
});

test('turning a parent off takes its subtags with it, and the next tap restores how they started', () => {
  let marks = tap(new Map([[2, 'all']]), 1);
  assert.deepEqual([marks.get(1), marks.get(2), marks.get(3)], ['none', 'none', 'none']);
  marks = tap(marks, 1);
  assert.equal(marks.size, 0);
  assert.equal(shown(marks, 1), 'some');
});

test('a tag with nothing to restore just toggles', () => {
  const on = tap(new Map(), 4);
  assert.equal(on.get(4), 'all');
  assert.equal(tap(on, 4).get(4), 'none');
});

test('a tag on only through a subtag shows as via, not as on', () => {
  assert.equal(chipState('none', ['all']), 'via');
  assert.equal(chipState('some', ['none', 'all']), 'via');
  assert.equal(chipState('all', ['all']), 'all');
  assert.equal(chipState('none', ['some']), 'some');
  assert.equal(chipState('none', []), 'none');
});
