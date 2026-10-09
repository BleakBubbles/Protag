import test from 'node:test';
import assert from 'node:assert/strict';

import { freshDatabase } from './helpers/db.ts';
import { deleteMix, listMixes, MixError, parseDraft, renameMix, saveMix } from '../src/db/mixes.ts';
import { EMPTY_DRAFT } from '../src/query/types.ts';

const driving = { ...EMPTY_DRAFT, include: [1], exclude: [2] };

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
  const again = await saveMix(db as never, 'gym', { ...driving, mode: 'or' });
  assert.equal(again, id);
  const mixes = await listMixes(db as never);
  assert.equal(mixes.length, 1);
  assert.equal(mixes[0].draft.mode, 'or');
  db.close();
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
  assert.deepEqual(parseDraft('{"include":[1,"x"],"mode":"weird"}'), { ...EMPTY_DRAFT, include: [1] });
});
