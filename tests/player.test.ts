import test from 'node:test';
import assert from 'node:assert/strict';

import { freshDatabase, insertSong } from './helpers/db.ts';
import { addTagToSong, createTag } from '../src/db/tags.ts';
import { artworkCacheKey, isNativeLoadableUrl } from '../src/player/artworkUrls.ts';
import { queueForQuery } from '../src/player/sources.ts';
import { MATCH_ALL } from '../src/query/types.ts';
import { formatCount, formatTime, plural } from '../src/ui/format.ts';

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

test('only URLs the native side can parse are ever sent to the lock screen', () => {
  // The bug: a content:// URI rejected the whole lock-screen registration.
  assert.equal(isNativeLoadableUrl('content://media/external/audio/albumart/7'), false);
  assert.equal(isNativeLoadableUrl('file:///data/user/0/com.protag.app/cache/art/7.img'), true);
  assert.equal(isNativeLoadableUrl('https://example.com/cover.jpg'), true);
  assert.equal(isNativeLoadableUrl(''), false);
  assert.equal(isNativeLoadableUrl(null), false);
});

test('artwork is cached per album under a filesystem-safe key', () => {
  assert.equal(artworkCacheKey('content://media/external/audio/albumart/7'), '7');
  assert.equal(artworkCacheKey('content://media/external/audio/albumart/12?x=1'), '12');
  assert.equal(artworkCacheKey('content://media/../weird:name'), 'weirdname');
  assert.equal(artworkCacheKey('content://'), null, 'no shared fallback key');
});
