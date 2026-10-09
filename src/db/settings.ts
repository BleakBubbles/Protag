import type { SQLiteDatabase } from 'expo-sqlite';

/** Every key used in the `settings` table, so call sites can't typo one. */
export const SettingKey = {
  /** SAF tree URI of the folder playlists were last imported from. */
  playlistFolder: 'playlists.folderUri',
  /** 'dismissed' once the user declines the playlist import prompt. */
  playlistPrompt: 'playlists.prompt',
  /** Epoch ms of the last tag backup export (the share sheet was completed). */
  lastBackupExport: 'backup.lastExportAt',
  /** 'shown' once the user has seen how to bring back a hidden mini-player. */
  miniPlayerHint: 'miniPlayer.hint',
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
