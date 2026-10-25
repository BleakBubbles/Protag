import { NativeModule, requireNativeModule } from 'expo';

/** A song in a play order, with what the lock screen, notification and car show for it. */
export interface NativeTrack {
  id: string;
  uri: string;
  title: string;
  artist: string | null;
  album: string | null;
  artwork: string | null;
}

export type NativeRepeat = 'off' | 'all' | 'one';

export interface NativeStatus {
  loaded: boolean;
  playing: boolean;
  buffering: boolean;
  positionMs: number;
  durationMs: number;
  index: number;
  error: string | null;
}

type Events = {
  onStatus(status: NativeStatus): void;
  /** Playback moved by itself; `repeated` is repeat-one going round the same song. */
  onMoved(event: { index: number; repeated: boolean }): void;
  onEnded(): void;
};

declare class ProTagPlayerModule extends NativeModule<Events> {
  setQueue(
    tracks: NativeTrack[],
    index: number,
    positionMs: number,
    autoplay: boolean,
    repeat: NativeRepeat,
    memo: string
  ): Promise<void>;
  reorder(tracks: NativeTrack[], index: number, memo: string): Promise<void>;
  restore(): Promise<{ memo: string; index: number; repeat: NativeRepeat } | null>;
  skipTo(index: number, autoplay: boolean): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seekTo(positionMs: number): Promise<void>;
  setRepeat(repeat: NativeRepeat): Promise<void>;
}

/** ProTag's playback engine (Media3), modules/protag-player. */
export default requireNativeModule<ProTagPlayerModule>('ProTagPlayer');
