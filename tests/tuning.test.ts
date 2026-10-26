import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDraft } from '../src/db/mixes.ts';
import { weave } from '../src/player/weave.ts';
import { goesRound, isTuned, PLAIN, setTuning, tuningOf, untuned } from '../src/query/tuning.ts';
import { mapDraftTags, sameDraft, type QueryDraft } from '../src/query/types.ts';

/** Deterministic "random" so weaves are reproducible. */
function seeded(seed = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const pot: QueryDraft = { ingredients: [[1], [2, 3], ['artist:IU']], exclude: [], includeDescendants: true };
const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);

test('an ingredient is tuned by its refs, whatever their order', () => {
  const d = setTuning(pot, [3, 2], { share: 4, repeats: false });
  assert.deepEqual(tuningOf(d, [2, 3]), { share: 4, repeats: false });
  assert.deepEqual(tuningOf(d, [1]), PLAIN);
  assert.equal(isTuned(d), true);
});

test('only what differs from plain is kept, and only for ingredients still there', () => {
  const d = setTuning(setTuning(pot, [1], { share: 2, repeats: false }), [1], PLAIN);
  assert.equal(d.tuning, undefined, 'back to plain leaves no trace');
  assert.equal(isTuned(d), false);
  const gone = setTuning({ ...pot, tuning: [{ refs: [99], share: 2, repeats: false }] }, [1], { share: 0.5, repeats: false });
  assert.deepEqual(gone.tuning, [{ refs: [1], share: 0.5, repeats: false }]);
  assert.equal(untuned(gone).tuning, undefined);
});

test('a single ingredient has nothing to weigh, so it never counts as tuned', () => {
  const one: QueryDraft = { ...pot, ingredients: [[1]] };
  assert.equal(isTuned(setTuning(one, [1], { share: 4, repeats: false })), false);
});

test('raised above its natural share, an ingredient always goes round again', () => {
  assert.equal(goesRound({ share: 2, repeats: false }), true);
  assert.equal(goesRound({ share: 1, repeats: false }), false);
  assert.equal(goesRound({ share: 0.5, repeats: true }), true);
});

test('tuning saves and reads back with the mix, and malformed tuning is dropped', () => {
  const d = setTuning(pot, ['artist:IU'], { share: 0.25, repeats: true });
  assert.deepEqual(parseDraft(JSON.stringify(d)), d);
  const bad = parseDraft(JSON.stringify({ ...pot, tuning: [{ refs: [1], share: 3 }, { refs: 'x', share: 2 }, null] }));
  assert.equal(bad.tuning, undefined);
});

test('tuning counts towards whether two mixes are the same', () => {
  assert.equal(sameDraft(pot, setTuning(pot, [1], { share: 2, repeats: false })), false);
  assert.equal(sameDraft(setTuning(pot, [2, 3], { share: 2, repeats: false }), setTuning(pot, [3, 2], { share: 2, repeats: false })), true);
});

test('tuning follows its ingredient through tag-id changes (a restored backup), and drops if the ingredient lost a tag', () => {
  const d = setTuning(setTuning(pot, [2, 3], { share: 2, repeats: false }), [1], { share: 4, repeats: false });
  const mapped = mapDraftTags(d, (id) => (id === 3 ? null : id + 100));
  assert.deepEqual(mapped.ingredients, [[101], [102], ['artist:IU']]);
  assert.deepEqual(mapped.tuning, [{ refs: [101], share: 4, repeats: false }]);
});

test('an untuned weave plays every song once', () => {
  const order = weave([{ ids: range(1, 30), share: 1, repeats: false }, { ids: range(100, 5), share: 1, repeats: false }], { random: seeded() });
  assert.equal(order.length, 35);
  assert.deepEqual([...order].sort((a, b) => a - b), [...range(1, 30), ...range(100, 5)]);
});

test('a raised ingredient that repeats keeps its share all the way through', () => {
  const order = weave(
    [
      { ids: range(1, 90), share: 1, repeats: false },
      { ids: range(100, 10), share: 9, repeats: true },
    ],
    { random: seeded(7) }
  );
  // The big one plays each song once; the small one, with an equal share, about as often.
  assert.equal(order.filter((id) => id < 100).length, 90);
  const small = order.filter((id) => id >= 100).length;
  assert.ok(small > 60 && small < 120, `small played ${small} times`);
  const lastHalf = order.slice(order.length / 2);
  assert.ok(lastHalf.some((id) => id >= 100), 'still there at the end');
});

test('a song asked to lead does, once', () => {
  const order = weave([{ ids: [1, 2, 3], share: 1, repeats: false }, { ids: [4, 5], share: 1, repeats: false }], { random: seeded(), first: 5 });
  assert.equal(order[0], 5);
  assert.deepEqual([...order].sort(), [1, 2, 3, 4, 5]);
});

test('nothing but repeating ingredients still ends', () => {
  const order = weave([{ ids: [1, 2], share: 1, repeats: true }, { ids: [3], share: 1, repeats: true }], { random: seeded() });
  assert.ok(order.length > 3 && order.length <= 2000);
});

test('an empty ingredient is skipped', () => {
  assert.deepEqual(weave([{ ids: [], share: 8, repeats: true }, { ids: [1], share: 1, repeats: false }]), [1]);
});

test('a share holds over a short stretch, not just on average', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const order = weave(
      [
        { ids: range(1, 18), share: 1, repeats: false },
        { ids: range(100, 4), share: 2, repeats: true },
        { ids: range(200, 6), share: 1, repeats: false },
      ],
      { random: seeded(seed) }
    );
    // lofi is 8 / (18 + 8 + 6) = 25%: a quarter of the first 20, give or take one.
    const lofi = order.slice(0, 20).filter((id) => id >= 100 && id < 200).length;
    assert.ok(lofi >= 4 && lofi <= 6, `seed ${seed}: ${lofi} of 20`);
  }
});
