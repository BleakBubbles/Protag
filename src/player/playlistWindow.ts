/**
 * Keeping expo-audio's native playlist in step with ProTag's queue.
 *
 * The queue (queue.ts) stays the source of truth. The native playlist only
 * holds what the lock screen needs to skip without JS: the previous song, the
 * current one and the next. Lock-screen next/previous, headphone buttons and a
 * song ending all move through it natively (gaplessly), and the provider
 * follows along; every other change is planned here and sent down.
 *
 * One rule shapes it: the current song's index only changes by moving to
 * another song. expo-audio reports moves by comparing indexes, so an index
 * shifted under it (say, by removing a song in front) makes it miss a later
 * move. Songs are only added or removed *after* the current one, and the one
 * before is swapped in place (remove, then insert at the same spot). History
 * in front of it just grows, a few bytes a song.
 */

export type PlaylistOp =
  | { kind: 'next' }
  | { kind: 'previous' }
  | { kind: 'skipTo'; index: number }
  | { kind: 'add'; uri: string }
  | { kind: 'insert'; uri: string; index: number }
  | { kind: 'remove'; index: number };

/** What the native playlist holds, as far as ProTag knows: its songs' URIs, and which is playing (-1: none yet). */
export interface PlaylistMirror {
  items: readonly string[];
  index: number;
}

export const EMPTY_MIRROR: PlaylistMirror = { items: [], index: -1 };

/** The songs around the current one that the native playlist should hold. */
export interface PlaylistWindow {
  previous: string | null;
  current: string;
  next: string | null;
}

/** What an op does to the playlist; the native side does the same. */
export function applyOp(mirror: PlaylistMirror, op: PlaylistOp): PlaylistMirror {
  const items = [...mirror.items];
  let { index } = mirror;
  switch (op.kind) {
    case 'next':
      index += 1;
      break;
    case 'previous':
      index -= 1;
      break;
    case 'skipTo':
      index = op.index;
      break;
    case 'add':
      items.push(op.uri);
      break;
    case 'insert':
      items.splice(op.index, 0, op.uri);
      if (op.index <= index) index += 1;
      break;
    case 'remove':
      items.splice(op.index, 1);
      if (op.index < index) index -= 1;
      break;
  }
  return { items, index };
}

/**
 * The ops that bring the playlist to `want`: move to the current song (by a
 * plain next/previous when it's beside the playing one, so the lock screen
 * and gapless playback treat it as an ordinary skip), then fix its neighbours.
 */
export function planWindow(from: PlaylistMirror, want: PlaylistWindow): { ops: PlaylistOp[]; mirror: PlaylistMirror } {
  const ops: PlaylistOp[] = [];
  let mirror = from;
  const run = (op: PlaylistOp) => {
    ops.push(op);
    mirror = applyOp(mirror, op);
  };

  // Moving to the current song.
  if (mirror.index < 0) {
    if (want.previous !== null) run({ kind: 'add', uri: want.previous });
    run({ kind: 'add', uri: want.current });
    // Also what wakes an idle player: seeking starts it loading.
    run({ kind: 'skipTo', index: mirror.items.length - 1 });
  } else if (mirror.items[mirror.index] !== want.current) {
    if (mirror.items[mirror.index + 1] === want.current) run({ kind: 'next' });
    else if (mirror.index > 0 && mirror.items[mirror.index - 1] === want.current) run({ kind: 'previous' });
    else {
      run({ kind: 'insert', uri: want.current, index: mirror.index + 1 });
      run({ kind: 'skipTo', index: mirror.index + 1 });
    }
  }

  // After it: exactly the next song, or nothing.
  const keep = want.next !== null && mirror.items[mirror.index + 1] === want.next ? 1 : 0;
  for (let i = mirror.items.length - 1; i > mirror.index + keep; i--) run({ kind: 'remove', index: i });
  if (!keep && want.next !== null) run({ kind: 'add', uri: want.next });

  // Before it: the previous song, swapped in place. With nothing before (the
  // very first song played), there's no slot to swap without shifting the index,
  // so lock-screen previous does nothing there. A leftover song where the queue
  // has none is left alone: going back to it plays this song again from the start.
  const before = mirror.index - 1;
  if (want.previous !== null && before >= 0 && mirror.items[before] !== want.previous) {
    run({ kind: 'remove', index: before });
    run({ kind: 'insert', uri: want.previous, index: before });
  }

  return { ops, mirror };
}
