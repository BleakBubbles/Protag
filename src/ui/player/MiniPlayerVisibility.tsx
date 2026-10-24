import { useSQLiteContext } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { getSetting, setSetting, SettingKey } from '../../db/settings';
import { useNowPlaying } from '../../player/PlayerProvider';

interface MiniPlayerVisibility {
  /** Something is playing and the user hasn't put the mini-player away. */
  visible: boolean;
  /** Show the one-time "how to get it back" note in the mini-player's place. */
  hintVisible: boolean;
  hide: () => void;
  show: () => void;
}

const Context = createContext<MiniPlayerVisibility | null>(null);

const HINT_MS = 4000;

/**
 * Whether the mini-player is on screen. The user can swipe it away to focus on
 * tagging while music keeps playing. It comes back when they open the Play tab
 * or start something new; not on a track change, which would defeat the point.
 */
export function MiniPlayerVisibilityProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const { song, queue } = useNowPlaying();
  const [hidden, setHidden] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);

  // A new queue (not a skip or a shuffle toggle) means the user started
  // something, so the controls come back.
  const lastQueue = useRef(queue.original);
  useEffect(() => {
    if (queue.original !== lastQueue.current) {
      lastQueue.current = queue.original;
      setHidden(false);
      setHintVisible(false);
    }
  }, [queue.original]);

  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, []);

  const hide = useCallback(() => {
    setHidden(true);
    // Explain the way back once, so a stray swipe never feels like losing the controls.
    getSetting(db, SettingKey.miniPlayerHint).then((seen) => {
      if (seen) return;
      setSetting(db, SettingKey.miniPlayerHint, 'shown');
      setHintVisible(true);
      hintTimer.current = setTimeout(() => setHintVisible(false), HINT_MS);
    });
  }, [db]);

  const show = useCallback(() => {
    setHidden(false);
    setHintVisible(false);
  }, []);

  const value = useMemo(
    () => ({ visible: Boolean(song) && !hidden, hintVisible: hidden && hintVisible, hide, show }),
    [song, hidden, hintVisible, hide, show]
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useMiniPlayerVisibility(): MiniPlayerVisibility {
  const value = useContext(Context);
  if (!value) throw new Error('useMiniPlayerVisibility must be used inside MiniPlayerVisibilityProvider');
  return value;
}
