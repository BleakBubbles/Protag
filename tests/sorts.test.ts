import test from 'node:test';
import assert from 'node:assert/strict';

import { freshDatabase, insertSong } from './helpers/db.ts';
import { ensureTagPath, addTagToSong, listTagPlays } from '../src/db/tags.ts';
import { colorGroups, DEFAULT_SORTS, nextMusicSort, nextTagSort, parseSorts, parseEditorSort, sortEditorTags, sortMusic, sortTags } from '../src/library/sorts.ts';

test('sorts cycle, and a stored choice comes back with anything unknown at its default', () => {
  assert.equal(nextTagSort('name'), 'played');
  assert.equal(nextTagSort('played'), 'custom');
  assert.equal(nextTagSort('custom'), 'name');
  assert.deepEqual(['played', 'name', 'added'].map((s) => nextMusicSort(s as never)), ['name', 'added', 'played']);

  assert.deepEqual(parseSorts(null), DEFAULT_SORTS);
  assert.deepEqual(parseSorts('not json'), DEFAULT_SORTS);
  assert.deepEqual(parseSorts('{"tags":"played","albums":"added","artists":"bogus"}'), {
    tags: 'played',
    artists: 'played',
    albums: 'added',
  });
});

test('most played breaks ties by size, then name; A–Z ignores case', () => {
  const music = [
    { name: 'b', plays: 3, added: 1, songs: 1 },
    { name: 'A', plays: 3, added: 3, songs: 5 },
    { name: 'c', plays: 9, added: 2, songs: 1 },
  ];
  const names = (sort: never) => sortMusic(music, sort, (m) => m.name).map((m) => m.name);
  assert.deepEqual(names('played' as never), ['c', 'A', 'b']);
  assert.deepEqual(names('name' as never), ['A', 'b', 'c']);
  assert.deepEqual(names('added' as never), ['A', 'c', 'b']);

  const tags = [
    { id: 1, name: 'rain', song_count: 2, sort_order: 1 },
    { id: 2, name: 'Jazz', song_count: 9, sort_order: 3 },
    { id: 3, name: 'kpop', song_count: 4, sort_order: 2 },
  ];
  assert.deepEqual(sortTags(tags, 'name', new Map()).map((t) => t.name), ['Jazz', 'kpop', 'rain']);
  assert.deepEqual(sortTags(tags, 'played', new Map([[1, 5]])).map((t) => t.name), ['rain', 'Jazz', 'kpop']);
  assert.deepEqual(sortTags(tags, 'custom', new Map()).map((t) => t.name), ['rain', 'kpop', 'Jazz']);
});

test('a tag’s plays include its subtags’ songs, each song once', async () => {
  const db = await freshDatabase();
  const a = await insertSong(db, 'A');
  const b = await insertSong(db, 'B');
  await db.runAsync('UPDATE songs SET play_count = 4 WHERE id = ?', a);
  await db.runAsync('UPDATE songs SET play_count = 1 WHERE id = ?', b);
  const jazz = await ensureTagPath(db as never, ['jazz']);
  const rap = await ensureTagPath(db as never, ['jazz', 'rap']);
  await addTagToSong(db as never, a, jazz);
  await addTagToSong(db as never, a, rap);
  await addTagToSong(db as never, b, rap);

  assert.deepEqual(await listTagPlays(db as never), new Map([[jazz, 5], [rap, 5]]));
  db.close();
});

test("the tag editor's colour order keeps a colour together, in your order within it", () => {
  const tag = (name: string, color: string | null, sort_order: number, song_count = 0) => ({ name, color, sort_order, song_count });
  const tags = [tag('chill', 'blue', 1), tag('hype', 'orange', 2), tag('sad', 'blue', 0), tag('odd', null, 3), tag('rap', 'red', 4, 9)];
  assert.deepEqual(sortEditorTags(tags, 'color').map((t) => t.name), ['rap', 'hype', 'sad', 'chill', 'odd']);
  assert.deepEqual(sortEditorTags(tags, 'custom').map((t) => t.name), ['sad', 'chill', 'hype', 'odd', 'rap']);
  assert.deepEqual(sortEditorTags(tags, 'used')[0].name, 'rap');
  assert.equal(parseEditorSort('nonsense'), 'custom');
});

test("the tag editor's colour groups split where the colour changes", () => {
  const tag = (name: string, color: string | null, sort_order: number) => ({ name, color, sort_order, song_count: 0 });
  const tags = [tag('chill', 'blue', 1), tag('hype', 'orange', 2), tag('sad', 'blue', 0), tag('odd', null, 3), tag('lost', 'nope', 4)];
  assert.deepEqual(colorGroups(tags).map((g) => g.map((t) => t.name)), [['hype'], ['sad', 'chill'], ['odd', 'lost']]);
});
