import test from 'node:test';
import assert from 'node:assert/strict';

import { freshDatabase, insertSong, type TestDatabase } from './helpers/db.ts';
import { listMixes, saveMix } from '../src/db/mixes.ts';
import { addTagToSong, createTag, setTagColor } from '../src/db/tags.ts';
import { EMPTY_DRAFT } from '../src/query/types.ts';
import {
  applyImport,
  BACKUP_FORMAT,
  BackupError,
  buildBackup,
  parseBackup,
  planImport,
} from '../src/library/backup.ts';

/** kpop (orange) › bts, plus driving; three songs, one of them missing from the phone. */
async function taggedLibrary(): Promise<TestDatabase> {
  const db = await freshDatabase();
  const kpop = await createTag(db as never, 'kpop', null);
  const bts = await createTag(db as never, 'bts', kpop);
  const driving = await createTag(db as never, 'driving', null);
  await createTag(db as never, 'empty on purpose', null);
  await setTagColor(db as never, kpop, 'orange');

  const dynamite = await insertSong(db, 'Dynamite', { artist: 'BTS' });
  const ditto = await insertSong(db, 'Ditto', { artist: 'NewJeans' });
  const gone = await insertSong(db, 'Gone', { artist: 'Someone', missing: true });
  await insertSong(db, 'Untagged', { artist: 'Nobody' });

  await addTagToSong(db as never, dynamite, bts);
  await addTagToSong(db as never, dynamite, driving);
  await addTagToSong(db as never, ditto, kpop);
  await addTagToSong(db as never, gone, driving);
  return db;
}

/** The same music on another phone: different ids, different order, no tags. */
async function newPhone(): Promise<TestDatabase> {
  const db = await freshDatabase();
  await insertSong(db, 'Untagged', { artist: 'Nobody' });
  await insertSong(db, 'Ditto', { artist: 'NewJeans' });
  await insertSong(db, 'Dynamite', { artist: 'BTS' });
  return db;
}

async function tagPaths(db: TestDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ id: number; name: string; parent_id: number | null; color: string }>(
    'SELECT id, name, parent_id, color FROM tags'
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const path = (id: number): string => {
    const t = byId.get(id)!;
    return t.parent_id === null ? t.name : `${path(t.parent_id)}/${t.name}`;
  };
  return rows.map((r) => `${path(r.id)}:${r.color}`).sort();
}

async function songTags(db: TestDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ title: string; name: string }>(
    `SELECT s.title, t.name FROM song_tags st
     JOIN songs s ON s.id = st.song_id JOIN tags t ON t.id = st.tag_id`
  );
  return rows.map((r) => `${r.title}→${r.name}`).sort();
}

/** Export, through text like a real file, then plan an import into `target`. */
async function exportInto(source: TestDatabase, target: TestDatabase) {
  const text = JSON.stringify(await buildBackup(source as never));
  return planImport(target as never, parseBackup(text));
}

test('a backup restores the tag tree, colours, and tagging onto a new phone', async () => {
  const source = await taggedLibrary();
  const target = await newPhone();

  const plan = await exportInto(source, target);
  assert.equal(plan.newTags, 4, 'every tag, including the empty one');
  assert.equal(plan.existingTags, 0);
  assert.equal(plan.matchedSongs, 2);
  assert.deepEqual(plan.unmatchedSongs.map((s) => s.title), ['Gone']);
  assert.equal(plan.newLinks, 3);

  await applyImport(target as never, plan);
  assert.deepEqual(await tagPaths(target), await tagPaths(source));
  assert.deepEqual(await songTags(target), ['Ditto→kpop', 'Dynamite→bts', 'Dynamite→driving']);

  const when = async (db: TestDatabase) =>
    (await db.getAllAsync<{ added_at: number }>('SELECT added_at FROM song_tags ORDER BY added_at')).map(
      (r) => r.added_at
    );
  const sourceTimes = await when(source);
  for (const t of await when(target)) assert.ok(sourceTimes.includes(t), 'tagging times are kept');
  source.close();
  target.close();
});

test('importing the same backup again changes nothing', async () => {
  const source = await taggedLibrary();
  const target = await newPhone();
  await applyImport(target as never, await exportInto(source, target));
  const before = [await tagPaths(target), await songTags(target)];

  const again = await exportInto(source, target);
  assert.equal(again.newTags, 0);
  assert.equal(again.newLinks, 0);
  await applyImport(target as never, again);
  assert.deepEqual([await tagPaths(target), await songTags(target)], before);
  source.close();
  target.close();
});

