import test from 'node:test';
import assert from 'node:assert/strict';

import { freshDatabase, insertSong } from './helpers/db.ts';
import {
  addTagToSong,
  createTag,
  ensureTagPath,
  getTagDeletionImpact,
  listAllSongTags,
  listDirectSongIds,
  listRecentTags,
  listTags,
  parseTagPath,
  suggestSongsForTag,
} from '../src/db/tags.ts';
import { matchesQuery, searchKey } from '../src/library/search.ts';
import { buildTagIndex } from '../src/library/tagTree.ts';

// ---------------------------------------------------------------- path syntax

test('parseTagPath splits on slashes and drops blank segments', () => {
  assert.deepEqual(parseTagPath('asian-pop / kpop'), ['asian-pop', 'kpop']);
  assert.deepEqual(parseTagPath('  driving  '), ['driving']);
  assert.deepEqual(parseTagPath('a//b/ '), ['a', 'b']);
  assert.deepEqual(parseTagPath(' / '), []);
});

test('ensureTagPath creates missing levels and reuses existing ones', async () => {
  const db = await freshDatabase();
  const asianPop = await createTag(db as never, 'Asian-Pop', null);

  const kpop = await ensureTagPath(db as never, ['asian-pop', 'kpop']);
  const tags = await listTags(db as never);
  assert.equal(tags.length, 2, 'reused "Asian-Pop" despite the case difference');
  assert.equal(tags.find((t) => t.id === kpop)?.parent_id, asianPop);

  assert.equal(await ensureTagPath(db as never, ['ASIAN-POP', 'KPOP']), kpop, 'fully idempotent');
  db.close();
});

test('ensureTagPath can start below the top level', async () => {
  const db = await freshDatabase();
  const genres = await createTag(db as never, 'genres', null);
  const jazz = await ensureTagPath(db as never, ['jazz', 'bebop'], genres);
  const index = buildTagIndex(await listTags(db as never));
  assert.equal(index.label(jazz), 'genres › jazz › bebop');
  db.close();
});

test('ensureTagPath rejects an empty path', async () => {
  const db = await freshDatabase();
  await assert.rejects(() => ensureTagPath(db as never, []));
  db.close();
});

// ---------------------------------------------------------------- queries for the screens

test('recent tags are ordered by when they were last applied', async () => {
  const db = await freshDatabase();
  const a = await createTag(db as never, 'a', null);
  const b = await createTag(db as never, 'b', null);
  await createTag(db as never, 'never-used', null);
  const song = await insertSong(db, 'Song');
  await db.runAsync('INSERT INTO song_tags (song_id, tag_id, added_at) VALUES (?, ?, 100)', song, a);
  await db.runAsync('INSERT INTO song_tags (song_id, tag_id, added_at) VALUES (?, ?, 200)', song, b);

  const recent = await listRecentTags(db as never, 10);
  assert.deepEqual(recent.map((t) => t.name), ['b', 'a'], 'unused tags are not "recent"');
  db.close();
});

test('deletion impact counts the subtree and affected songs', async () => {
  const db = await freshDatabase();
  const parent = await createTag(db as never, 'parent', null);
  const child = await createTag(db as never, 'child', parent);
  await createTag(db as never, 'grandchild', child);
  const s1 = await insertSong(db, 'One');
  const s2 = await insertSong(db, 'Two');
  await addTagToSong(db as never, s1, parent);
  await addTagToSong(db as never, s1, child); // same song twice — counted once
  await addTagToSong(db as never, s2, child);

  assert.deepEqual(await getTagDeletionImpact(db as never, parent), { subtags: 2, songs: 2 });
  assert.deepEqual(await getTagDeletionImpact(db as never, 999), { subtags: 0, songs: 0 });
  db.close();
});

test('listAllSongTags groups tags by song and skips missing files', async () => {
  const db = await freshDatabase();
  const kpop = await createTag(db as never, 'kpop', null);
  const dance = await createTag(db as never, 'dance', null);
  const present = await insertSong(db, 'Present');
  const gone = await insertSong(db, 'Gone', { missing: true });
  await addTagToSong(db as never, present, kpop);
  await addTagToSong(db as never, present, dance);
  await addTagToSong(db as never, gone, kpop);

  const map = await listAllSongTags(db as never);
  assert.deepEqual(map.get(present)?.map((t) => t.name), ['dance', 'kpop']);
  assert.equal(map.has(gone), false);
  db.close();
});

// ---------------------------------------------------------------- tag tree

const row = (id: number, name: string, parent_id: number | null) => ({
  id,
  name,
  parent_id,
  sort_order: 0,
  created_at: 0,
});

