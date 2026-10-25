import test from 'node:test';
import assert from 'node:assert/strict';

import {
  advance,
  createQueue,
  currentId,
  cycleRepeat,
  EMPTY_QUEUE,
  fisherYates,
  jumpTo,
  ARTIST_MODES,
  nextShuffleMode,
  shuffleModesOf,
  retreat,
  setShuffleMode,
  shuffleAlbums,
  shuffleModeOf,
  setShuffle,
  upNext,
  queueSongs,
  removeUpcoming,
  moveUpcoming,
} from '../src/player/queue.ts';
import { EMPTY_DRAFT } from '../src/query/types.ts';

/** Deterministic "random" so shuffles are reproducible. */
function seeded(seed = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const IDS = [10, 20, 30, 40, 50];

test('fisher-yates is a permutation and does not mutate its input', () => {
  const input = [...IDS];
  const out = fisherYates(input, seeded());
  assert.deepEqual([...out].sort((a, b) => a - b), IDS);
  assert.deepEqual(input, IDS);
});

test('an unshuffled queue starts at the top, or at the requested song', () => {
  assert.equal(currentId(createQueue(IDS)), 10);
  assert.equal(currentId(createQueue(IDS, { startId: 30 })), 30);
  assert.equal(currentId(createQueue([])), null);
});

test('a shuffled queue with a start song plays that song first', () => {
  const q = createQueue(IDS, { startId: 40, shuffle: true, random: seeded() });
  assert.equal(currentId(q), 40);
  assert.equal(q.index, 0);
  assert.deepEqual([...q.order].sort((a, b) => a - b), IDS);
  assert.deepEqual(q.original, IDS, 'source order kept for un-shuffling');
});

test('a start song that is not in the queue is ignored rather than breaking it', () => {
  assert.equal(currentId(createQueue(IDS, { startId: 999 })), 10);
});

test('advance moves forward, then stops at the end with repeat off', () => {
  let q = createQueue(IDS, { startId: 40 });
  let r = advance(q, 'ended');
  assert.deepEqual([currentId(r.queue), r.action], [50, 'play']);

  r = advance(r.queue, 'ended');
  assert.deepEqual([currentId(r.queue), r.action], [50, 'stop']);
});

test('repeat all wraps to the start', () => {
  const q = createQueue(IDS, { startId: 50, repeat: 'all' });
  const r = advance(q, 'ended');
  assert.deepEqual([currentId(r.queue), r.action], [10, 'play']);
});

test('repeat one replays on finish, but a manual skip still moves on', () => {
  const q = createQueue(IDS, { startId: 20, repeat: 'one' });
  assert.equal(advance(q, 'ended').action, 'replay');

  const skipped = advance(q, 'skip');
  assert.deepEqual([currentId(skipped.queue), skipped.action], [30, 'play']);
});

test('previous restarts the song after a few seconds, otherwise goes back', () => {
  const q = createQueue(IDS, { startId: 30 });
  assert.deepEqual(retreat(q, 12).action, 'replay');

  const back = retreat(q, 1);
  assert.deepEqual([currentId(back.queue), back.action], [20, 'play']);
});

test('previous on the first song restarts it, or wraps with repeat all', () => {
  assert.equal(retreat(createQueue(IDS), 0).action, 'replay');

  const wrapped = retreat(createQueue(IDS, { repeat: 'all' }), 0);
  assert.deepEqual([currentId(wrapped.queue), wrapped.action], [50, 'play']);
});

test('toggling shuffle never interrupts the current song', () => {
  const q = createQueue(IDS, { startId: 30 });
  const on = setShuffle(q, true, { random: seeded() });
  assert.equal(currentId(on), 30);
  assert.equal(on.index, 0, 'current song leads the shuffled order');

  const off = setShuffle(on, false);
  assert.equal(currentId(off), 30);
  assert.deepEqual(off.order, IDS);
  assert.equal(off.index, 2, 'resumes from its place in the original order');
});

test('setShuffle to the current state is a no-op', () => {
  const q = createQueue(IDS);
  assert.equal(setShuffle(q, false), q);
});

test('repeat cycles off → all → one → off', () => {
  let q = createQueue(IDS);
  const seen = [q.repeat];
  for (let i = 0; i < 3; i++) {
    q = cycleRepeat(q);
    seen.push(q.repeat);
  }
  assert.deepEqual(seen, ['off', 'all', 'one', 'off']);
});

test('jumpTo ignores out-of-range indexes', () => {
  const q = createQueue(IDS);
  assert.equal(currentId(jumpTo(q, 3)), 40);
  assert.equal(jumpTo(q, 99), q);
});

test('upNext lists what is coming, wrapping only with repeat all', () => {
  const q = createQueue(IDS, { startId: 40 });
  assert.deepEqual(upNext(q, 3), [50]);
  assert.deepEqual(upNext({ ...q, repeat: 'all' }, 3), [50, 10, 20]);
});

// Albums by song id: [10, 11, 12] is one album in track order, 20 has none, [30, 31] another.
const GROUPS = [[10, 11, 12], [20], [30, 31]];
const GROUPED = GROUPS.flat();

test('album shuffle keeps each album whole and in order, shuffling which comes next', () => {
  const order = shuffleAlbums(GROUPS, null, { random: seeded(7) });
  assert.deepEqual([...order].sort((a, b) => a - b), [...GROUPED].sort((a, b) => a - b));
  for (const group of GROUPS) {
    const at = order.indexOf(group[0]);
    assert.deepEqual(order.slice(at, at + group.length), group, 'an album plays start to finish');
  }
});

test('album shuffle leads with the current song’s album, whole', () => {
  const order = shuffleAlbums(GROUPS, 31, { random: seeded(3) });
  assert.deepEqual(order.slice(0, 2), [30, 31]);
});

test('the shuffle button cycles off, songs, albums, keeping the current song playing', () => {
  assert.deepEqual(['off', 'songs', 'albums'].map((m) => nextShuffleMode(m as never)), ['songs', 'albums', 'off']);
  const queue = createQueue(GROUPED, { startId: 11 });
  const songs = setShuffleMode(queue, 'songs', { random: seeded() });
  assert.equal(shuffleModeOf(songs), 'songs');
  assert.equal(currentId(songs), 11);
  const albums = setShuffleMode(songs, 'albums', { groups: GROUPS, random: seeded() });
  assert.equal(shuffleModeOf(albums), 'albums');
  assert.equal(currentId(albums), 11);
  assert.deepEqual(albums.order.slice(0, 3), [10, 11, 12], 'its album around it, earlier tracks behind');
  assert.equal(albums.index, 1);
  const off = setShuffleMode(albums, 'off');
  assert.deepEqual(off.order, GROUPED);
  assert.equal(currentId(off), 11);
});

test('a mix has no order of its own: it always shuffles, and only by song', () => {
  const source = { label: 'kpop', draft: { ...EMPTY_DRAFT, ingredients: [[1]] } };
  const mix = createQueue([1, 2, 3], { source, byAlbum: true, groups: [[1, 2], [3]] });
  assert.equal(mix.shuffled, true);
  assert.equal(mix.byAlbum, false);
  assert.deepEqual(shuffleModesOf(mix.source), ['songs']);
  assert.equal(nextShuffleMode('songs', ['songs']), 'songs');

  const album = createQueue([1, 2, 3], { source: { label: 'OMG' } });
  assert.equal(album.shuffled, false);
  assert.equal(nextShuffleMode('albums', shuffleModesOf(album.source)), 'off');
});

test('an artist shuffles by song or by album, never off', () => {
  const artist = createQueue([1, 2, 3], { source: { label: 'IU', modes: ARTIST_MODES } });
  assert.equal(artist.shuffled, true);
  assert.equal(nextShuffleMode('songs', ARTIST_MODES), 'albums');
  assert.equal(nextShuffleMode('albums', ARTIST_MODES), 'songs');
  const byAlbum = createQueue([1, 2, 3], { source: { label: 'IU', modes: ARTIST_MODES }, byAlbum: true, groups: [[1, 2], [3]] });
  assert.equal(byAlbum.byAlbum, true);
});

test('a new queue can start shuffled by album', () => {
  const queue = createQueue(GROUPED, { shuffle: true, byAlbum: true, groups: GROUPS, startId: 20, random: seeded() });
  assert.equal(shuffleModeOf(queue), 'albums');
  assert.equal(currentId(queue), 20);
  // Without groups to go on, it shuffles by song.
  assert.equal(shuffleModeOf(createQueue(GROUPED, { shuffle: true, byAlbum: true })), 'songs');
});

test('every transition on an empty queue is safe', () => {
  assert.equal(advance(EMPTY_QUEUE, 'skip').action, 'stop');
  assert.equal(retreat(EMPTY_QUEUE, 0).action, 'stop');
  assert.equal(currentId(setShuffle(EMPTY_QUEUE, true)), null);
  assert.deepEqual(upNext(EMPTY_QUEUE, 5), []);
});

test('play next goes straight after the current song, ahead of anything queued before', () => {
  const q = createQueue([1, 2, 3, 4], { startId: 2 });
  const a = queueSongs(q, [10], 'next');
  assert.equal(a.at, 2);
  const b = queueSongs(a.queue, [11, 12], 'next');
  assert.deepEqual(b.queue.order, [1, 2, 11, 12, 10, 3, 4]);
  assert.equal(b.queue.queuedEnd, 5);
  assert.deepEqual(b.queue.original, [1, 2, 3, 4], 'queued songs are extra, not part of the source');
});

test('add to queue goes after what is queued, but before the rest of the order', () => {
  const q = createQueue([1, 2, 3, 4], { startId: 1 });
  const a = queueSongs(q, [10], 'last');
  const b = queueSongs(a.queue, [11], 'last');
  assert.deepEqual(b.queue.order, [1, 10, 11, 2, 3, 4]);
  assert.equal(b.at, 2);
  // Once the queued songs have played, the next one queued goes after the current song again.
  const played = jumpTo(b.queue, 3);
  assert.deepEqual(queueSongs(played, [12], 'last').queue.order, [1, 10, 11, 2, 12, 3, 4]);
});

test('queued songs stay next when shuffle changes', () => {
  const ids = Array.from({ length: 20 }, (_, i) => i + 1);
  const q = queueSongs(createQueue(ids, { startId: 5 }), [100, 101], 'last').queue;
  for (const mode of ['songs', 'off'] as const) {
    const s = setShuffleMode(mode === 'off' ? setShuffleMode(q, 'songs', { random: seeded() }) : q, mode, { random: seeded() });
    assert.equal(currentId(s), 5);
    assert.deepEqual(s.order.slice(s.index + 1, s.index + 3), [100, 101], mode);
    assert.equal(s.queuedEnd, s.index + 3);
    assert.equal(s.order.length, 22);
  }
});

test('shuffling while a queued song plays leads with it', () => {
  const q = queueSongs(createQueue([1, 2, 3], { startId: 1 }), [100, 101], 'last').queue;
  const playing = jumpTo(q, 1); // 100, with 101 still queued
  const s = setShuffleMode(playing, 'songs', { random: seeded() });
  assert.deepEqual(s.order.slice(0, 2), [100, 101]);
  assert.equal(s.index, 0);
  assert.deepEqual([...s.order.slice(2)].sort(), [1, 2, 3]);
});

test('nothing is queued onto an empty queue', () => {
  assert.equal(queueSongs(EMPTY_QUEUE, [1], 'next').at, -1);
});

test('removing an upcoming song: a queued one just goes, one from the source leaves it for good', () => {
  const q = queueSongs(createQueue([1, 2, 3, 4], { startId: 1 }), [10, 11], 'last').queue; // 1 10 11 2 3 4
  const a = removeUpcoming(q, 1);
  assert.deepEqual(a.order, [1, 11, 2, 3, 4]);
  assert.equal(a.queuedEnd, 2);
  assert.deepEqual(a.original, [1, 2, 3, 4]);
  const b = removeUpcoming(a, 3);
  assert.deepEqual(b.order, [1, 11, 2, 4]);
  assert.deepEqual(b.original, [1, 2, 4]);
  assert.deepEqual(setShuffleMode(b, 'songs', { random: seeded() }).order.slice(0, 2), [1, 11]);
  assert.equal(removeUpcoming(b, 0), b, 'the current song stays');
});

test('upcoming songs move within their own part of the queue', () => {
  const q = queueSongs(createQueue([1, 2, 3, 4, 5], { startId: 1 }), [10, 11], 'last').queue; // 1 10 11 2 3 4 5
  assert.deepEqual(moveUpcoming(q, 2, 1).order, [1, 11, 10, 2, 3, 4, 5]);
  assert.deepEqual(moveUpcoming(q, 6, 3).order, [1, 10, 11, 5, 2, 3, 4]);
  assert.equal(moveUpcoming(q, 3, 1), q, 'not from the rest into the queued songs');
  assert.equal(moveUpcoming(q, 1, 4), q, 'nor the other way');
  assert.equal(moveUpcoming(q, 0, 3), q, 'the current song stays');
});

test('unshuffled, a move survives shuffle going on and off', () => {
  const q = createQueue([1, 2, 3, 4, 5], { startId: 1 });
  const moved = moveUpcoming(q, 4, 1); // 1 5 2 3 4
  assert.deepEqual(moved.original, [1, 5, 2, 3, 4]);
  const back = setShuffleMode(setShuffleMode(moved, 'songs', { random: seeded() }), 'off');
  assert.deepEqual(back.order, [1, 5, 2, 3, 4]);
  assert.deepEqual(moveUpcoming(q, 1, 4).original, [1, 3, 4, 5, 2], 'to the end');
});
