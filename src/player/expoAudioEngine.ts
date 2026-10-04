import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useMemo, useRef } from 'react';

import type { AudioEngine, EngineCallbacks, NowPlaying } from './engine';

/** How often status (position etc.) updates, in ms. The seek bar is the only thing that needs it. */
const STATUS_INTERVAL_MS = 500;

function toMetadata(np: NowPlaying) {
  return {
    title: np.title,
    artist: np.artist ?? undefined,
    albumTitle: np.album ?? undefined,
    artworkUrl: np.artworkUri ?? undefined,
  };
}

/**
 * `AudioEngine` backed by expo-audio.
 *
 * Known limit: on Android, expo-audio's media session removes next/previous
 * commands, so the lock screen, notification, and Bluetooth controls offer
 * play/pause and seek but not track skipping. See engine.ts.
 */
export const useExpoAudioEngine = ({ onEnded }: EngineCallbacks): AudioEngine => {
  const player = useAudioPlayer(null, { updateInterval: STATUS_INTERVAL_MS });
  const status = useAudioPlayerStatus(player);

  // Latest callback without re-subscribing; the provider's handler changes often.
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      // Also needs the foreground service from the expo-audio config plugin.
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch((error) => console.warn('[audio] could not set audio mode', error));
  }, []);

  // `didJustFinish` is a one-shot flag on a single status update, so fire on its
  // false → true edge only.
  useEffect(() => {
    if (status.didJustFinish) onEndedRef.current();
  }, [status.didJustFinish]);

  const lockScreenActive = useRef(false);

  const actions = useMemo(
    () => ({
      load(uri: string, nowPlaying: NowPlaying, autoplay: boolean) {
        player.replace({ uri });
        if (autoplay) player.play();

        // On Android, registering for lock-screen controls is also what keeps
        // playback alive in the background past ~3 minutes. Register once, then
        // just update the metadata on each track change.
        if (!lockScreenActive.current) {
          player.setActiveForLockScreen(true, toMetadata(nowPlaying), {
            showSeekForward: true,
            showSeekBackward: true,
          });
          lockScreenActive.current = true;
        } else {
          player.updateLockScreenMetadata(toMetadata(nowPlaying));
        }
      },
      play: () => player.play(),
      pause: () => player.pause(),
      seekTo: (seconds: number) => player.seekTo(Math.max(0, seconds)),
    }),
    [player]
  );

  return {
    ...actions,
    status: {
      loaded: status.isLoaded,
      playing: status.playing,
      buffering: status.isBuffering,
      positionSec: status.currentTime,
      durationSec: status.duration,
      error: status.error,
    },
  };
};
