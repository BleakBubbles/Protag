import {
  createAudioPlaylist,
  setAudioModeAsync,
  useAudioPlaylistStatus,
  type AudioMetadata,
  type AudioPlaylist,
  type AudioPlaylistLoopMode,
  type AudioPlaylistStatus,
} from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';

import { isNativeLoadableUrl } from './artworkUrls';
import type { AudioEngine, EngineCallbacks, EngineRepeat, NowPlaying } from './engine';
import { lockScreenArtwork } from './lockScreenArtwork';

/** How often status (position etc.) updates, in ms. The seek bar is the only thing that needs it. */
const STATUS_INTERVAL_MS = 500;

const LOOP: Record<EngineRepeat, AudioPlaylistLoopMode> = { off: 'none', all: 'all', one: 'single' };

/** Lock-screen metadata *without* artwork — see the note in `setNowPlaying`. */
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

/** A playback error arrives as an extra field on one status update; it isn't in the type. */
type StatusWithError = AudioPlaylistStatus & { error?: { message?: string } };

const newPlaylist = (uris: readonly string[] = [], repeat: EngineRepeat = 'off') =>
  createAudioPlaylist({
    sources: uris.map((uri) => ({ uri })),
    updateInterval: STATUS_INTERVAL_MS,
    loop: LOOP[repeat],
  });

/**
 * `AudioEngine` backed by expo-audio playlists: only playlists get next and
 * previous on Android's lock screen and media session.
 *
 * Each play order gets its own playlist, holding all of it, never edited.
 * expo-audio's notification works from a snapshot of the playlist taken when
 * it's registered for the lock screen: moves within it are passed on, but
 * added or removed songs aren't, and skipping onto a song the snapshot lacks
 * crashes Android's media library ("Invalid PlayerInfo update"). So a new
 * order means a new playlist, registered afresh.
 */
export const useExpoAudioEngine = ({ onEnded, onMoved }: EngineCallbacks): AudioEngine => {
  const [playlist, setPlaylist] = useState(() => newPlaylist());
  const current = useRef(playlist);
  const status = useAudioPlaylistStatus(playlist) as StatusWithError;

  // Latest callbacks without re-subscribing; the provider's handlers change often.
  const callbacks = useRef({ onEnded, onMoved });
  callbacks.current = { onEnded, onMoved };

  /** Where ProTag last put playback, and the moves it asked for that haven't been reported back yet. */
  const index = useRef(0);
  const ownMoves = useRef<number[]>([]);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      // Also needs the foreground service from the expo-audio config plugin.
      shouldPlayInBackground: true,
      // Lock-screen controls need it, or Android may not tie them to the playlist.
      interruptionMode: 'doNotMix',
    }).catch((error) => console.warn('[audio] could not set audio mode', error));
  }, []);

  useEffect(() => {
    const sub = playlist.addListener('trackChanged', ({ currentIndex }) => {
      // ProTag's own moves come back as events too; they're already accounted for.
      if (ownMoves.current[0] === currentIndex) {
        ownMoves.current.shift();
        return;
      }
      ownMoves.current = [];
      if (currentIndex === index.current) return;
      index.current = currentIndex;
      callbacks.current.onMoved(currentIndex);
    });
    return () => sub.remove();
  }, [playlist]);

  // `didJustFinish` is a one-shot flag on a single status update, so fire on its
  // false → true edge only. A playlist only finishes when nothing comes after.
  useEffect(() => {
    if (status.didJustFinish) callbacks.current.onEnded();
  }, [status.didJustFinish]);

  // Kept until the song changes: the status update that carries it is followed by ones that don't.
  const [error, setError] = useState<string | null>(null);
  const reported = status.error?.message ?? null;
  useEffect(() => {
    if (reported) setError(reported);
  }, [reported]);

  /** The playlist the lock screen is showing, once registered. */
  const registered = useRef<AudioPlaylist | null>(null);
  const artworkToken = useRef(0);

  const actions = useMemo(() => {
    const moveTo = (target: number) => {
      if (target !== index.current) ownMoves.current.push(target);
      index.current = target;
      current.current.skipTo(target);
    };

    const showOnLockScreen = (metadata: AudioMetadata) => {
      const target = current.current;
      if (registered.current === target) {
        guarded('updateLockScreenMetadata', () => target.updateLockScreenMetadata(metadata));
        return;
      }
      // Registering is also what keeps Android playback alive in the background
      // past ~3 minutes. Optimistic so rapid changes don't register twice; reset
      // on failure so the next song retries.
      registered.current = target;
      guarded(
        'setActiveForLockScreen',
        () => target.setActiveForLockScreen(true, metadata, { showNextTrack: true, showPreviousTrack: true }),
        () => {
          if (registered.current === target) registered.current = null;
        }
      );
    };

    return {
      setOrder(
        uris: readonly string[],
        start: number,
        options: { autoplay: boolean; positionSec?: number; repeat: EngineRepeat }
      ) {
        const previous = current.current;
        const next = newPlaylist(uris, options.repeat);
        current.current = next;
        index.current = 0;
        ownMoves.current = [];
        moveTo(start);
        const { positionSec } = options;
        if (positionSec) guarded('seekTo', () => next.seekTo(positionSec));
        if (options.autoplay) next.play();
        previous.pause();
        previous.release();
        setPlaylist(next);
        setError(null);
      },
      skipTo(target: number, autoplay: boolean) {
        moveTo(target);
        if (autoplay) current.current.play();
        setError(null);
      },
      setRepeat(repeat: EngineRepeat) {
        current.current.loop = LOOP[repeat];
      },
      setNowPlaying(nowPlaying: NowPlaying) {
        // A URL the native side can't parse rejects the whole registration, so
        // it never waits on artwork: text first, artwork once a loadable copy exists.
        const base = baseMetadata(nowPlaying);
        showOnLockScreen(base);

        const token = ++artworkToken.current;
        lockScreenArtwork(nowPlaying.artworkUri).then((artworkUrl) => {
          // Skip if there's none, or the user has already moved to another song.
          if (!isNativeLoadableUrl(artworkUrl) || token !== artworkToken.current) return;
          showOnLockScreen({ ...base, artworkUrl });
        });
      },
      play: () => current.current.play(),
      pause: () => current.current.pause(),
      seekTo: (seconds: number) => current.current.seekTo(Math.max(0, seconds)),
    };
  }, []);

  return {
    ...actions,
    status: {
      loaded: status.isLoaded,
      playing: status.playing,
      buffering: status.isBuffering,
      positionSec: status.currentTime,
      durationSec: status.duration,
      error,
    },
  };
};
