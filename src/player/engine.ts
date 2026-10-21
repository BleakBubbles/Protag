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

/**
 * The current song, plus the songs a skip either way would reach, by URI. The
 * engine keeps those ready, so next and previous work from the lock screen,
 * the notification and headphones without waiting on JS.
 */
export interface EngineWindow {
  previous: string | null;
  current: { uri: string; nowPlaying: NowPlaying };
  next: string | null;
}

export interface AudioEngine {
  status: EngineStatus;
  /**
   * Make `window.current` the playing song, with its neighbours ready. Moving
   * to a neighbour is a plain skip; the same song again changes nothing but
   * its neighbours. Starts playback when `autoplay` is true; never pauses.
   */
  show(window: EngineWindow, autoplay: boolean): void;
  /** Repeat-one: a song ending starts again; skipping still moves on. */
  setRepeatOne(on: boolean): void;
  play(): void;
  pause(): void;
  seekTo(seconds: number): Promise<void>;
}

export interface EngineCallbacks {
  /** The last song played to its end, with nothing after it. */
  onEnded: () => void;
  /**
   * Playback moved to a neighbour without ProTag asking: a lock-screen or
   * headphone skip, or a song ending into the next. Follow it, then `show`
   * the new window.
   */
  onMoved: (direction: 'next' | 'previous') => void;
}

export type UseAudioEngine = (callbacks: EngineCallbacks) => AudioEngine;
