import * as DocumentPicker from 'expo-document-picker';
import { cacheDirectory, readAsStringAsync, StorageAccessFramework, writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import type { BackupFile } from './backup';

/** "protag-backup-2026-10-08.json": dated, so several backups sort and don't overwrite. */
export function backupFileName(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `protag-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

/**
 * Write the backup as a file in a folder the user picked (`pickFolder`), and
 * return its name. Android's share sheet only lists apps, and many phones
 * offer no "save to files" there, so this is the way to keep it on the phone.
 */
export async function saveBackupTo(folderUri: string, backup: BackupFile): Promise<string> {
  const name = backupFileName(new Date());
  const uri = await StorageAccessFramework.createFileAsync(folderUri, name, 'application/json');
  await writeAsStringAsync(uri, JSON.stringify(backup, null, 2));
  return name;
}

/**
 * Hand the backup to Android's share sheet, which reaches other apps: Drive,
 * email, a chat with yourself. Resolves when the sheet closes; Android doesn't
 * say whether it was actually saved anywhere.
 */
export async function shareBackup(backup: BackupFile): Promise<void> {
  const uri = `${cacheDirectory}${backupFileName(new Date())}`;
  await writeAsStringAsync(uri, JSON.stringify(backup, null, 2));
  await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Save your Protag backup' });
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
