import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';

import { notifyLibraryChanged } from '../db/changes';
import { getSetting, setSetting, SettingKey } from '../db/settings';
import { importPlaylistsFrom, type FolderImportSummary } from './playlistFolder';
import { pickFolder } from './saf';

export type ImportState =
  | { kind: 'idle' }
  | { kind: 'importing' }
  | { kind: 'done'; summary: FolderImportSummary }
  | { kind: 'error'; message: string };

/**
 * Playlist import, plus whether the user has declined the onboarding prompt.
 * Always goes through the folder picker (opened at the last-used folder), so
 * choosing a different folder is never more than one tap away.
 */
export function usePlaylistImport() {
  const db = useSQLiteContext();
  const [state, setState] = useState<ImportState>({ kind: 'idle' });
  // Unknown until loaded, so the prompt doesn't flash up for someone who dismissed it.
  const [promptDismissed, setPromptDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    getSetting(db, SettingKey.playlistPrompt).then((value) =>
      setPromptDismissed(value === 'dismissed')
    );
  }, [db]);

  const run = useCallback(async () => {
    const remembered = await getSetting(db, SettingKey.playlistFolder);
    const folder = await pickFolder(remembered);
    if (!folder) return; // Backed out of the picker.

    setState({ kind: 'importing' });
    try {
      await setSetting(db, SettingKey.playlistFolder, folder);
      const summary = await importPlaylistsFrom(db, folder);
      setState({ kind: 'done', summary });
    } catch (error) {
      setState({ kind: 'error', message: String(error) });
    }
    notifyLibraryChanged();
  }, [db]);

  const dismissPrompt = useCallback(async () => {
    await setSetting(db, SettingKey.playlistPrompt, 'dismissed');
    setPromptDismissed(true);
  }, [db]);

  return {
    state,
    run,
    busy: state.kind === 'importing',
    /** Show the onboarding prompt: not dismissed, and no import attempted yet. */
    showPrompt: promptDismissed === false && state.kind === 'idle',
    dismissPrompt,
  };
}
