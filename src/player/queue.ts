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
  /** The ways it may shuffle, if not all of them (see `shuffleModesOf`). */
  modes?: readonly ShuffleMode[];
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
  /** Shuffled by album (each album whole, in track order) rather than by song. Only meaningful when `shuffled`. */
  byAlbum: boolean;
  repeat: RepeatMode;
  source: QueueSource | null;
  /**
   * Songs the listener queued (Play next, Add to queue) sit right after the
   * current song, up to here (exclusive index into `order`). They aren't in
   * `original`: they're extra, and stay next whatever happens to shuffle.
   */
  queuedEnd: number;
}

/** How a queue shuffles: not at all, song by song, or album by album. */
export type ShuffleMode = 'off' | 'songs' | 'albums';

export const shuffleModeOf = (queue: QueueState): ShuffleMode =>
  !queue.shuffled ? 'off' : queue.byAlbum ? 'albums' : 'songs';

const ALL_MODES: readonly ShuffleMode[] = ['off', 'songs', 'albums'];
/** An artist: no order of their own worth playing straight through (not knowing release years), but whole albums. */
export const ARTIST_MODES: readonly ShuffleMode[] = ['songs', 'albums'];

/**
 * The ways a queue may shuffle. "Off" only where there's an order of its own
 * to play in: an album, a list as shown. A tag combination (a mix, the pot)
 * only shuffles by song, like any music app's playlist: there's no order to
 * play it in (A–Z by title is no way to listen), and its songs are a few from
 * each album at most, so shuffling by album would only make scattered
 * clusters. Album shuffle belongs where albums are whole: an artist, the
 * whole library.
 */
export const shuffleModesOf = (source: QueueSource | null | undefined): readonly ShuffleMode[] =>
  source?.draft ? ['songs'] : (source?.modes ?? ALL_MODES);

