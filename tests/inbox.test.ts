import test from 'node:test';
import assert from 'node:assert/strict';

import { freshDatabase, insertSong } from './helpers/db.ts';
import { getInbox } from '../src/db/inbox.ts';
import { SettingKey, setSetting } from '../src/db/settings.ts';
import { addTagToSong, createTag } from '../src/db/tags.ts';

test('the inbox counts untagged songs, and "Not now" hides it until a newer one arrives', async () => {
  const db = await freshDatabase();
  const tag = await createTag(db as never, 'chill', null);
  const tagged = await insertSong(db, 'Tagged');
  await addTagToSong(db as never, tagged, tag);
  const waiting = await insertSong(db, 'Waiting');
  assert.deepEqual(await getInbox(db as never), { count: 1, newest: waiting, shown: true });

  await setSetting(db as never, SettingKey.inboxDismissed, String(waiting));
  assert.equal((await getInbox(db as never)).shown, false);

  await insertSong(db, 'Fresh');
  assert.deepEqual(await getInbox(db as never), { count: 2, newest: waiting + 1, shown: true });
  db.close();
});
