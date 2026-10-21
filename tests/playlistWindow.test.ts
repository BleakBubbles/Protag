import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyOp,
  EMPTY_MIRROR,
  planWindow,
  type PlaylistMirror,
  type PlaylistWindow,
} from '../src/player/playlistWindow.ts';

/** Plans, then checks the result by replaying the ops, and that no edit shifted the playing song. */
function plan(from: PlaylistMirror, want: PlaylistWindow) {
  const result = planWindow(from, want);
  let mirror = from;
  // Where the last move left the playing song; edits may dip in between
  // (a swap's remove, then its insert) but must put it back.
  let movedTo = from.index;
  for (const op of result.ops) {
    const next = applyOp(mirror, op);
    if (op.kind === 'next' || op.kind === 'previous' || op.kind === 'skipTo') movedTo = next.index;
    else if (mirror.index >= 0) {
      assert.equal(next.items[next.index], mirror.items[mirror.index], `${op.kind} replaced the playing song`);
    }
    mirror = next;
  }
  assert.equal(mirror.index, movedTo, 'an edit shifted the playing song');
  assert.deepEqual(mirror, result.mirror);
  // The window is in place.
  assert.equal(mirror.items[mirror.index], want.current);
  assert.equal(mirror.items[mirror.index + 1] ?? null, want.next);
  assert.equal(mirror.items.length, mirror.index + 1 + (want.next === null ? 0 : 1));
  return result;
}

const kinds = (result: { ops: { kind: string }[] }) => result.ops.map((op) => op.kind);

test('the first song fills an empty playlist and starts it', () => {
  const r = plan(EMPTY_MIRROR, { previous: null, current: 'a', next: 'b' });
  assert.deepEqual(r.mirror, { items: ['a', 'b'], index: 0 });
  assert.deepEqual(kinds(r), ['add', 'skipTo', 'add']);

  const mid = plan(EMPTY_MIRROR, { previous: 'z', current: 'a', next: 'b' });
  assert.deepEqual(mid.mirror, { items: ['z', 'a', 'b'], index: 1 });
});

test('skipping forward is a plain native next, then the new next is added', () => {
  const r = plan({ items: ['a', 'b'], index: 0 }, { previous: 'a', current: 'b', next: 'c' });
  assert.deepEqual(kinds(r), ['next', 'add']);
  assert.deepEqual(r.mirror, { items: ['a', 'b', 'c'], index: 1 });
});

test('after the lock screen moved on by itself, only the new next is added', () => {
  // The engine has already noted the move; the window just catches up.
  const r = plan({ items: ['a', 'b', 'c'], index: 2 }, { previous: 'b', current: 'c', next: 'd' });
  assert.deepEqual(kinds(r), ['add']);
});

test('going back is a plain native previous, and the next is put right', () => {
  const r = plan({ items: ['a', 'b', 'c'], index: 1 }, { previous: null, current: 'a', next: 'b' });
  assert.deepEqual(kinds(r), ['previous', 'remove']);
  assert.deepEqual(r.mirror, { items: ['a', 'b'], index: 0 });
});

test('jumping elsewhere inserts after the playing song and skips to it', () => {
  const r = plan({ items: ['a', 'b', 'c'], index: 1 }, { previous: 'q', current: 'x', next: 'y' });
  assert.deepEqual(r.mirror.items.slice(r.mirror.index - 1), ['q', 'x', 'y']);
  assert.ok(kinds(r).includes('skipTo'));
});

test('a new previous is swapped in place, without moving the playing song', () => {
  // Shuffle turned on: the same song keeps playing with new neighbours.
  const r = plan({ items: ['a', 'b', 'c'], index: 1 }, { previous: 'm', current: 'b', next: 'n' });
  assert.deepEqual(r.mirror, { items: ['m', 'b', 'n'], index: 1 });
  assert.ok(!kinds(r).some((k) => k === 'next' || k === 'previous' || k === 'skipTo'));
});

test('the end of the queue leaves nothing after the last song', () => {
  const r = plan({ items: ['a', 'b', 'c'], index: 1 }, { previous: 'a', current: 'b', next: null });
  assert.deepEqual(r.mirror, { items: ['a', 'b'], index: 1 });
});

test('nothing changes when the playlist already matches', () => {
  const r = plan({ items: ['a', 'b', 'c'], index: 1 }, { previous: 'a', current: 'b', next: 'c' });
  assert.deepEqual(r.ops, []);
});

test('history in front is kept, so indexes never shift', () => {
  let mirror: PlaylistMirror = EMPTY_MIRROR;
  const songs = ['a', 'b', 'c', 'd', 'e'];
  for (let i = 0; i < songs.length; i++) {
    mirror = plan(mirror, { previous: songs[i - 1] ?? null, current: songs[i], next: songs[i + 1] ?? null }).mirror;
  }
  assert.deepEqual(mirror, { items: songs, index: 4 });
});

test('a one-song queue on repeat holds the song twice, so next still works', () => {
  const r = plan(EMPTY_MIRROR, { previous: 'a', current: 'a', next: 'a' });
  assert.deepEqual(r.mirror, { items: ['a', 'a', 'a'], index: 1 });
});