export const EMPTY_QUEUE: QueueState = {
  order: [],
  original: [],
  index: -1,
  shuffled: false,
  byAlbum: false,
  repeat: 'off',
  source: null,
  queuedEnd: 0,
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
 * Albums in random order, each whole and in its own order: `groups` are the
 * songs grouped by album, each in track order (a song without an album is a
 * group of one, so it's shuffled in among them). With `current`, its album
 * comes first, whole, so the song plays on with its album around it.
 */
export function shuffleAlbums(
  groups: readonly (readonly number[])[],
  current: number | null,
  { random = Math.random, strategy = fisherYates }: ShuffleOptions = {}
): number[] {
  const lead = current === null ? -1 : groups.findIndex((group) => group.includes(current));
  const rest = groups.filter((_, i) => i !== lead);
  // The strategy shuffles ids, so shuffle the groups' positions and map back.
  const shuffled = strategy(
    rest.map((_, i) => i),
    random
  ).map((i) => rest[i]);
  return [...(lead >= 0 ? groups[lead] : []), ...shuffled.flat()];
}

/**
 * Build a queue. With `startId`, that song plays first — shuffled or not. Without
 * it, an unshuffled queue starts at the top and a shuffled one at a random song.
 * Shuffled `byAlbum` (given `groups`), the start's album plays whole around it.
 */
export function createQueue(
  ids: readonly number[],
  options: {
    startId?: number;
    shuffle?: boolean;
    /** Shuffle album by album; needs `groups`, else it's by song. */
    byAlbum?: boolean;
    groups?: readonly (readonly number[])[];
    source?: QueueSource | null;
    repeat?: RepeatMode;
  } & ShuffleOptions = {}
): QueueState {
  const original = [...ids];
  const start = options.startId !== undefined && original.includes(options.startId)
    ? options.startId
    : null;
  // A tag combination has no order of its own to play in, so it always shuffles.
  const modes = shuffleModesOf(options.source);
  const shuffled = (options.shuffle ?? false) || !modes.includes('off');
  const byAlbum = shuffled && modes.includes('albums') && !!options.byAlbum && !!options.groups;
  const order = !shuffled
    ? original
    : byAlbum
      ? shuffleAlbums(options.groups!, start, options)
      : shuffleAround(original, start, options);

  return {
    order,
    original,
    index: order.length === 0 ? -1 : start === null ? 0 : order.indexOf(start),
    shuffled,
    byAlbum,
    repeat: options.repeat ?? 'off',
    source: options.source ?? null,
    queuedEnd: 0,
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

export function jumpTo(queue: QueueState, index: number): QueueState {
  if (index < 0 || index >= queue.order.length) return queue;
  return { ...queue, index };
}

/**
 * Change how the queue shuffles without interrupting playback: the current
 * song keeps playing in every mode.
 * - `songs`: it leads a freshly shuffled order.
 * - `albums`: albums play in random order, each start to finish; the current
 *   song's album comes first, from where it is, its earlier tracks behind it.
 *   Needs `groups` (see `shuffleAlbums`); without them it shuffles songs.
 * - `off`: the original order resumes from wherever that song sits in it.
 * Songs still queued (see `queueSongs`) stay right after it.
 */
export function setShuffleMode(
  queue: QueueState,
  mode: ShuffleMode,
  options: ShuffleOptions & { groups?: readonly (readonly number[])[] } = {}
): QueueState {
  if (mode === shuffleModeOf(queue)) return queue;
  const current = currentId(queue);
  // A queued song playing now isn't part of the source order: the new order leads with it.
  const lead = current !== null && queue.original.includes(current) ? current : null;

  let base: number[];
  if (mode === 'albums' && options.groups) base = shuffleAlbums(options.groups, lead, options);
  else if (mode !== 'off') base = shuffleAround(queue.original, lead, options);
  else base = queue.original;
  const shuffled = mode !== 'off';
  const byAlbum = mode === 'albums' && !!options.groups;

  // Songs still queued come straight after the current one in the new order too.
  const queued = queue.order.slice(queue.index + 1, Math.max(queue.index + 1, queue.queuedEnd));
  const at = lead === null ? -1 : base.indexOf(lead);
  const order =
    current === null
      ? base
      : at < 0
        ? [current, ...queued, ...base]
        : [...base.slice(0, at + 1), ...queued, ...base.slice(at + 1)];
  const index = current === null ? -1 : Math.max(at, 0);
  return { ...queue, order, index, shuffled, byAlbum, queuedEnd: index + 1 + queued.length };
}

/**
 * Queue songs to play straight after the current one, ahead of anything
 * queued before ("Play next"), or after what's already queued ("Add to
 * queue") — either way before the rest of the order, which in a long shuffle
 * may never come round. `at` is where they went in `order`. An empty queue
 * stays empty: there's nothing to play them after.
 */
export function queueSongs(
  queue: QueueState,
  ids: readonly number[],
  where: 'next' | 'last'
): { queue: QueueState; at: number } {
  if (queue.index < 0 || ids.length === 0) return { queue, at: -1 };
  const end = Math.max(queue.index + 1, queue.queuedEnd);
  const at = where === 'next' ? queue.index + 1 : end;
  const order = [...queue.order.slice(0, at), ...ids, ...queue.order.slice(at)];
  return { queue: { ...queue, order, queuedEnd: end + ids.length }, at };
}

/**
 * Take an upcoming song out of the queue (`at`, after the current one). A
 * song the listener queued just goes; one from the source leaves `original`
 * too, so turning shuffle off or on doesn't bring it back.
 */
export function removeUpcoming(queue: QueueState, at: number): QueueState {
  if (at <= queue.index || at >= queue.order.length) return queue;
  const queued = at < queue.queuedEnd;
  const order = queue.order.filter((_, i) => i !== at);
  let original = queue.original;
  if (!queued) {
    const i = original.indexOf(queue.order[at]);
    if (i >= 0) original = original.filter((_, j) => j !== i);
  }
  return { ...queue, order, original, queuedEnd: queued ? queue.queuedEnd - 1 : queue.queuedEnd };
}

/** Shuffle on (songs) or off: what shuffling meant before albums. */
export function setShuffle(queue: QueueState, on: boolean, options: ShuffleOptions = {}): QueueState {
  return setShuffleMode(queue, on ? 'songs' : 'off', options);
}

const NEXT_SHUFFLE: Record<ShuffleMode, ShuffleMode> = { off: 'songs', songs: 'albums', albums: 'off' };

/**
 * What the shuffle button does: off → songs → albums → off, like repeat's
 * cycle, skipping any the queue doesn't allow (see `shuffleModesOf`).
 */
export function nextShuffleMode(mode: ShuffleMode, modes: readonly ShuffleMode[] = ALL_MODES): ShuffleMode {
  let next = NEXT_SHUFFLE[mode];
  for (let i = 0; i < 3 && !modes.includes(next); i++) next = NEXT_SHUFFLE[next];
  return modes.includes(next) ? next : mode;
}

const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };

/** What the repeat button does: off → all → one → off. */
export const nextRepeatMode = (mode: RepeatMode) => NEXT_REPEAT[mode];

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
