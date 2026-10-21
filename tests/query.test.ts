import test from 'node:test';
import assert from 'node:assert/strict';

import { freshDatabase, insertSong, type TestDatabase } from './helpers/db.ts';
import { addTagToSong, buildDescendantMap, createTag } from '../src/db/tags.ts';
import { compileCountSelect, compileSongSelect } from '../src/query/compile.ts';
import { describeQuery } from '../src/query/describe.ts';
import { albumRef, artistRef, isRef, readRef, type Ref } from '../src/query/refs.ts';
import { buildQuery, EMPTY_DRAFT, pruneDraft, sameDraft, type TagQuery } from '../src/query/types.ts';

/**
 * Fixture tree:
 *
 *   asian-pop
 *     kpop
 *     jpop
 *   driving
 *   sad
 *
 *   Ditto     -> kpop
 *   HypeBoy   -> kpop, driving
 *   Lemon     -> jpop, sad
 *   Alone     -> (no tags)
 *   Ghost     -> kpop, but the file is missing
 */
async function seed() {
  const db = await freshDatabase();

  const asianPop = await createTag(db as never, 'asian-pop', null);
  const kpop = await createTag(db as never, 'kpop', asianPop);
  const jpop = await createTag(db as never, 'jpop', asianPop);
  const driving = await createTag(db as never, 'driving', null);
  const sad = await createTag(db as never, 'sad', null);

  const ditto = await insertSong(db, 'Ditto');
  const hypeBoy = await insertSong(db, 'HypeBoy');
  const lemon = await insertSong(db, 'Lemon');
  const alone = await insertSong(db, 'Alone');
  const ghost = await insertSong(db, 'Ghost', { missing: true });

  await addTagToSong(db as never, ditto, kpop);
  await addTagToSong(db as never, hypeBoy, kpop);
  await addTagToSong(db as never, hypeBoy, driving);
  await addTagToSong(db as never, lemon, jpop);
  await addTagToSong(db as never, lemon, sad);
  await addTagToSong(db as never, ghost, kpop);

  return { db, tags: { asianPop, kpop, jpop, driving, sad } };
}

async function titlesFor(db: TestDatabase, query: TagQuery): Promise<string[]> {
  const descendants = await buildDescendantMap(db as never);
  const { sql, params } = compileSongSelect(query, descendants, { order: 'title' });
  const rows = await db.getAllAsync<{ title: string }>(sql, ...params);
  return rows.map((r) => r.title);
}

const tag = (tagId: number, includeDescendants = true): TagQuery => ({
  type: 'tag',
  tagId,
  includeDescendants,
});

test('a parent tag matches songs tagged only with its children', async () => {
  const { db, tags } = await seed();
  assert.deepEqual(await titlesFor(db, tag(tags.asianPop)), ['Ditto', 'HypeBoy', 'Lemon']);
  db.close();
});

test('a parent tag with inheritance off matches only direct tags', async () => {
  const { db, tags } = await seed();
  assert.deepEqual(await titlesFor(db, tag(tags.asianPop, false)), []);
  assert.deepEqual(await titlesFor(db, tag(tags.kpop, false)), ['Ditto', 'HypeBoy']);
  db.close();
});

test('missing files never match', async () => {
  const { db, tags } = await seed();
  const titles = await titlesFor(db, tag(tags.kpop));
  assert.deepEqual(titles, ['Ditto', 'HypeBoy']);
  assert.ok(!titles.includes('Ghost'));
  db.close();
});

test('AND intersects, including through inheritance', async () => {
  const { db, tags } = await seed();
  const query: TagQuery = { type: 'and', children: [tag(tags.asianPop), tag(tags.driving)] };
  assert.deepEqual(await titlesFor(db, query), ['HypeBoy']);
  db.close();
});

test('OR unions', async () => {
  const { db, tags } = await seed();
  const query: TagQuery = { type: 'or', children: [tag(tags.kpop), tag(tags.sad)] };
  assert.deepEqual(await titlesFor(db, query), ['Ditto', 'HypeBoy', 'Lemon']);
  db.close();
});

test('NOT excludes, and untagged songs survive exclusion', async () => {
  const { db, tags } = await seed();
  const query: TagQuery = { type: 'not', child: tag(tags.sad) };
  assert.deepEqual(await titlesFor(db, query), ['Alone', 'Ditto', 'HypeBoy']);
  db.close();
});

