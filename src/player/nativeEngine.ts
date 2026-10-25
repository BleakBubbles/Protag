import { useEffect, useMemo, useRef, useState } from 'react';

import ProTagPlayer, { type NativeStatus, type NativeTrack } from '../../modules/protag-player';
import type { AudioEngine, EngineCallbacks, EngineRepeat, EngineStatus, Track } from './engine';

const IDLE: EngineStatus = {
  loaded: false,
  playing: false,
  buffering: false,
  positionSec: 0,
  durationSec: 0,
  error: null,
};

const toNative = (track: Track): NativeTrack => ({
  id: String(track.id),
  uri: track.uri,
  title: track.title,
  artist: track.artist,
  album: track.album,
  artwork: track.artworkUri,
});

const toStatus = (s: NativeStatus): EngineStatus => ({
  loaded: s.loaded,
  playing: s.playing,
  buffering: s.buffering,
  positionSec: s.positionMs / 1000,
  durationSec: s.durationMs / 1000,
  error: s.error,
});

/** Native calls only fail if the app is going away; nothing to do but say so. */
const guarded = (label: string, call: Promise<unknown>) =>
  call.catch((error) => console.warn(`[audio] ${label} failed`, error));

/**
 * `AudioEngine` backed by ProTag's own Media3 module (modules/protag-player):
 * one player holding the whole play order, shown to the notification, lock
 * screen, headphones and car by a media service.
 */
export const useNativeEngine = ({ onEnded, onMoved }: EngineCallbacks): AudioEngine => {
  const [status, setStatus] = useState(IDLE);

  // Latest callbacks without re-subscribing; the provider's handlers change often.
  const callbacks = useRef({ onEnded, onMoved });
  callbacks.current = { onEnded, onMoved };

  useEffect(() => {
    const subs = [
      ProTagPlayer.addListener('onStatus', (s) => setStatus(toStatus(s))),
      ProTagPlayer.addListener('onMoved', ({ index, repeated }) => callbacks.current.onMoved(index, repeated)),
      ProTagPlayer.addListener('onEnded', () => callbacks.current.onEnded()),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, []);

  const actions = useMemo(
    () => ({
      setOrder(tracks: readonly Track[], index: number, options: { autoplay: boolean; positionSec?: number; repeat: EngineRepeat; memo: string }) {
        const { autoplay, positionSec = 0, repeat, memo } = options;
        guarded('setQueue', ProTagPlayer.setQueue(tracks.map(toNative), index, positionSec * 1000, autoplay, repeat, memo));
      },
      reorder(tracks: readonly Track[], index: number, memo: string) {
        guarded('reorder', ProTagPlayer.reorder(tracks.map(toNative), index, memo));
      },
      insert(tracks: readonly Track[], at: number, all: readonly Track[], memo: string) {
        guarded('insert', ProTagPlayer.insert(tracks.map(toNative), at, all.map(toNative), memo));
      },
      restore: () =>
        ProTagPlayer.restore().catch((error) => {
          console.warn('[audio] restore failed', error);
          return null;
        }),
      skipTo(index: number, autoplay: boolean) {
        guarded('skipTo', ProTagPlayer.skipTo(index, autoplay));
      },
      setRepeat(repeat: EngineRepeat) {
        guarded('setRepeat', ProTagPlayer.setRepeat(repeat));
      },
      play: () => {
        guarded('play', ProTagPlayer.play());
      },
      pause: () => {
        guarded('pause', ProTagPlayer.pause());
      },
      seekTo: async (seconds: number) => {
        // Shown at once, so the seek bar doesn't jump back while the player catches up.
        setStatus((s) => ({ ...s, positionSec: Math.max(0, seconds) }));
        await guarded('seekTo', ProTagPlayer.seekTo(Math.max(0, seconds) * 1000));
      },
    }),
    []
  );

  return { ...actions, status };
};
