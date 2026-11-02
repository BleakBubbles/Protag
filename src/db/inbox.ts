import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting, SettingKey } from './settings';

export interface Inbox {
  /** Songs no tag holds yet. */
  count: number;
  /** Whether to remind: there's something to tag, and it isn't all from before "Not now". */
  shown: boolean;
  /** Id of the newest of them; 0 for none. */
  newest: number;
}

/**
 * The songs waiting to be tagged, as a reminder: a card on the Library's Tags
 * and Songs pages and a count on its tab. "Not now" hides it until a song
 * newer than any waiting then arrives (ids only grow, so the newest id says
 * it), and tagging them all hides it too.
 */
export async function getInbox(db: SQLiteDatabase): Promise<Inbox> {
  const [row, dismissed] = await Promise.all([
    db.getFirstAsync<{ count: number; newest: number | null }>(
      `SELECT COUNT(*) AS count, MAX(s.id) AS newest FROM songs s
       WHERE s.is_missing = 0 AND NOT EXISTS (SELECT 1 FROM song_tags st WHERE st.song_id = s.id)`
    ),
    getSetting(db, SettingKey.inboxDismissed),
  ]);
  const count = row?.count ?? 0;
  const newest = row?.newest ?? 0;
  return { count, newest, shown: count > 0 && newest > Number(dismissed ?? 0) };
}