test('exclusion narrows an inherited include', async () => {
  const { db, tags } = await seed();
  const query = buildQuery({ ...EMPTY_DRAFT, ingredients: [[tags.asianPop]], exclude: [tags.sad] });
  assert.deepEqual(await titlesFor(db, query), ['Ditto', 'HypeBoy']);
  db.close();
});

test('untagged finds only songs with no tags at all', async () => {
  const { db } = await seed();
  assert.deepEqual(await titlesFor(db, { type: 'untagged' }), ['Alone']);
  db.close();
});

test('empty AND matches everything, empty OR matches nothing', async () => {
  const { db } = await seed();
  assert.deepEqual(await titlesFor(db, { type: 'and', children: [] }), [
    'Alone',
    'Ditto',
    'HypeBoy',
    'Lemon',
  ]);
  assert.deepEqual(await titlesFor(db, { type: 'or', children: [] }), []);
  db.close();
});

test('an empty builder draft matches the whole library', async () => {
  const { db } = await seed();
  const query = buildQuery(EMPTY_DRAFT);
  assert.deepEqual(await titlesFor(db, query), ['Alone', 'Ditto', 'HypeBoy', 'Lemon']);
  db.close();
});

test('a tag id that no longer exists matches nothing rather than throwing', async () => {
  const { db } = await seed();
  assert.deepEqual(await titlesFor(db, tag(9999)), []);
  db.close();
});

test('re-parenting a tag changes what a query returns without touching song_tags', async () => {
  const { db, tags } = await seed();
  const { reparentTag } = await import('../src/db/tags.ts');

  const before = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM song_tags');

  // Move kpop out from under asian-pop and under driving instead.
  await reparentTag(db as never, tags.kpop, tags.driving);

  assert.deepEqual(await titlesFor(db, tag(tags.asianPop)), ['Lemon']);
  assert.deepEqual(await titlesFor(db, tag(tags.driving)), ['Ditto', 'HypeBoy']);

  const after = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM song_tags');
  assert.equal(after?.n, before?.n, 'song_tags must be untouched by a re-parent');
  db.close();
});

test('count matches the number of returned rows', async () => {
  const { db, tags } = await seed();
  const descendants = await buildDescendantMap(db as never);
  const query = tag(tags.asianPop);

  const { sql, params } = compileCountSelect(query, descendants);
  const row = await db.getFirstAsync<{ n: number }>(sql, ...params);

  assert.equal(row?.n, (await titlesFor(db, query)).length);
  assert.equal(row?.n, 3);
  db.close();
});

test('describeQuery renders a readable label', async () => {
  const names = new Map([
    [1, 'asian-pop'],
    [2, 'driving'],
    [3, 'sad'],
  ]);

  assert.equal(describeQuery({ type: 'all' }, names), 'Everything');
  assert.equal(describeQuery(tag(1), names), 'asian-pop');
  assert.equal(describeQuery({ type: 'and', children: [tag(1), tag(2)] }, names), 'asian-pop × driving');
  assert.equal(
    describeQuery(buildQuery({ ...EMPTY_DRAFT, ingredients: [[1, 2]], exclude: [3] }), names),
    'asian-pop × driving, not sad'
  );
  // Either-ingredients need no parentheses, before or after the exclusions.
  assert.equal(
    describeQuery(buildQuery({ ...EMPTY_DRAFT, ingredients: [[1, 2], [3]] }), names),
    'asian-pop × driving + sad'
  );
  assert.equal(
    describeQuery(buildQuery({ ...EMPTY_DRAFT, ingredients: [[1], [2]], exclude: [3] }), names),
    'asian-pop + driving, not sad'
  );
});

test('pot ingredients: any ingredient plays, a combined one needs all its tags', async () => {
  const { db, tags } = await seed();
  const either = buildQuery({ ...EMPTY_DRAFT, ingredients: [[tags.kpop], [tags.sad]] });
  assert.deepEqual(await titlesFor(db, either), ['Ditto', 'HypeBoy', 'Lemon']);
  const both = buildQuery({ ...EMPTY_DRAFT, ingredients: [[tags.kpop, tags.driving]] });
  assert.deepEqual(await titlesFor(db, both), ['HypeBoy']);
  const ingredients = [[tags.kpop, tags.driving], [tags.jpop]];
  const mixed = buildQuery({ ...EMPTY_DRAFT, ingredients, exclude: [tags.sad] });
  assert.deepEqual(await titlesFor(db, mixed), ['HypeBoy']);
  db.close();
});

