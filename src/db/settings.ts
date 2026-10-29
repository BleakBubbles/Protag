import type { SQLiteDatabase } from 'expo-sqlite';

/** Every key used in the `settings` table, so call sites can't typo one. */
export const SettingKey = {
  /** SAF tree URI of the folder playlists were last imported from. */
  playlistFolder: 'playlists.folderUri',
  /** 'dismissed' once the user declines the playlist import prompt. */
  playlistPrompt: 'playlists.prompt',
  /** Epoch ms of the last tag backup (saved to a folder, or the share sheet completed). */
  lastBackupExport: 'backup.lastExportAt',
  /** SAF tree URI of the folder backups were last saved to; the picker opens there. */
  backupFolder: 'backup.folderUri',
  /** 'shown' once the user has seen how to bring back a hidden mini-player. */
  miniPlayerHint: 'miniPlayer.hint',
  /** JSON `FolderChoices`: which of the phone's audio folders are read (library/libraryFolders.ts). */
  libraryFolders: 'library.folders',
  /** Epoch ms when the last complete library scan finished. */
  lastScanAt: 'library.lastScanAt',
  /** The phone's audio files' fingerprint when the last scan began (library/libraryWatch.ts). */
  libraryStamp: 'library.stamp',
  /** JSON `ShuffleSorts`: how each Play tab section is ordered (library/sorts.ts). */
  shuffleSorts: 'shuffle.sorts',
  /** How many rows of tiles the open pot shows, as last set with its divider. */
  potRows: 'shuffle.potRows',
  /** JSON `KeptPot`: what's in the pot (and the mix it was opened from), so it's there after a restart. */
  pot: 'shuffle.pot',
  /** Id of the tag the Play tab's tags were last gone in to, to come back there; empty at the top. */
  tagsAt: 'shuffle.tagsAt',
  /** JSON array of pinned mix ids, most recently pinned first (db/mixes.ts). */
  pinnedMixes: 'mixes.pinned',
  /** 'seen' once the welcome has been shown (finished or skipped); it shows on the very first launch only. */
  welcomed: 'app.welcomed',
  /** 'system' (follow the phone), 'dark' or 'light'. */
  theme: 'app.theme',
} as const;

export type SettingKey = (typeof SettingKey)[keyof typeof SettingKey];

export async function getSetting(db: SQLiteDatabase, key: SettingKey): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    key
  );
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: SettingKey, value: string): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value
  );
}
