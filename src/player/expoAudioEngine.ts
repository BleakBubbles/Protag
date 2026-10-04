import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, type AudioMetadata } from 'expo-audio';
import { useEffect, useMemo, useRef } from 'react';

import { isNativeLoadableUrl } from './artworkUrls';
import type { AudioEngine, EngineCallbacks, NowPlaying } from './engine';
import { lockScreenArtwork } from './lockScreenArtwork';

/** How often status (position etc.) updates, in ms. The seek bar is the only thing that needs it. */
const STATUS_INTERVAL_MS = 500;

/** Lock-screen metadata *without* artwork — see the note in `load`. */
function baseMetadata(np: NowPlaying): AudioMetadata {
  return {
    title: np.title,
    artist: np.artist ?? undefined,
    albumTitle: np.album ?? undefined,
  };
}

/**
 * Run a native call that may fail asynchronously. expo-audio's lock-screen
 * methods are typed as returning nothing but actually return promises that can
 * reject — unguarded, that surfaces as an "Uncaught (in promise)" error.
 */
function guarded(label: string, call: () => unknown, onError?: () => void): void {
  const fail = (error: unknown) => {
    console.warn(`[audio] ${label} failed`, error);
    onError?.();
  };
  try {
    const result = call();
    if (result instanceof Promise) result.catch(fail);
  } catch (error) {
    fail(error);
  }
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

  const registered = useRef(false);
  const artworkToken = useRef(0);

  const actions = useMemo(() => {
    const showOnLockScreen = (metadata: AudioMetadata) => {
      if (registered.current) {
        guarded('updateLockScreenMetadata', () => player.updateLockScreenMetadata(metadata));
        return;
      }
      // Optimistic so rapid track changes don't register twice; reset on failure
      // so the next track retries instead of updating a registration that never
      // happened.
      registered.current = true;
      guarded(
        'setActiveForLockScreen',
        () =>
          player.setActiveForLockScreen(true, metadata, {
            showSeekForward: true,
            showSeekBackward: true,
          }),
        () => {
          registered.current = false;
        }
      );
    };

    return {
      load(uri: string, nowPlaying: NowPlaying, autoplay: boolean) {
        player.replace({ uri });
        if (autoplay) player.play();

        // Registering for lock-screen controls is also what keeps Android
        // playback alive in the background past ~3 minutes, so it must never
        // depend on artwork: a URL the native side can't parse rejects the
        // whole call. Register with text first; add artwork once a loadable
        // copy exists.
        const base = baseMetadata(nowPlaying);
        showOnLockScreen(base);

        const token = ++artworkToken.current;
        lockScreenArtwork(nowPlaying.artworkUri).then((artworkUrl) => {
          // Skip if there's none, or the user has already moved to another song.
          if (!isNativeLoadableUrl(artworkUrl) || token !== artworkToken.current) return;
          showOnLockScreen({ ...base, artworkUrl });
        });
      },
      play: () => player.play(),
      pause: () => player.pause(),
      seekTo: (seconds: number) => player.seekTo(Math.max(0, seconds)),
    };
  }, [player]);

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