test('a draft drops tags that no longer exist', () => {
  const draft = { ...EMPTY_DRAFT, ingredients: [[1, 2], [4]], exclude: [3] };
  assert.deepEqual(pruneDraft(draft, new Set([2])), { ...EMPTY_DRAFT, ingredients: [[2]], exclude: [] });
});

test('artists and albums are ingredients too, and combine with tags', async () => {
  const db = await freshDatabase();
  const chill = await createTag(db as never, 'chill', null);
  const ditto = await insertSong(db, 'Ditto', { artist: 'NewJeans', album: 'OMG', albumId: '7' });
  await insertSong(db, 'HypeBoy', { artist: 'NewJeans', album: 'New Jeans', albumId: '8' });
  const snooze = await insertSong(db, 'Snooze', { artist: 'SZA', album: 'SOS', albumId: '9' });
  await insertSong(db, 'Gone', { artist: 'NewJeans', albumId: '7', missing: true });
  await addTagToSong(db as never, ditto, chill);
  await addTagToSong(db as never, snooze, chill);

  const play = (ingredients: Ref[][], exclude: Ref[] = []) =>
    titlesFor(db, buildQuery({ ...EMPTY_DRAFT, ingredients, exclude }));
  assert.deepEqual(await play([[artistRef('NewJeans')]]), ['Ditto', 'HypeBoy']);
  assert.deepEqual(await play([[albumRef('9')]]), ['Snooze']);
  assert.deepEqual(await play([[artistRef('NewJeans'), chill]]), ['Ditto'], 'NewJeans × chill');
  assert.deepEqual(await play([[albumRef('8')], [albumRef('9')]]), ['HypeBoy', 'Snooze'], 'either album');
  assert.deepEqual(await play([[chill]], [artistRef('SZA')]), ['Ditto'], 'chill, not SZA');
  db.close();
});

test('artists read as their names, albums as their titles', () => {
  const names = new Map<Ref, string>([
    [1, 'chill'],
    [albumRef('9'), 'SOS'],
  ]);
  const query = buildQuery({ ...EMPTY_DRAFT, ingredients: [[artistRef('NewJeans'), 1], [albumRef('9')]] });
  assert.equal(describeQuery(query, names), 'NewJeans × chill + SOS');
  assert.equal(describeQuery(buildQuery({ ...EMPTY_DRAFT, ingredients: [[albumRef('x')]] }), names), 'an album');
});

test('refs: tags are their ids; artists and albums are prefixed strings', () => {
  assert.deepEqual(readRef(5), { kind: 'tag', tagId: 5 });
  assert.deepEqual(readRef(artistRef('AC/DC: Live')), { kind: 'artist', name: 'AC/DC: Live' });
  assert.deepEqual(readRef(albumRef('42')), { kind: 'album', albumId: '42' });
  assert.ok(isRef(3) && isRef('artist:IU') && isRef('album:1'));
  assert.ok(!isRef(1.5) && !isRef('artist:') && !isRef('genre:pop') && !isRef(null));
});

test('pruning drops deleted tags but keeps artists and albums', () => {
  const draft = { ...EMPTY_DRAFT, ingredients: [[1, artistRef('IU')], [albumRef('2')]], exclude: [3] };
  assert.deepEqual(pruneDraft(draft, new Set([3])), {
    ...EMPTY_DRAFT,
    ingredients: [[artistRef('IU')], [albumRef('2')]],
    exclude: [3],
  });
});

test('mixed drafts compare regardless of order', () => {
  const a = { ...EMPTY_DRAFT, ingredients: [[2, artistRef('IU')], [albumRef('9')]] };
  const b = { ...EMPTY_DRAFT, ingredients: [[albumRef('9')], [artistRef('IU'), 2]] };
  assert.ok(sameDraft(a, b));
  assert.ok(!sameDraft(a, { ...EMPTY_DRAFT, ingredients: [[2], [artistRef('IU')], [albumRef('9')]] }));
});
