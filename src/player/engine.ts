/**
 * The seam between ProTag's player and whatever actually produces sound.
 *
 * `PlayerProvider` only ever talks to an `AudioEngine`. Today that's
 * `useNativeEngine` (ProTag's own Media3 module); swapping in another means
 * writing one new hook with this shape — queue logic and UI don't change.
 */

/** A song in a play order, with what the lock screen, notification and car show for it. */
export interface Track {
  id: number;
  uri: string;
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
   * Hand over a whole play order and start at `index`, optionally part-way
   * in. The engine holds all of it, so songs run on gaplessly and next and
   * previous work from the lock screen, notification, headphones and car
   * without JS. `memo` is the provider's own note on the order, handed back
   * by `restore`.
   */
  setOrder(
    tracks: readonly Track[],
    index: number,
    options: { autoplay: boolean; positionSec?: number; repeat: EngineRepeat; memo: string }
  ): void;
  /**
   * A new order with the playing song at `index` (shuffle changed): it plays
   * on without a break while the rest is swapped around it.
   */
  reorder(tracks: readonly Track[], index: number, memo: string): void;
  /**
   * Songs added into the order at `at` (queued by the listener); what's
   * playing plays on.
   */
  insert(tracks: readonly Track[], at: number, memo: string): void;
  /** An upcoming song (after the current one) taken out of the order. */
  remove(at: number, memo: string): void;
  /**
   * What's already playing when the app starts: playback can outlive the app
   * (swiped away mid-song). The memo of the order, where it is, and repeat.
   */
  restore(): Promise<{ memo: string; index: number; repeat: EngineRepeat } | null>;
  /** Move within the current order. */
  skipTo(index: number, autoplay: boolean): void;
  setRepeat(repeat: EngineRepeat): void;
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
   * round. `index` is into the order last set. `repeated`: repeat-one went
   * round the same song again.
   */
  onMoved: (index: number, repeated: boolean) => void;
}

export type UseAudioEngine = (callbacks: EngineCallbacks) => AudioEngine;
