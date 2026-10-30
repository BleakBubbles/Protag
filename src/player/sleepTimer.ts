import { useEffect, useState } from 'react';

import ProTagPlayer, { type NativeSleep } from '../../modules/protag-player';

/** When the music stops: never, at a time (ms since the epoch), or when the song playing ends. */
export type Sleep = { kind: 'off' } | { kind: 'timer'; endsAt: number } | { kind: 'end-of-song' };

const OFF: Sleep = { kind: 'off' };

const fromNative = (s: NativeSleep): Sleep =>
  s.mode === 'timer' && s.remainingMs !== null
    ? { kind: 'timer', endsAt: Date.now() + s.remainingMs }
    : s.mode === 'end-of-song'
      ? { kind: 'end-of-song' }
      : OFF;

/**
 * The sleep timer. It runs in the native player, beside the music, so it
 * still goes off if the app is swiped away; this just shows and sets it.
 * The last ten seconds fade out rather than cutting off.
 */
export function useSleepTimer() {
  const [sleep, setSleep] = useState<Sleep>(OFF);

  useEffect(() => {
    const sub = ProTagPlayer.addListener('onSleep', (s) => setSleep(fromNative(s)));
    ProTagPlayer.getSleep().then((s) => setSleep(fromNative(s)), () => {});
    return () => sub.remove();
  }, []);

  // Shown as set straight away, the player's word following: waiting on it, the sleep bar's thumb
  // would flick back to the old setting for a frame after being let go.
  return {
    sleep,
    sleepIn: (minutes: number) => {
      setSleep({ kind: 'timer', endsAt: Date.now() + minutes * 60_000 });
      return ProTagPlayer.setSleep('timer', minutes * 60_000).catch(() => {});
    },
    sleepAtEndOfSong: () => {
      setSleep({ kind: 'end-of-song' });
      return ProTagPlayer.setSleep('end-of-song', 0).catch(() => {});
    },
    cancel: () => {
      setSleep(OFF);
      return ProTagPlayer.setSleep('off', 0).catch(() => {});
    },
  };
}
