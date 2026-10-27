import test from 'node:test';
import assert from 'node:assert/strict';

import { freshDatabase } from './helpers/db.ts';
import { deleteMix, keepPot, listMixes, MixError, parseDraft, parseKeptPot, renameMix, saveMix, saveMixAs } from '../src/db/mixes.ts';
import { EMPTY_DRAFT, sameDraft, type QueryDraft } from '../src/query/types.ts';

const driving = { ...EMPTY_DRAFT, ingredients: [[1]], exclude: [2] };

test('a mix saves its draft and loads it back for editing', async () => {
  const db = await freshDatabase();
  await saveMix(db as never, '  Night drive ', driving);
  const [mix] = await listMixes(db as never);
  assert.equal(mix.name, 'Night drive', 'trimmed');
  assert.deepEqual(mix.draft, driving);
  db.close();
});

test('saving to an existing name updates that mix instead of adding one', async () => {
  const db = await freshDatabase();
  const id = await saveMix(db as never, 'Gym', driving);
  const again = await saveMix(db as never, 'gym', { ...driving, ingredients: [[1], [3]] });
  assert.equal(again, id);
  const mixes = await listMixes(db as never);
  assert.equal(mixes.length, 1);
  assert.deepEqual(mixes[0].draft.ingredients, [[1], [3]]);
  db.close();
});

test('saving as a name refuses another mix, but updates the one being edited', async () => {
  const db = await freshDatabase();
  const gym = await saveMix(db as never, 'Gym', driving);
  await assert.rejects(() => saveMixAs(db as never, 'gym ', driving, null), MixError);
  const updated = { ...driving, ingredients: [[5]] };
  assert.equal(await saveMixAs(db as never, 'GYM', updated, gym), gym);
  assert.deepEqual((await listMixes(db as never))[0].draft, updated);
  db.close();
});

test('the same draft in another order is the same mix', () => {
  const a = { ...EMPTY_DRAFT, ingredients: [[1, 2], [3]], exclude: [5, 4] };
  const b = { ...EMPTY_DRAFT, ingredients: [[3], [2, 1]], exclude: [4, 5] };
  assert.ok(sameDraft(a, b));
  assert.ok(!sameDraft(a, { ...b, ingredients: [[3], [2]] }));
});

test('renaming refuses a name another mix has; deleting removes it', async () => {
  const db = await freshDatabase();
  const gym = await saveMix(db as never, 'Gym', driving);
  await saveMix(db as never, 'Chill', driving);
  await assert.rejects(() => renameMix(db as never, gym, 'chill'), MixError);
  await assert.rejects(() => saveMix(db as never, '   ', driving), MixError);
  await renameMix(db as never, gym, 'Lifting');
  await deleteMix(db as never, gym);
  assert.deepEqual((await listMixes(db as never)).map((m) => m.name), ['Chill']);
  db.close();
});

test('a damaged stored draft loads as an empty mix rather than crashing', () => {
  assert.deepEqual(parseDraft('{oops'), EMPTY_DRAFT);
  assert.deepEqual(parseDraft('{"ingredients":[[1,"x"],[]],"exclude":"no"}'), { ...EMPTY_DRAFT, ingredients: [[1]] });
  // Artists and albums survive a round trip; anything else that's a string doesn't.
  assert.deepEqual(parseDraft('{"ingredients":[["artist:IU",2],["album:9","genre:x"]],"exclude":["artist:SZA"]}'), {
    ...EMPTY_DRAFT,
    ingredients: [['artist:IU', 2], ['album:9']],
    exclude: ['artist:SZA'],
  });
});

test('the pot comes back as it was kept, and a damaged one comes back empty', () => {
  const before = { ...EMPTY_DRAFT, ingredients: [[4]] } as QueryDraft;
  const pot = { draft: { ...EMPTY_DRAFT, ingredients: [[1, 'artist:IU']], exclude: [3] } as QueryDraft, editing: 7, before };
  assert.deepEqual(parseKeptPot(keepPot(pot)), pot);
  assert.deepEqual(parseKeptPot(null), { draft: EMPTY_DRAFT, editing: null, before: null });
  assert.deepEqual(parseKeptPot('{oops'), { draft: EMPTY_DRAFT, editing: null, before: null });
  assert.deepEqual(parseKeptPot('{"draft":{"ingredients":[[2]]},"editing":"x","before":{"ingredients":[[4]]}}'), {
    draft: { ...EMPTY_DRAFT, ingredients: [[2]] },
    editing: null,
    before: null,
  });
});

test('mixes saved before the pot open as ingredients', () => {
  const all = '{"include":[1,2],"exclude":[3],"includeDescendants":true,"mode":"and"}';
  assert.deepEqual(parseDraft(all), { ...EMPTY_DRAFT, ingredients: [[1, 2]], exclude: [3] });
  assert.deepEqual(parseDraft('{"include":[1,2],"mode":"or"}'), { ...EMPTY_DRAFT, ingredients: [[1], [2]] });
  assert.deepEqual(parseDraft('{"include":[1,"x"],"mode":"weird"}'), { ...EMPTY_DRAFT, ingredients: [[1]] });
});
