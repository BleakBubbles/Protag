import * as MusicLibrary from 'expo-music-library';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import ProTagPlayer from '../../modules/protag-player';
import { notifyLibraryChanged } from '../db/changes';
import { getSetting, setSetting, SettingKey } from '../db/settings';
import { scanLibrary, type ScanProgress, type ScanSummary } from './scan';

/** A build from before the watch has no stamp to give; it then scans by hand only. */
const canStamp = () => typeof ProTagPlayer.libraryStamp === 'function';
const stampNow = () => (canStamp() ? ProTagPlayer.libraryStamp().catch(() => null) : Promise.resolve(null));

let running: Promise<ScanSummary> | null = null;

/**
 * Every scan, by hand or by itself, one at a time: one asked for while
 * another runs gets that one. The fingerprint is taken before reading, so a
 * song arriving mid-scan still counts as a change afterwards.
 */
export function scanNow(db: SQLiteDatabase, onProgress?: (progress: ScanProgress) => void): Promise<ScanSummary> {
  running ??= (async () => {
    try {
      const stamp = await stampNow();
      const summary = await scanLibrary(db, onProgress);
      if (stamp !== null) await setSetting(db, SettingKey.libraryStamp, stamp);
      return summary;
    } finally {
      running = null;
      notifyLibraryChanged();
    }
  })();
  return running;
}

/** Scan if the phone's audio files have changed since the last scan; quietly, as nothing's been asked for. */
async function scanIfChanged(db: SQLiteDatabase): Promise<void> {
  if (running) return;
  // Not before the first scan: that one's the welcome's, with permission asked for.
  if ((await getSetting(db, SettingKey.lastScanAt)) === null) return;
  if (!(await MusicLibrary.getPermissionsAsync()).granted) return;
  const stamp = await stampNow();
  if (stamp === null || stamp === (await getSetting(db, SettingKey.libraryStamp))) return;
  await scanNow(db);
}

/**
 * Keeps the library up with the phone: songs downloaded, copied on or deleted
 * show up (or go) by themselves. Checked when the app opens or comes back,
 * and while it's open whenever Android's audio index changes. Each check is a
 * fingerprint of the index, a few milliseconds; the scan runs only when that's
 * moved. Mounted once, at the root.
 */
export function useLibraryWatch(): void {
  const db = useSQLiteContext();
  useEffect(() => {
    const check = () => {
      scanIfChanged(db).catch((error) => console.warn('[scan] automatic rescan failed', error));
    };
    check();
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    const index = canStamp() ? ProTagPlayer.addListener('onLibraryChanged', check) : null;
    return () => {
      app.remove();
      index?.remove();
    };
  }, [db]);
}
