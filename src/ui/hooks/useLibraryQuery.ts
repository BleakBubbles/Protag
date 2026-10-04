import { useFocusEffect } from 'expo-router';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useCallback, useRef, useState, type DependencyList } from 'react';

import { useLibraryVersion } from '../../db/changes';

export interface LibraryQuery<T> {
  /** Undefined until the first load finishes. */
  data: T | undefined;
  error: string | null;
}

/**
 * Load library data for a screen, and keep it fresh.
 *
 * Reloads when the screen regains focus, when `deps` change, and whenever any
 * library write calls `notifyLibraryChanged()`. Results from a superseded load
 * are dropped, so a slow query can never overwrite newer data.
 */
export function useLibraryQuery<T>(
  load: (db: SQLiteDatabase) => Promise<T>,
  deps: DependencyList
): LibraryQuery<T> {
  const db = useSQLiteContext();
  const version = useLibraryVersion();
  const [state, setState] = useState<LibraryQuery<T>>({ data: undefined, error: null });

  // The loader is usually an inline closure; read it through a ref so a new
  // closure each render doesn't trigger a reload loop. `deps` say when to reload.
  const loadRef = useRef(load);
  loadRef.current = load;

  useFocusEffect(
    useCallback(() => {
      let current = true;
      loadRef.current(db).then(
        (data) => current && setState({ data, error: null }),
        (error) => current && setState((prev) => ({ data: prev.data, error: String(error) }))
      );
      return () => {
        current = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db, version, ...deps])
  );

  return state;
}
