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
  retreat,
  setShuffle,
  upNext,
} from '../src/player/queue.ts';

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

test('every transition on an empty queue is safe', () => {
  assert.equal(advance(EMPTY_QUEUE, 'skip').action, 'stop');
  assert.equal(retreat(EMPTY_QUEUE, 0).action, 'stop');
  assert.equal(currentId(setShuffle(EMPTY_QUEUE, true)), null);
  assert.deepEqual(upNext(EMPTY_QUEUE, 5), []);
});
