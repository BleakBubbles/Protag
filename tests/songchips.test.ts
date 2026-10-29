import test from 'node:test';
import assert from 'node:assert/strict';

import type { TagRow } from '../src/db/types.ts';
import { chipsFor } from '../src/library/songChips.ts';
import { buildTagIndex } from '../src/library/tagTree.ts';

// kpop › gen 4 › rookies, kpop › gen 5, chill
const tag = (id: number, name: string, parent_id: number | null): TagRow => ({
  id,
  name,
  parent_id,
  sort_order: 0,
  created_at: 0,
  color: null,
});
const KPOP = tag(1, 'kpop', null);
const GEN4 = tag(2, 'gen 4', 1);
const GEN5 = tag(3, 'gen 5', 1);
const ROOKIES = tag(4, 'rookies', 2);
const CHILL = tag(5, 'chill', null);
const index = buildTagIndex([KPOP, GEN4, GEN5, ROOKIES, CHILL]);

/** Each chip as it reads: "kpop › gen 4". */
const read = (direct: TagRow[], held: number[], context: number | null = null) =>
  chipsFor(direct, index, new Set(held), context).map((c) => [...c.prefix, c.tag.name].join(' › '));

test('a subtag carries its top-level tag; a top-level tag stands alone', () => {
  assert.deepEqual(read([GEN4, CHILL], [2, 5]), ['chill', 'kpop › gen 4']);
});

test('the top of the chain shows even when no song is tagged with it directly', () => {
  // kpop holds no songs of its own, but "gen 4" means nothing without it.
  assert.deepEqual(read([GEN4], [2]), ['kpop › gen 4']);
});

test('a subtag in between shows only if some song is tagged with it directly', () => {
  assert.deepEqual(read([ROOKIES], [4]), ['kpop › rookies']);
  assert.deepEqual(read([ROOKIES], [2, 4]), ['kpop › gen 4 › rookies']);
});

test("a tag another of the song's tags sits under is dropped", () => {
  assert.deepEqual(read([KPOP, GEN4], [1, 2]), ['kpop › gen 4']);
  assert.deepEqual(read([KPOP, ROOKIES, CHILL], [1, 2, 4, 5]), ['chill', 'kpop › gen 4 › rookies']);
});

test("on a tag's page, that tag and what's above it are a given", () => {
  // kpop's page: subtags read on their own, other tags as anywhere else.
  assert.deepEqual(read([GEN4, CHILL], [2, 5], KPOP.id), ['chill', 'gen 4']);
  assert.deepEqual(read([ROOKIES], [2, 4], KPOP.id), ['gen 4 › rookies']);
  // A subtag in between that's only there to organise stays hidden on the page too:
  // on kpop's page, rookies reads on its own while gen 4 holds no songs.
  assert.deepEqual(read([ROOKIES], [4], KPOP.id), ['rookies']);
  // gen 4's page: gen 4 itself, and kpop above it, don't show.
  assert.deepEqual(read([GEN4], [2], GEN4.id), []);
  assert.deepEqual(read([KPOP, ROOKIES], [1, 4], GEN4.id), ['rookies']);
});
