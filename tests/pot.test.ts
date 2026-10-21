import test from 'node:test';
import assert from 'node:assert/strict';

import { dropInPot, tapExcluded, tapIngredient, tapTag } from '../src/query/pot.ts';
import { EMPTY_DRAFT, tagChoice, type QueryDraft } from '../src/query/types.ts';

const pot = (ingredients: number[][], exclude: number[] = []): QueryDraft => ({
  ...EMPTY_DRAFT,
  ingredients,
  exclude,
});

test('tapping a tile puts it in the pot on its own, and tapping again takes it out', () => {
  let draft = tapTag(EMPTY_DRAFT, 1);
  draft = tapTag(draft, 2);
  assert.deepEqual(draft, pot([[1], [2]]));
  assert.equal(tagChoice(draft, 1), 'include');
  assert.deepEqual(tapTag(pot([[1, 2]]), 1), pot([[2]]), 'out of a combination too');
  assert.deepEqual(tapTag(pot([], [3]), 3), EMPTY_DRAFT, 'an excluded tile clears');
});

test('tapping a combined ingredient splits it in place; a single one goes back', () => {
  assert.deepEqual(tapIngredient(pot([[9], [1, 2], [8]]), 1), pot([[9], [1], [2], [8]]));
  assert.deepEqual(tapIngredient(pot([[9], [1]]), 1), pot([[9]]));
  assert.deepEqual(tapExcluded(pot([[1]], [3]), 3), pot([[1]]));
});

test('dropping onto an ingredient combines, keeping its place', () => {
  // Ingredient onto ingredient, either direction.
  assert.deepEqual(
    dropInPot(pot([[1], [2], [3]]), { kind: 'ingredient', index: 0 }, { kind: 'ingredient', index: 2 }),
    pot([[2], [3, 1]])
  );
  assert.deepEqual(
    dropInPot(pot([[1], [2], [3]]), { kind: 'ingredient', index: 2 }, { kind: 'ingredient', index: 0 }),
    pot([[1, 3], [2]])
  );
  // A tile from the grid, even one already elsewhere in the pot or excluded.
  assert.deepEqual(
    dropInPot(pot([[1], [2]]), { kind: 'tile', ref: 5 }, { kind: 'ingredient', index: 1 }),
    pot([[1], [2, 5]])
  );
  assert.deepEqual(
    dropInPot(pot([[1], [2]]), { kind: 'tile', ref: 1 }, { kind: 'ingredient', index: 1 }),
    pot([[2, 1]])
  );
  assert.deepEqual(
    dropInPot(pot([[1]], [4]), { kind: 'excluded', ref: 4 }, { kind: 'ingredient', index: 0 }),
    pot([[1, 4]])
  );
  // Onto itself, or onto a combination that already has it: nothing changes.
  const same = pot([[1, 2]]);
  assert.equal(dropInPot(same, { kind: 'ingredient', index: 0 }, { kind: 'ingredient', index: 0 }), same);
  assert.equal(dropInPot(same, { kind: 'tile', ref: 2 }, { kind: 'ingredient', index: 0 }), same);
});

test('dropping into the pot adds; into Keep out excludes; outside takes out', () => {
  assert.deepEqual(dropInPot(pot([[1]]), { kind: 'tile', ref: 2 }, { kind: 'pot' }), pot([[1], [2]]));
  assert.deepEqual(dropInPot(pot([], [2]), { kind: 'excluded', ref: 2 }, { kind: 'pot' }), pot([[2]]));
  const inCombo = pot([[1, 2]]);
  assert.equal(dropInPot(inCombo, { kind: 'tile', ref: 2 }, { kind: 'pot' }), inCombo, 'already in the pot');

  assert.deepEqual(dropInPot(pot([[1], [2]]), { kind: 'ingredient', index: 0 }, { kind: 'keepOut' }), pot([[2]], [1]));
  assert.deepEqual(dropInPot(pot([[1, 2]]), { kind: 'tile', ref: 2 }, { kind: 'keepOut' }), pot([[1]], [2]));
  assert.equal(
    dropInPot(inCombo, { kind: 'ingredient', index: 0 }, { kind: 'keepOut' }),
    inCombo,
    'a combination snaps back'
  );

  assert.deepEqual(dropInPot(pot([[1], [2]]), { kind: 'ingredient', index: 0 }, null), pot([[2]]));
  assert.deepEqual(dropInPot(pot([[1]], [2]), { kind: 'excluded', ref: 2 }, null), pot([[1]]));
  const draft = pot([[1]]);
  assert.equal(dropInPot(draft, { kind: 'tile', ref: 1 }, null), draft, 'a tile dragged off just goes back');
});
