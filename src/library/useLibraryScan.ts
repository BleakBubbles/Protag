import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';

import { notifyLibraryChanged } from '../db/changes';
import { MusicPermissionError, scanLibrary, type ScanProgress, type ScanSummary } from './scan';

export type ScanState =
  | { kind: 'idle' }
  | { kind: 'scanning'; progress: ScanProgress | null }
  | { kind: 'done'; summary: ScanSummary }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'error'; message: string };

/** Scan state plus the action that runs it — shared by onboarding and Settings. */
export function useLibraryScan() {
  const db = useSQLiteContext();
  const [state, setState] = useState<ScanState>({ kind: 'idle' });

  const run = useCallback(async () => {
    setState({ kind: 'scanning', progress: null });
    try {
      const summary = await scanLibrary(db, (progress) => setState({ kind: 'scanning', progress }));
      setState({ kind: 'done', summary });
    } catch (error) {
      setState(
        error instanceof MusicPermissionError
          ? { kind: 'denied', canAskAgain: error.canAskAgain }
          : { kind: 'error', message: String(error) }
      );
    }
    notifyLibraryChanged();
  }, [db]);

  return { state, run, busy: state.kind === 'scanning' };
}
