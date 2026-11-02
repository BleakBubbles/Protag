import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';

import { notifyLibraryChanged } from '../../db/changes';
import { getInbox } from '../../db/inbox';
import { SettingKey, setSetting } from '../../db/settings';
import { useLibraryQuery } from './useLibraryQuery';

/** The inbox (`getInbox`), kept fresh, and its "Not now". */
export function useInbox() {
  const db = useSQLiteContext();
  const { data } = useLibraryQuery(getInbox, []);
  const newest = data?.newest ?? 0;
  const dismiss = useCallback(async () => {
    await setSetting(db, SettingKey.inboxDismissed, String(newest));
    notifyLibraryChanged();
  }, [db, newest]);
  return { count: data?.count ?? 0, shown: data?.shown ?? false, dismiss };
}
