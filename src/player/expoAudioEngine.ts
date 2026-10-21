import {
  setAudioModeAsync,
  useAudioPlaylist,
  useAudioPlaylistStatus,
  type AudioMetadata,
  type AudioPlaylistStatus,
} from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';

import { isNativeLoadableUrl } from './artworkUrls';
import type { AudioEngine, EngineCallbacks, EngineWindow, NowPlaying } from './engine';
import { lockScreenArtwork } from './lockScreenArtwork';
import { applyOp, EMPTY_MIRROR, planWindow, type PlaylistOp } from './playlistWindow';

/** How often status (position etc.) updates, in ms. The seek bar is the only thing that needs it. */
const STATUS_INTERVAL_MS = 500;

/** Lock-screen metadata *without* artwork — see the note in `show`. */
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

/**
 * `AudioEngine` backed by an expo-audio playlist: only playlists get next and
 * previous on Android's lock screen and media session. The playlist holds the
 * current song and its neighbours (see playlistWindow.ts); ProTag's queue
 * decides what those are.
 */
export const useExpoAudioEngine = ({ onEnded, onMoved }: EngineCallbacks): AudioEngine => {
  // Options stay constant: changing them would make the hook build a new playlist.
  const playlist = useAudioPlaylist({ updateInterval: STATUS_INTERVAL_MS });
  const status = useAudioPlaylistStatus(playlist) as StatusWithError;

  // Latest callbacks without re-subscribing; the provider's handlers change often.
  const callbacks = useRef({ onEnded, onMoved });
  callbacks.current = { onEnded, onMoved };

  /** What the native playlist holds, updated as ops are sent (they run in order). */
  const mirror = useRef(EMPTY_MIRROR);
  /** Indexes ProTag's own moves will land on, so their track-change events aren't taken for the lock screen's. */
  const ownMoves = useRef<number[]>([]);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      // Also needs the foreground service from the expo-audio config plugin.
      shouldPlayInBackground: true,
      // Lock-screen controls need it, or Android may not tie them to this playlist.
      interruptionMode: 'doNotMix',
    }).catch((error) => console.warn('[audio] could not set audio mode', error));
  }, []);

  useEffect(() => {
    const sub = playlist.addListener('trackChanged', ({ currentIndex }) => {
      const own = ownMoves.current;
      if (own[0] === currentIndex) {
        own.shift();
        return;
      }
      own.length = 0;
      const from = mirror.current.index;
      if (currentIndex === from || from < 0) return;
      mirror.current = { ...mirror.current, index: currentIndex };
      callbacks.current.onMoved(currentIndex > from ? 'next' : 'previous');
    });
    return () => sub.remove();
  }, [playlist]);

  // `didJustFinish` is a one-shot flag on a single status update, so fire on its
  // false → true edge only. A playlist only finishes when nothing comes after.
  useEffect(() => {
    if (status.didJustFinish) callbacks.current.onEnded();
  }, [status.didJustFinish]);

  // Kept until another song is shown: the status update that carries it is followed by ones that don't.
  const [error, setError] = useState<string | null>(null);
  const reported = status.error?.message ?? null;
  useEffect(() => {
    if (reported) setError(reported);
  }, [reported]);

  const registered = useRef(false);
  const artworkToken = useRef(0);
  const shownUri = useRef<string | null>(null);

  const actions = useMemo(() => {
    const showOnLockScreen = (metadata: AudioMetadata) => {
      if (registered.current) {
        guarded('updateLockScreenMetadata', () => playlist.updateLockScreenMetadata(metadata));
        return;
      }
      // Optimistic so rapid track changes don't register twice; reset on failure
      // so the next track retries instead of updating a registration that never
      // happened.
      registered.current = true;
      guarded(
        'setActiveForLockScreen',
        () =>
          playlist.setActiveForLockScreen(true, metadata, {
            showNextTrack: true,
            showPreviousTrack: true,
          }),
        () => {
          registered.current = false;
        }
      );
    };

    const send = (op: PlaylistOp) => {
      const before = mirror.current;
      mirror.current = applyOp(before, op);
      switch (op.kind) {
        case 'next':
          ownMoves.current.push(mirror.current.index);
          return playlist.next();
        case 'previous':
          ownMoves.current.push(mirror.current.index);
          return playlist.previous();
        case 'skipTo':
          // Into a playlist that was empty, the first song is already current: no move to report.
          if (before.index >= 0) ownMoves.current.push(op.index);
          return playlist.skipTo(op.index);
        case 'add':
          return playlist.add({ uri: op.uri });
        case 'insert':
          return playlist.insert({ uri: op.uri }, op.index);
        case 'remove':
          return playlist.remove(op.index);
      }
    };

    return {
      show(window: EngineWindow, autoplay: boolean) {
        const { ops } = planWindow(mirror.current, {
          previous: window.previous,
          current: window.current.uri,
          next: window.next,
        });
        ops.forEach(send);
        if (autoplay) playlist.play();
        if (shownUri.current === window.current.uri && registered.current) return;
        shownUri.current = window.current.uri;
        setError(null);

        // Registering for lock-screen controls is also what keeps Android
        // playback alive in the background past ~3 minutes, so it must never
        // depend on artwork: a URL the native side can't parse rejects the
        // whole call. Register with text first; add artwork once a loadable
        // copy exists.
        const base = baseMetadata(window.current.nowPlaying);
        showOnLockScreen(base);

        const token = ++artworkToken.current;
        lockScreenArtwork(window.current.nowPlaying.artworkUri).then((artworkUrl) => {
          // Skip if there's none, or the user has already moved to another song.
          if (!isNativeLoadableUrl(artworkUrl) || token !== artworkToken.current) return;
          showOnLockScreen({ ...base, artworkUrl });
        });
      },
      setRepeatOne: (on: boolean) => {
        playlist.loop = on ? 'single' : 'none';
      },
      play: () => playlist.play(),
      pause: () => playlist.pause(),
      seekTo: (seconds: number) => playlist.seekTo(Math.max(0, seconds)),
    };
  }, [playlist]);

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
