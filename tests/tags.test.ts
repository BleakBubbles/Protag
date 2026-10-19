import test from 'node:test';
import assert from 'node:assert/strict';

import { freshDatabase, insertSong } from './helpers/db.ts';
import {
  addTagToSong,
  createTag,
  deleteTag,
  getTagPath,
  listSongsInTag,
  listTagsWithCounts,
  removeSongsFromTag,
  renameTag,
  reparentTag,
  setTagColor,
  TagError,
  updateSongsOfTag,
} from '../src/db/tags.ts';
import { nextTagColor, TAG_COLOR_CYCLE } from '../src/db/tagColors.ts';

test('a tag cannot be moved inside its own subtree', async () => {
  const db = await freshDatabase();
  const asianPop = await createTag(db as never, 'asian-pop', null);
  const kpop = await createTag(db as never, 'kpop', asianPop);
  const seoul = await createTag(db as never, 'seoul', kpop);

  await assert.rejects(() => reparentTag(db as never, asianPop, kpop), TagError);
  // Also blocked for a deeper descendant, not just a direct child.
  await assert.rejects(() => reparentTag(db as never, asianPop, seoul), TagError);
  db.close();
});

test('a tag cannot be its own parent', async () => {
  const db = await freshDatabase();
  const driving = await createTag(db as never, 'driving', null);
  await assert.rejects(() => reparentTag(db as never, driving, driving), TagError);
  db.close();
});

test('sibling names must be unique but the same name may repeat across parents', async () => {
  const db = await freshDatabase();
  const rock = await createTag(db as never, 'rock', null);
  const electronic = await createTag(db as never, 'electronic', null);

  await createTag(db as never, 'chill', rock);
  // The whole point of scoping names to siblings: rock/chill and electronic/chill coexist.
  await createTag(db as never, 'chill', electronic);

  await assert.rejects(() => createTag(db as never, 'chill', rock), TagError);
  await assert.rejects(() => createTag(db as never, 'CHILL', rock), TagError);
  db.close();
});

test('root tag names must be unique', async () => {
  const db = await freshDatabase();
  await createTag(db as never, 'driving', null);
  await assert.rejects(() => createTag(db as never, 'driving', null), TagError);
  db.close();
});

test('renaming into an existing sibling name is rejected', async () => {
  const db = await freshDatabase();
  const root = await createTag(db as never, 'genres', null);
  await createTag(db as never, 'kpop', root);
  const jpop = await createTag(db as never, 'jpop', root);

  await assert.rejects(() => renameTag(db as never, jpop, 'kpop'), TagError);
  await renameTag(db as never, jpop, 'j-pop');
  db.close();
});

test('empty tag names are rejected', async () => {
  const db = await freshDatabase();
  await assert.rejects(() => createTag(db as never, '   ', null), TagError);
  db.close();
});

test('song counts are inherited from descendants', async () => {
  const db = await freshDatabase();
  const asianPop = await createTag(db as never, 'asian-pop', null);
  const kpop = await createTag(db as never, 'kpop', asianPop);
  const jpop = await createTag(db as never, 'jpop', asianPop);

  const ditto = await insertSong(db, 'Ditto');
  const lemon = await insertSong(db, 'Lemon');
  const ghost = await insertSong(db, 'Ghost', { missing: true });

  await addTagToSong(db as never, ditto, kpop);
  await addTagToSong(db as never, lemon, jpop);
  await addTagToSong(db as never, ghost, kpop);

  const roots = await listTagsWithCounts(db as never, null);
  assert.equal(roots.length, 1);
  assert.equal(roots[0].name, 'asian-pop');
  assert.equal(roots[0].song_count, 2, 'counts both children, excludes the missing file');
  assert.equal(roots[0].child_count, 2);

  const children = await listTagsWithCounts(db as never, asianPop);
  assert.deepEqual(
    children.map((c) => [c.name, c.song_count, c.child_count]),
    [
      ['jpop', 1, 0],
      ['kpop', 1, 0],
    ]
  );
  db.close();
});

test('a song tagged with both a parent and its child is counted once', async () => {
  const db = await freshDatabase();
  const asianPop = await createTag(db as never, 'asian-pop', null);
  const kpop = await createTag(db as never, 'kpop', asianPop);

  const ditto = await insertSong(db, 'Ditto');
  await addTagToSong(db as never, ditto, asianPop);
  await addTagToSong(db as never, ditto, kpop);

  const roots = await listTagsWithCounts(db as never, null);
  assert.equal(roots[0].song_count, 1);
  db.close();
});

test('deleting a tag removes its subtree and its song links', async () => {
  const db = await freshDatabase();
  const asianPop = await createTag(db as never, 'asian-pop', null);
  const kpop = await createTag(db as never, 'kpop', asianPop);
  const ditto = await insertSong(db, 'Ditto');
  await addTagToSong(db as never, ditto, kpop);

  await deleteTag(db as never, asianPop);

  const tags = await db.getAllAsync<{ id: number }>('SELECT id FROM tags');
  assert.equal(tags.length, 0, 'child tags cascade with the parent');

  const links = await db.getAllAsync<{ tag_id: number }>('SELECT tag_id FROM song_tags');
  assert.equal(links.length, 0, 'song links cascade with the tag');

  const songs = await db.getAllAsync<{ id: number }>('SELECT id FROM songs');
  assert.equal(songs.length, 1, 'the song itself survives');
  db.close();
});