test('import merges into existing tags by name and place, keeping their colour', async () => {
  const source = await taggedLibrary();
  const target = await newPhone();
  const mine = await createTag(target as never, 'KPOP', null);
  await setTagColor(target as never, mine, 'pink');
  // Same name, different place: not the same tag.
  const other = await createTag(target as never, 'other', null);
  await createTag(target as never, 'bts', other);

  const plan = await exportInto(source, target);
  assert.equal(plan.existingTags, 1, 'only kpop is already there');
  await applyImport(target as never, plan);

  const paths = await tagPaths(target);
  assert.ok(paths.includes('KPOP:pink'), 'the existing tag keeps its own name and colour');
  assert.ok(paths.some((p) => p.startsWith('KPOP/bts:')), 'bts lands under the existing kpop');
  assert.ok(paths.some((p) => p.startsWith('other/bts:')), 'the unrelated bts is untouched');
  assert.equal(paths.filter((p) => p.toLowerCase().startsWith('kpop:')).length, 1, 'no duplicate kpop');
  source.close();
  target.close();
});

test('a song missing on export comes back tagged once its file returns', async () => {
  const source = await taggedLibrary();
  const target = await newPhone();
  const backup = parseBackup(JSON.stringify(await buildBackup(source as never)));

  await insertSong(target, 'Gone', { artist: 'Someone' });
  const plan = await planImport(target as never, backup);
  assert.equal(plan.unmatchedSongs.length, 0);
  await applyImport(target as never, plan);
  assert.ok((await songTags(target)).includes('Gone→driving'));
  source.close();
  target.close();
});

test('files that are not a usable backup are refused with a reason', () => {
  assert.throws(() => parseBackup('not json'), BackupError);
  assert.throws(() => parseBackup(JSON.stringify({ hello: 1 })), BackupError);
  assert.throws(
    () => parseBackup(JSON.stringify({ app: 'ProTag', format: BACKUP_FORMAT + 1, tags: [], songs: [] })),
    /newer version/
  );
  assert.throws(
    () => parseBackup(JSON.stringify({ app: 'ProTag', format: 1, tags: [{ id: 1 }], songs: [] })),
    BackupError
  );
});

test('a link to a tag missing from the file is dropped, not fatal', () => {
  const backup = parseBackup(
    JSON.stringify({
      app: 'ProTag',
      format: 1,
      tags: [{ id: 1, name: 'kpop', parent: null }],
      songs: [{ filename: 'a.mp3', title: 'A', tags: [{ tag: 1 }, { tag: 99 }] }],
    })
  );
  assert.deepEqual(backup.songs[0].tags.map((l) => l.tag), [1]);
});

test('mixes come along, pointing at the restored tags', async () => {
  const source = await taggedLibrary();
  const ids = async (db: TestDatabase, name: string) =>
    (await db.getFirstAsync<{ id: number }>('SELECT id FROM tags WHERE name = ?', name))!.id;
  await saveMix(source as never, 'Night drive', {
    ...EMPTY_DRAFT,
    ingredients: [[await ids(source, 'driving')]],
    exclude: [await ids(source, 'bts')],
  });
  await saveMix(source as never, 'Gym', { ...EMPTY_DRAFT, ingredients: [[await ids(source, 'kpop')]] });

  const target = await newPhone();
  // Something else already took this target's id numbers, so ids must be mapped, not copied.
  await createTag(target as never, 'unrelated', null);
  await saveMix(target as never, 'gym', { ...EMPTY_DRAFT, exclude: [99] });

  const plan = await exportInto(source, target);
  assert.deepEqual(plan.newMixes.map((m) => m.name), ['Night drive'], 'a mix already here by name is kept');
  await applyImport(target as never, plan);

  const night = (await listMixes(target as never)).find((m) => m.name === 'Night drive')!;
  assert.deepEqual(night.draft.ingredients, [[await ids(target, 'driving')]]);
  assert.deepEqual(night.draft.exclude, [await ids(target, 'bts')]);
  const gym = (await listMixes(target as never)).find((m) => m.name === 'gym')!;
  assert.deepEqual(gym.draft.exclude, [99], 'untouched');
  source.close();
  target.close();
});

test('a backup made before mixes existed still imports', () => {
  const backup = parseBackup(JSON.stringify({ app: 'ProTag', format: 1, tags: [], songs: [] }));
  assert.deepEqual(backup.mixes, []);
});
