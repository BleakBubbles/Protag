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
 * Weave a tuned mix into one play order. Each next song comes from an
 * ingredient picked in proportion to its share (its size × its tuning, so an
 * untuned mix is a plain shuffle), among those with songs left. One that
 * repeats reshuffles and goes round again; the order ends once every
 * ingredient that doesn't repeat has played all its songs. With `first`, that
 * song leads, counted as its ingredient's first.
 */
export function weave(
  streams: readonly Stream[],
  { random = Math.random, first = null }: { random?: () => number; first?: number | null } = {}
): number[] {
  const live = streams.filter((s) => s.ids.length > 0);
  const decks = live.map((s) => fisherYates(s.ids, random));
  const used = live.map(() => 0);
  const out: number[] = [];
  if (first !== null) {
    const k = live.findIndex((s) => s.ids.includes(first));
    if (k >= 0) {
      decks[k] = [first, ...decks[k].filter((id) => id !== first)];
      used[k] = 1;
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
    const weight = (k: number) => live[k].ids.length * live[k].share;
    let x = random() * open.reduce((sum, k) => sum + weight(k), 0);
    let pick = open[open.length - 1];
    for (const k of open) {
      x -= weight(k);
      if (x < 0) {
        pick = k;
        break;
      }
    }
    if (!left(pick)) {
      decks[pick] = fisherYates(live[pick].ids, random);
      used[pick] = 0;
    }
    out.push(decks[pick][used[pick]++]);
  }
  return out;
}