test('getTagPath returns the breadcrumb root-first', async () => {
  const db = await freshDatabase();
  const asianPop = await createTag(db as never, 'asian-pop', null);
  const kpop = await createTag(db as never, 'kpop', asianPop);
  const seoul = await createTag(db as never, 'seoul', kpop);

  const path = await getTagPath(db as never, seoul);
  assert.deepEqual(
    path.map((t) => t.name),
    ['asian-pop', 'kpop', 'seoul']
  );
  db.close();
});

test('new tags cycle through the palette, carrying on after the newest tag', async () => {
  const db = await freshDatabase();
  const first = await createTag(db as never, 'driving', null);
  const second = await createTag(db as never, 'kpop', null);
  await setTagColor(db as never, second, 'red');
  const third = await createTag(db as never, 'chill', first);

  const colorOf = async (id: number) =>
    (await db.getFirstAsync<{ color: string }>('SELECT color FROM tags WHERE id = ?', id))!.color;
  assert.equal(await colorOf(first), TAG_COLOR_CYCLE[0]);
  assert.equal(await colorOf(second), 'red', 'a picked colour sticks');
  assert.equal(await colorOf(third), nextTagColor('red'));
  db.close();
});

test('the colour cycle wraps around and skips gray', () => {
  const last = TAG_COLOR_CYCLE[TAG_COLOR_CYCLE.length - 1];
  assert.equal(nextTagColor(last), TAG_COLOR_CYCLE[0]);
  assert.equal(nextTagColor('gray'), TAG_COLOR_CYCLE[0]);
  assert.equal(nextTagColor(null), TAG_COLOR_CYCLE[0]);
  assert.ok(!TAG_COLOR_CYCLE.includes('gray'));
});

test("a tag's songs come newest-tagged first, counting subtags", async () => {
  const db = await freshDatabase();
  const kpop = await createTag(db as never, 'kpop', null);
  const bts = await createTag(db as never, 'bts', kpop);
  const [a, b, c] = await Promise.all(['Alpha', 'Bravo', 'Charlie'].map((t) => insertSong(db, t)));
  await insertSong(db, 'Untagged');
  const missing = await insertSong(db, 'Missing', { missing: true });
  const tagAt = (song: number, tag: number, at: number) =>
    db.runAsync('INSERT INTO song_tags (song_id, tag_id, added_at) VALUES (?, ?, ?)', song, tag, at);

  await tagAt(a, kpop, 100);
  await tagAt(b, bts, 300);
  await tagAt(c, kpop, 200);
  await tagAt(a, bts, 400); // tagged again later, via the subtag
  await tagAt(missing, kpop, 999);

  const songs = await listSongsInTag(db as never, kpop);
  assert.deepEqual(
    songs.map((s) => s.title),
    ['Alpha', 'Bravo', 'Charlie'],
    'latest tagging wins, no duplicates, missing files and untagged songs left out'
  );
  db.close();
});

test('removing songs from a tag takes them out of its subtags too', async () => {
  const db = await freshDatabase();
  const kpop = await createTag(db as never, 'kpop', null);
  const bts = await createTag(db as never, 'bts', kpop);
  const chill = await createTag(db as never, 'chill', null);
  const [a, b, c] = await Promise.all(['A', 'B', 'C'].map((t) => insertSong(db, t)));
  await addTagToSong(db as never, a, kpop);
  await addTagToSong(db as never, b, bts);
  await addTagToSong(db as never, c, kpop);
  await addTagToSong(db as never, a, chill);

  const tagsOf = async (song: number) =>
    (await db.getAllAsync<{ tag_id: number }>('SELECT tag_id FROM song_tags WHERE song_id = ? ORDER BY tag_id', song)).map(
      (r) => r.tag_id
    );

  await removeSongsFromTag(db as never, [a, b], kpop);
  assert.deepEqual(await tagsOf(a), [chill], 'other tags survive');
  assert.deepEqual(await tagsOf(b), [], 'subtag links go too');
  assert.deepEqual(await tagsOf(c), [kpop], 'unselected songs untouched');
  db.close();
});

test("the picker's changes apply together, and only to the tag's direct links", async () => {
  const db = await freshDatabase();
  const kpop = await createTag(db as never, 'kpop', null);
  const bts = await createTag(db as never, 'bts', kpop);
  const [a, b, c] = await Promise.all(['A', 'B', 'C'].map((t) => insertSong(db, t)));
  await addTagToSong(db as never, a, kpop);
  await addTagToSong(db as never, b, kpop);
  await addTagToSong(db as never, b, bts);

  await updateSongsOfTag(db as never, kpop, { add: [c], remove: [a, b] });

  const tagsOf = async (song: number) =>
    (await db.getAllAsync<{ tag_id: number }>('SELECT tag_id FROM song_tags WHERE song_id = ? ORDER BY tag_id', song)).map(
      (r) => r.tag_id
    );
  assert.deepEqual(await tagsOf(a), []);
  assert.deepEqual(await tagsOf(b), [bts], 'a link through a subtag is not the picker\'s to remove');
  assert.deepEqual(await tagsOf(c), [kpop]);

  await updateSongsOfTag(db as never, kpop, { add: [], remove: [] });
  assert.deepEqual(await tagsOf(c), [kpop], 'no changes, no effect');
  db.close();
});
