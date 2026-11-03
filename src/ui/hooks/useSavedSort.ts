import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';

import { setSetting, type SettingKey } from '../../db/settings';
import { nextSort, parseSort } from '../../library/sorts';

/**
 * A list's order, picked by tapping its sort label and remembered under `key`.
 * `stored` is the setting as the screen loaded it, alongside its list, so the
 * list never shows in one order and then jumps to another.
 */
export function useSavedSort<T>(key: SettingKey, list: readonly T[], stored: string | null | undefined): [T, () => void] {
  const db = useSQLiteContext();
  const [picked, setPicked] = useState<T>();
  const sort = picked ?? parseSort(stored ?? null, list);
  const cycle = () => {
    const next = nextSort(list, sort);
    setPicked(next);
    setSetting(db, key, String(next)).catch(() => {});
  };
  return [sort, cycle];
}
