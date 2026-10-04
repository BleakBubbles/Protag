/**
 * The seam between ProTag's player and whatever actually produces sound.
 *
 * `PlayerProvider` only ever talks to an `AudioEngine`. Today that's
 * `useExpoAudioEngine`; swapping in another library (e.g. for lock-screen
 * next/previous, which expo-audio's Android media session deliberately removes)
 * means writing one new hook with this shape — queue logic and UI don't change.
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

export interface AudioEngine {
  status: EngineStatus;
  /** Replace the current source. Plays immediately when `autoplay` is true. */
  load(uri: string, nowPlaying: NowPlaying, autoplay: boolean): void;
  play(): void;
  pause(): void;
  seekTo(seconds: number): Promise<void>;
}

export interface EngineCallbacks {
  /** The current song played to its end on its own. */
  onEnded: () => void;
}

export type UseAudioEngine = (callbacks: EngineCallbacks) => AudioEngine;
