import { fisherYates } from './queue';

/** One ingredient's songs in a tuned shuffle, with how it plays (see query/tuning.ts). */
export interface Stream {
  ids: readonly number[];
  share: number;
  /** Goes round again until the others run out (always, once raised above its natural share). */
  repeats: boolean;
}

/** The longest a shuffle of nothing but repeating ingredients runs before it ends. */
const ENDLESS_LIMIT = 2000;

/**
 * Weave a tuned mix into one play order. Each ingredient keeps to its share
 * (its size × its tuning) all the way through, not just on average: each is
 * due again a share's width after its last song, give or take a random
 * nudge, and the most overdue plays next. So a 25% ingredient is a quarter of
 * any stretch, spaced unevenly enough not to feel regular. One that repeats
 * reshuffles and goes round again; the order ends once every ingredient that
 * doesn't repeat has played all its songs. With `first`, that song leads,
 * counted as its ingredient's first.
 */
export function weave(
  streams: readonly Stream[],
  { random = Math.random, first = null }: { random?: () => number; first?: number | null } = {}
): number[] {
  const live = streams.filter((s) => s.ids.length > 0);
  const decks = live.map((s) => fisherYates(s.ids, random));
  const used = live.map(() => 0);
  const played = live.map(() => 0);
  const weight = (k: number) => live[k].ids.length * live[k].share;
  // When each is next due: its plays so far, plus a nudge, over its weight.
  const nudge = live.map(() => random());
  const due = (k: number) => (played[k] + nudge[k]) / weight(k);
  const out: number[] = [];
  if (first !== null) {
    const k = live.findIndex((s) => s.ids.includes(first));
    if (k >= 0) {
      decks[k] = [first, ...decks[k].filter((id) => id !== first)];
      used[k] = 1;
      played[k] = 1;
      out.push(first);
    }
  }
  const total = live.reduce((n, s) => n + s.ids.length, 0);
  const limit = Math.min(ENDLESS_LIMIT, Math.max(total * 3, 300));
  const left = (k: number) => used[k] < decks[k].length;
  // With nothing that runs out, only the limit ends it.
  const endless = live.every((s) => s.repeats);

  while (out.length < limit) {
    if (!endless && live.every((s, k) => s.repeats || !left(k))) break;
    const open = live.map((_, k) => k).filter((k) => left(k) || live[k].repeats);
    const pick = open.reduce((best, k) => (due(k) < due(best) ? k : best));
    played[pick]++;
    nudge[pick] = random();
    if (!left(pick)) {
      decks[pick] = fisherYates(live[pick].ids, random);
      used[pick] = 0;
    }
    out.push(decks[pick][used[pick]++]);
  }
  return out;
}
