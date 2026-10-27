import { fisherYates } from './queue';

/** One ingredient's songs in a tuned shuffle, with its share multiplier (see query/tuning.ts). */
export interface Stream {
  ids: readonly number[];
  share: number;
}

/** The longest a woven order runs, whatever the shares. */
const LIMIT = 2000;

/**
 * Weave a tuned mix into one play order. Each ingredient keeps to its share
 * (its size × its multiplier) all the way through, not just on average: each
 * is due again a share's width after its last song, give or take a random
 * nudge, and the most overdue plays next. So a 25% ingredient is a quarter of
 * any stretch, spaced unevenly enough not to feel regular. The order runs
 * until every song has played; an ingredient that runs out first reshuffles
 * and goes round again, so its share holds to the end. With `first`, that
 * song leads, counted as its ingredient's first.
 */
export function weave(
  streams: readonly Stream[],
  { random = Math.random, first = null }: { random?: () => number; first?: number | null } = {}
): number[] {
  const live = streams.filter((s) => s.ids.length > 0);
  const decks = live.map((s) => fisherYates(s.ids, random));
  const used = live.map(() => 0);
  /** Whether each has played all its songs at least once. */
  const done = live.map(() => false);
  const played = live.map(() => 0);
  const weight = (k: number) => live[k].ids.length * live[k].share;
  // When each is next due: its plays so far, plus a nudge, over its weight.
  const nudge = live.map(() => random());
  const due = (k: number) => (played[k] + nudge[k]) / weight(k);
  const out: number[] = [];
  const take = (k: number) => {
    if (used[k] === decks[k].length) {
      decks[k] = fisherYates(live[k].ids, random);
      used[k] = 0;
    }
    out.push(decks[k][used[k]++]);
    played[k]++;
    if (used[k] === decks[k].length) done[k] = true;
  };
  if (first !== null) {
    const k = live.findIndex((s) => s.ids.includes(first));
    if (k >= 0) {
      decks[k] = [first, ...decks[k].filter((id) => id !== first)];
      take(k);
    }
  }
  while (out.length < LIMIT && !done.every(Boolean)) {
    const pick = live.reduce((best, _, k) => (due(k) < due(best) ? k : best), 0);
    nudge[pick] = random();
    take(pick);
  }
  return out;
}
