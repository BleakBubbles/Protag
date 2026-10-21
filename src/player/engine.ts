/**
 * The seam between ProTag's player and whatever actually produces sound.
 *
 * `PlayerProvider` only ever talks to an `AudioEngine`. Today that's
 * `useExpoAudioEngine`; swapping in another library means writing one new
 * hook with this shape — queue logic and UI don't change.
 */

/** What the lock screen / notification shows for the current song. */
export interface NowPlaying {
  title: string;
  artist: string | null;
  album: string | null;
  artworkUri: string | null;
}

export interface EngineStatus {
  loaded: boolean;
  playing: boolean;
  buffering: boolean;
  positionSec: number;
  durationSec: number;
  error: string | null;
}

/** What happens at the ends: stop, wrap around, or play the same song again. */
export type EngineRepeat = 'off' | 'all' | 'one';

export interface AudioEngine {
  status: EngineStatus;
  /**
   * Hand over a whole play order (song URIs) and start at `index`, optionally
   * part-way in. The engine holds all of it, so next and previous work from
   * the lock screen, notification and headphones without JS.
   */
  setOrder(
    uris: readonly string[],
    index: number,
    options: { autoplay: boolean; positionSec?: number; repeat: EngineRepeat }
  ): void;
  /** Move within the current order. */
  skipTo(index: number, autoplay: boolean): void;
  setRepeat(repeat: EngineRepeat): void;
  /** What the lock screen shows; call when the current song changes. */
  setNowPlaying(nowPlaying: NowPlaying): void;
  play(): void;
  pause(): void;
  seekTo(seconds: number): Promise<void>;
}

export interface EngineCallbacks {
  /** The last song played to its end, with nothing after it. */
  onEnded: () => void;
  /**
   * Playback moved to another song without ProTag asking: a lock-screen or
   * headphone skip, a song ending into the next, or repeat-all wrapping
   * round. `index` is into the order last set.
   */
  onMoved: (index: number) => void;
}

export type UseAudioEngine = (callbacks: EngineCallbacks) => AudioEngine;
