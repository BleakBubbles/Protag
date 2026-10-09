import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { notifyLibraryChanged } from '../db/changes';
import { getSetting, setSetting, SettingKey } from '../db/settings';
import { plural } from '../ui/format';
import { applyImport, BackupError, buildBackup, parseBackup, planImport, type ImportPlan } from './backup';
import { pickBackupText, shareBackup } from './backupFile';

export type BackupState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'imported'; message: string }
  | { kind: 'error'; message: string };

/** The summary shown before importing: what will change, and what won't. */
function describePlan(plan: ImportPlan): string {
  const tags = plan.backup.tags.length;
  const lines = [
    `${plural(tags, 'tag')}${plan.newTags > 0 && plan.newTags < tags ? `, ${plan.newTags} of them new` : ''}.`,
    `${plural(plan.matchedSongs, 'song')} found on this phone, getting ${plural(plan.newLinks, 'new tag')}.`,
  ];
  if (plan.unmatchedSongs.length > 0) {
    lines.push(
      `${plural(plan.unmatchedSongs.length, "song isn't", "songs aren't")} on this phone. Import this file again after adding them.`
    );
  }
  lines.push('Nothing already here is changed or removed.');
  return lines.join('\n\n');
}

function confirm(title: string, message: string, action: string): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: action, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    )
  );
}

/** Export and import of the tag backup, and when the last export happened. */
export function useBackup() {
  const db = useSQLiteContext();
  const [state, setState] = useState<BackupState>({ kind: 'idle' });
  const [lastExport, setLastExport] = useState<number | null>(null);

  useEffect(() => {
    getSetting(db, SettingKey.lastBackupExport).then((value) => setLastExport(value ? Number(value) : null));
  }, [db]);

  const exportTags = useCallback(async () => {
    setState({ kind: 'working' });
    try {
      await shareBackup(await buildBackup(db));
      const now = Date.now();
      await setSetting(db, SettingKey.lastBackupExport, String(now));
      setLastExport(now);
      setState({ kind: 'idle' });
    } catch (error) {
      setState({ kind: 'error', message: `Export failed: ${String(error)}` });
    }
  }, [db]);

  const importTags = useCallback(async () => {
    try {
      const text = await pickBackupText();
      if (text === null) return; // Backed out of the picker.
      setState({ kind: 'working' });
      const plan = await planImport(db, parseBackup(text));

      if (plan.newTags === 0 && plan.newLinks === 0) {
        setState({ kind: 'imported', message: 'Everything in that backup is already here.' });
        return;
      }
      if (!(await confirm('Import this backup?', describePlan(plan), 'Import'))) {
        setState({ kind: 'idle' });
        return;
      }
      await applyImport(db, plan);
      notifyLibraryChanged();
      setState({
        kind: 'imported',
        message: `Imported. ${plural(plan.newLinks, 'tag')} added to ${plural(plan.matchedSongs, 'song')}.`,
      });
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof BackupError ? error.message : `Import failed: ${String(error)}`,
      });
    }
  }, [db]);

  return { state, lastExport, exportTags, importTags, busy: state.kind === 'working' };
}