const TREE = [
  row(1, 'asian-pop', null),
  row(2, 'kpop', 1),
  row(3, 'seoul', 2),
  row(4, 'jpop', 1),
  row(5, 'driving', null),
];

test('the tag index gives paths, labels, and sorted children', () => {
  const index = buildTagIndex(TREE);
  assert.deepEqual(index.path(3).map((t) => t.name), ['asian-pop', 'kpop', 'seoul']);
  assert.equal(index.label(3), 'asian-pop › kpop › seoul');
  assert.deepEqual(index.children(null).map((t) => t.name), ['asian-pop', 'driving']);
  assert.deepEqual(index.children(1).map((t) => t.name), ['jpop', 'kpop']);
  assert.deepEqual(index.path(999), []);
});

test('a tag can never be moved under itself or its own descendants', () => {
  const index = buildTagIndex(TREE);
  assert.deepEqual([...index.descendantIds(1)].sort(), [2, 3, 4]);
  assert.deepEqual(index.validParents(1).map((t) => t.name), ['driving']);
  assert.deepEqual(
    index.validParents(2).map((t) => index.label(t.id)),
    ['asian-pop', 'asian-pop › jpop', 'driving']
  );
});

test('a corrupt cycle cannot hang the index', () => {
  const index = buildTagIndex([row(1, 'a', 2), row(2, 'b', 1)]);
  assert.equal(index.path(1).length, 2);
});

// ---------------------------------------------------------------- search

test('search ignores case, accents, punctuation, and word order', () => {
  const key = searchKey(['Halo', 'Beyoncé', 'I Am... Sasha Fierce']);
  assert.ok(matchesQuery(key, 'beyonce'));
  assert.ok(matchesQuery(key, 'halo BEYONCÉ'));
  assert.ok(matchesQuery(key, 'sasha'));
  assert.ok(matchesQuery(key, ''), 'an empty query matches everything');
  assert.ok(!matchesQuery(key, 'halo rihanna'), 'every word must match');
});

test('search works on CJK titles', () => {
  const key = searchKey(['小幸运', '田馥甄', null]);
  assert.ok(matchesQuery(key, '幸运'));
  assert.ok(matchesQuery(key, '田馥甄'));
});

// ---------------------------------------------------------------- add-songs picker

test('direct song ids exclude songs that only have a subtag', async () => {
  const db = await freshDatabase();
  const kpop = await createTag(db as never, 'kpop', null);
  const seoul = await createTag(db as never, 'seoul', kpop);
  const direct = await insertSong(db, 'Direct');
  const viaChild = await insertSong(db, 'ViaChild');
  await addTagToSong(db as never, direct, kpop);
  await addTagToSong(db as never, viaChild, seoul);

  assert.deepEqual(await listDirectSongIds(db as never, kpop), [direct]);
  db.close();
});

test('suggestions are other songs by artists already in the tag, strongest first', async () => {
  const db = await freshDatabase();
  const kpop = await createTag(db as never, 'kpop', null);
  const seoul = await createTag(db as never, 'seoul', kpop);

  // In the tag: two NewJeans (one via a subtag), one IVE.
  await addTagToSong(db as never, await insertSong(db, 'Ditto', { artist: 'NewJeans' }), kpop);
  await addTagToSong(db as never, await insertSong(db, 'OMG', { artist: 'NewJeans' }), seoul);
  await addTagToSong(db as never, await insertSong(db, 'Love Dive', { artist: 'IVE' }), kpop);

  // Not yet tagged.
  await insertSong(db, 'Kitsch', { artist: 'ive' }); // artist case differs
  await insertSong(db, 'Hype Boy', { artist: 'NewJeans' });
  await insertSong(db, 'Super Shy', { artist: 'NewJeans' });
  await insertSong(db, 'Lemon', { artist: 'Kenshi Yonezu' }); // unrelated artist
  await insertSong(db, 'Gone', { artist: 'NewJeans', missing: true }); // file missing

  const titles = (await suggestSongsForTag(db as never, kpop, 10)).map((s) => s.title);
  assert.deepEqual(titles, ['Hype Boy', 'Super Shy', 'Kitsch'], 'NewJeans (2 in tag) before IVE (1)');
  db.close();
});

test('a tag with no songs has no suggestions', async () => {
  const db = await freshDatabase();
  const empty = await createTag(db as never, 'empty', null);
  await insertSong(db, 'Anything', { artist: 'Someone' });
  assert.deepEqual(await suggestSongsForTag(db as never, empty, 10), []);
  db.close();
});
