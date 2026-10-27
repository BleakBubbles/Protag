import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDraft } from '../src/db/mixes.ts';
import { weave } from '../src/player/weave.ts';
import { isTuned, PLAIN, repeatsIn, setTuning, tuningOf, untuned } from '../src/query/tuning.ts';
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
const count = (order: number[], from: number, to: number) => order.filter((id) => id >= from && id < to).length;

test('an ingredient is tuned by its refs, whatever their order', () => {
  const d = setTuning(pot, [3, 2], { share: 4 });
  assert.deepEqual(tuningOf(d, [2, 3]), { share: 4 });
  assert.deepEqual(tuningOf(d, [1]), PLAIN);
  assert.equal(isTuned(d), true);
});

test('only what differs from plain is kept, and only for ingredients still there', () => {
  const d = setTuning(setTuning(pot, [1], { share: 2 }), [1], PLAIN);
  assert.equal(d.tuning, undefined, 'back to plain leaves no trace');
  assert.equal(isTuned(d), false);
  const gone = setTuning({ ...pot, tuning: [{ refs: [99], share: 2 }] }, [1], { share: 0.5 });
  assert.deepEqual(gone.tuning, [{ refs: [1], share: 0.5 }]);
  assert.equal(untuned(gone).tuning, undefined);
});

test('a single ingredient has nothing to weigh, so it never counts as tuned', () => {
  const one: QueryDraft = { ...pot, ingredients: [[1]] };
  assert.equal(isTuned(setTuning(one, [1], { share: 4 })), false);
});

test('every ingredient above the lowest multiplier goes round again; untuned, none do', () => {
  assert.equal(repeatsIn(pot, [1]), false);
  const raised = setTuning(pot, [1], { share: 4 });
  assert.equal(repeatsIn(raised, [1]), true);
  assert.equal(repeatsIn(raised, [2, 3]), false);
  const lowered = setTuning(pot, ['artist:IU'], { share: 0.5 });
  assert.equal(repeatsIn(lowered, ['artist:IU']), false, 'the lowest lasts longest');
  assert.equal(repeatsIn(lowered, [1]), true);
});

test('tuning saves and reads back with the mix; malformed tuning, and the old repeats flag, are dropped', () => {
  const d = setTuning(pot, ['artist:IU'], { share: 0.25 });
  assert.deepEqual(parseDraft(JSON.stringify(d)), d);
  const bad = parseDraft(JSON.stringify({ ...pot, tuning: [{ refs: [1], share: 3 }, { refs: 'x', share: 2 }, null] }));
  assert.equal(bad.tuning, undefined);
  const old = parseDraft(JSON.stringify({ ...pot, tuning: [{ refs: [1], share: 2, repeats: true }] }));
  assert.deepEqual(old.tuning, [{ refs: [1], share: 2 }]);
});

test('tuning counts towards whether two mixes are the same', () => {
  assert.equal(sameDraft(pot, setTuning(pot, [1], { share: 2 })), false);
  assert.equal(sameDraft(setTuning(pot, [2, 3], { share: 2 }), setTuning(pot, [3, 2], { share: 2 })), true);
});

test('tuning follows its ingredient through tag-id changes (a restored backup), and drops if the ingredient lost a tag', () => {
  const d = setTuning(setTuning(pot, [2, 3], { share: 2 }), [1], { share: 4 });
  const mapped = mapDraftTags(d, (id) => (id === 3 ? null : id + 100));
  assert.deepEqual(mapped.ingredients, [[101], [102], ['artist:IU']]);
  assert.deepEqual(mapped.tuning, [{ refs: [101], share: 4 }]);
});

test('a weave plays every song, and at even shares hardly anything twice', () => {
  const order = weave([{ ids: range(1, 30), share: 1 }, { ids: range(100, 5), share: 1 }], { random: seeded() });
  for (const id of [...range(1, 30), ...range(100, 5)]) assert.ok(order.includes(id), `${id} played`);
  assert.ok(order.length <= 37, `${order.length} plays for 35 songs`);
});

test('a raised ingredient keeps its share to the end, going round again', () => {
  const order = weave([{ ids: range(1, 90), share: 1 }, { ids: range(100, 10), share: 9 }], { random: seeded(7) });
  // The big one plays each song once; the small one, with an equal share, about as often.
  assert.equal(count(order, 1, 100), 90);
  const small = count(order, 100, 200);
  assert.ok(small >= 85 && small <= 95, `small played ${small} times`);
  assert.ok(count(order.slice(-20), 100, 200) >= 8, 'still half of the last stretch');
});

test('a lowered ingredient lasts longest, and the others go round again so its share holds to the end', () => {
  const order = weave([{ ids: range(1, 40), share: 0.5 }, { ids: range(100, 20), share: 1 }], { random: seeded(3) });
  // 40 × ½ = 20 against 20: half each, all the way, until all 40 have played.
  assert.equal(count(order, 1, 100), 40);
  assert.ok(Math.abs(count(order, 100, 200) - 40) <= 1);
  assert.ok(count(order.slice(-20), 100, 200) >= 9, 'no stretch of only the lowered one at the end');
});

test('a share holds over a short stretch, not just on average', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const order = weave(
      [
        { ids: range(1, 18), share: 1 },
        { ids: range(100, 4), share: 2 },
        { ids: range(200, 6), share: 1 },
      ],
      { random: seeded(seed) }
    );
    // The middle one is 8 / (18 + 8 + 6) = 25%: a quarter of the first 20, give or take one.
    const middle = count(order.slice(0, 20), 100, 200);
    assert.ok(middle >= 4 && middle <= 6, `seed ${seed}: ${middle} of 20`);
  }
});

test('a song asked to lead does, once', () => {
  const order = weave([{ ids: [1, 2, 3], share: 1 }, { ids: [4, 5], share: 1 }], { random: seeded(), first: 5 });
  assert.equal(order[0], 5);
  assert.equal(order.filter((id) => id === 5).length, 1);
});

test('an empty ingredient is skipped', () => {
  assert.deepEqual(weave([{ ids: [], share: 8 }, { ids: [1], share: 1 }]), [1]);
});
