import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { getSetting, setSetting, SettingKey } from '../../db/settings';
import { countSongs } from '../../db/songs';
import { WelcomeFlow } from './WelcomeFlow';

const Context = createContext<() => void>(() => {});

/** Shows the welcome again ("How Protag works" in Settings). */
export const useShowWelcome = () => useContext(Context);

/**
 * The welcome, over the whole app: on the very first launch (never seen, and no
 * music found yet), and again whenever asked for. Someone who already has a
 * library when this arrives (an update) is marked as welcomed without seeing it.
 */
export function WelcomeProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  /** Shown, and whether there's music already (a replay ends with Done, not a scan). */
  const [shown, setShown] = useState<{ hasSongs: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      if (await getSetting(db, SettingKey.welcomed)) return;
      const songs = await countSongs(db);
      if (!live) return;
      if (songs === 0) setShown({ hasSongs: false });
      else await setSetting(db, SettingKey.welcomed, 'seen');
    })();
    return () => {
      live = false;
    };
  }, [db]);

  const show = useCallback(async () => setShown({ hasSongs: (await countSongs(db)) > 0 }), [db]);
  const close = useCallback(() => {
    setShown(null);
    setSetting(db, SettingKey.welcomed, 'seen');
  }, [db]);

  return (
    <Context.Provider value={show}>
      {children}
      {shown && <WelcomeFlow hasSongs={shown.hasSongs} onClose={close} />}
    </Context.Provider>
  );
}
