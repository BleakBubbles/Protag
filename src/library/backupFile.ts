import * as DocumentPicker from 'expo-document-picker';
import { cacheDirectory, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import type { BackupFile } from './backup';

/** "protag-backup-2026-10-08.json": dated, so several backups sort and don't overwrite. */
export function backupFileName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `protag-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/**
 * Hand the backup to Android's share sheet, which reaches wherever the user
 * keeps things: Drive, Files, email, another phone. Resolves when the sheet
 * closes; Android doesn't say whether it was actually saved anywhere.
 */
export async function shareBackup(backup: BackupFile): Promise<void> {
  const uri = `${cacheDirectory}${backupFileName(new Date())}`;
  await writeAsStringAsync(uri, JSON.stringify(backup, null, 2));
  await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Save your ProTag backup' });
}

/** Let the user pick a backup file; its text, or null if they backed out. */
export async function pickBackupText(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    // Cloud providers often label .json files as generic binary or text, so
    // don't hide those. The contents are checked anyway.
    type: ['application/json', 'application/octet-stream', 'text/plain'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  return readAsStringAsync(result.assets[0].uri);
}
