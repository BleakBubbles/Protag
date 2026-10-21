/**
 * The play queue, as plain data plus pure transitions.
 *
 * No React, no audio — the provider decides *when* to call these and what to
 * do with the result, which keeps every rule here unit-testable and lets the
 * audio engine underneath be swapped without touching queue behavior.
 */

import type { QueryDraft } from '../query/types';

export type RepeatMode = 'off' | 'all' | 'one';

/** Where a queue came from, shown to the user: "Shuffling · kpop". */
export interface QueueSource {
  label: string;
  /** The tag combination behind it, when it came from one: what the player offers to save. */
  draft?: QueryDraft;
}

/** Reorders song ids. Pluggable so smarter shuffles (artist spacing, play-count weighting) drop in later. */
export type ShuffleStrategy = (ids: readonly number[], random: () => number) => number[];

export const fisherYates: ShuffleStrategy = (ids, random) => {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

export interface QueueState {
  /** Play order — shuffled or not. */
  order: number[];
  /** The source order, kept so shuffle can be turned off again. */
  original: number[];
  /** Index into `order`; -1 when empty. */
  index: number;
  shuffled: boolean;
  repeat: RepeatMode;
  source: QueueSource | null;
}

export const EMPTY_QUEUE: QueueState = {
  order: [],
  original: [],
  index: -1,
  shuffled: false,
  repeat: 'off',
  source: null,
};

export interface ShuffleOptions {
  random?: () => number;
  strategy?: ShuffleStrategy;
}

export function currentId(queue: QueueState): number | null {
  return queue.index >= 0 ? (queue.order[queue.index] ?? null) : null;
}

/** Shuffle everything except `first`, which leads. */
function shuffleAround(
  ids: readonly number[],
  first: number | null,
  { random = Math.random, strategy = fisherYates }: ShuffleOptions
): number[] {
  if (first === null) return strategy(ids, random);
  const rest = [...ids];
  rest.splice(rest.indexOf(first), 1);
  return [first, ...strategy(rest, random)];
}

/**
 * Build a queue. With `startId`, that song plays first — shuffled or not. Without
 * it, an unshuffled queue starts at the top and a shuffled one at a random song.
 */
export function createQueue(
  ids: readonly number[],
  options: {
    startId?: number;
    shuffle?: boolean;
    source?: QueueSource | null;
    repeat?: RepeatMode;
  } & ShuffleOptions = {}
): QueueState {
  const original = [...ids];
  const start = options.startId !== undefined && original.includes(options.startId)
    ? options.startId
    : null;
  const shuffled = options.shuffle ?? false;
  const order = shuffled ? shuffleAround(original, start, options) : original;

  return {
    order,
    original,
    index: order.length === 0 ? -1 : start === null ? 0 : order.indexOf(start),
    shuffled,
    repeat: options.repeat ?? 'off',
    source: options.source ?? null,
  };
}

/** What the player should do after a transition. */
export type QueueAction =
  | 'play' //    load the (new) current song and play it
  | 'replay' //  same song again from the start
  | 'stop'; //   end of the queue — stay put, don't play

/**
 * Move forward. `ended` is a song finishing on its own; `skip` is the user
 * pressing next. Repeat-one only applies to `ended` — someone pressing next
 * wants the next song, not the same one again.
 */
export function advance(
  queue: QueueState,
  reason: 'ended' | 'skip'
): { queue: QueueState; action: QueueAction } {
  if (queue.index < 0) return { queue, action: 'stop' };
  if (reason === 'ended' && queue.repeat === 'one') return { queue, action: 'replay' };

  if (queue.index + 1 < queue.order.length) {
    return { queue: { ...queue, index: queue.index + 1 }, action: 'play' };
  }
  if (queue.repeat !== 'off') return { queue: { ...queue, index: 0 }, action: 'play' };
  return { queue, action: 'stop' };
}

/** Seconds into a song past which "previous" restarts it instead of going back. */
export const RESTART_THRESHOLD_SEC = 3;

/**
 * Move back, the way every music player does: a few seconds in, "previous"
 * restarts the current song; right at the start it goes to the previous one.
 */
export function retreat(
  queue: QueueState,
  positionSec: number
): { queue: QueueState; action: QueueAction } {
  if (queue.index < 0) return { queue, action: 'stop' };
  if (positionSec > RESTART_THRESHOLD_SEC) return { queue, action: 'replay' };

  if (queue.index > 0) return { queue: { ...queue, index: queue.index - 1 }, action: 'play' };
  if (queue.repeat === 'all' && queue.order.length > 1) {
    return { queue: { ...queue, index: queue.order.length - 1 }, action: 'play' };
  }
  return { queue, action: 'replay' };
}

/**
 * The songs a skip either way would reach from the start of the current one,
 * by the same rules as the buttons: what the lock screen keeps ready.
 */
export function neighbours(queue: QueueState): { previous: number | null; next: number | null } {
  const forward = advance(queue, 'skip');
  const back = retreat(queue, 0);
  return {
    previous: back.action === 'play' ? currentId(back.queue) : null,
    next: forward.action === 'play' ? currentId(forward.queue) : null,
  };
}

export function jumpTo(queue: QueueState, index: number): QueueState {
  if (index < 0 || index >= queue.order.length) return queue;
  return { ...queue, index };
}

/**
 * Toggle shuffle without interrupting playback: the current song keeps playing
 * either way. On, it leads a freshly shuffled order; off, the original order
 * resumes from wherever that song sits in it.
 */
export function setShuffle(queue: QueueState, on: boolean, options: ShuffleOptions = {}): QueueState {
  if (on === queue.shuffled) return queue;
  const current = currentId(queue);

  if (on) {
    const order = shuffleAround(queue.original, current, options);
    return { ...queue, order, index: current === null ? -1 : 0, shuffled: true };
  }
  return {
    ...queue,
    order: queue.original,
    index: current === null ? -1 : queue.original.indexOf(current),
    shuffled: false,
  };
}

const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };

export function cycleRepeat(queue: QueueState): QueueState {
  return { ...queue, repeat: NEXT_REPEAT[queue.repeat] };
}

/** The next `count` songs, honoring repeat-all wraparound. */
export function upNext(queue: QueueState, count: number): number[] {
  if (queue.index < 0) return [];
  const out: number[] = [];
  for (let step = 1; step <= count; step++) {
    const i = queue.index + step;
    if (i < queue.order.length) out.push(queue.order[i]);
    else if (queue.repeat === 'all' && queue.order.length > 1) {
      out.push(queue.order[i % queue.order.length]);
    } else break;
  }
  return out;
}
