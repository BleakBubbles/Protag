import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { getSong, recordPlay } from '../db/songs';
import type { SongRow } from '../db/types';
import { albumArtUri } from '../library/assets';
import type { TagQuery } from '../query/types';
import type { EngineStatus, UseAudioEngine } from './engine';
import { useExpoAudioEngine } from './expoAudioEngine';
import {
  advance,
  createQueue,
  currentId,
  cycleRepeat as cycleRepeatMode,
  EMPTY_QUEUE,
  jumpTo as jumpToIndex,
  retreat,
  setShuffle,
  type QueueAction,
  type QueueState,
} from './queue';
import { queueForQuery } from './sources';

/** The one line to change to swap audio engines. */
const useEngine: UseAudioEngine = useExpoAudioEngine;

/** A play counts once this much has been heard (or half the song, if shorter). */
const PLAY_COUNT_THRESHOLD_SEC = 30;

export interface PlayerActions {
  /** Start a new queue. Returns false if there was nothing to play. */
  playQueue(
    ids: number[],
    options?: { startId?: number; shuffle?: boolean; label?: string }
  ): boolean;
  togglePlay(): void;
  next(): void;
  previous(): void;
  seekTo(seconds: number): void;
  toggleShuffle(): void;
  cycleRepeat(): void;
  jumpTo(index: number): void;
}

export interface NowPlayingState {
  song: SongRow | null;
  queue: QueueState;
}

// Three contexts so consumers re-render only for what they use: actions never
// change, the track changes on skip, and progress ticks twice a second.
const ActionsContext = createContext<PlayerActions | null>(null);
const NowPlayingContext = createContext<NowPlayingState | null>(null);
const StatusContext = createContext<EngineStatus | null>(null);

function useRequired<T>(context: React.Context<T | null>, hook: string): T {
  const value = useContext(context);
  if (value === null) throw new Error(`${hook} must be used inside <PlayerProvider>`);
  return value;
}

export const usePlayerActions = () => useRequired(ActionsContext, 'usePlayerActions');
export const useNowPlaying = () => useRequired(NowPlayingContext, 'useNowPlaying');
export const usePlaybackStatus = () => useRequired(StatusContext, 'usePlaybackStatus');

/** "Shuffle this query" — the app's core action, in one call. */
export function usePlayQuery() {
  const db = useSQLiteContext();
  const { playQueue } = usePlayerActions();
  return useCallback(
    async (query: TagQuery, { shuffle = true, label }: { shuffle?: boolean; label?: string } = {}) => {
      const request = await queueForQuery(db, query);
      // A mix plays under its own name; anything else is described from the query.
      return playQueue(request.ids, { shuffle, label: label ?? request.label });
    },
    [db, playQueue]
  );
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [queue, setQueueState] = useState<QueueState>(EMPTY_QUEUE);
  const [song, setSong] = useState<SongRow | null>(null);

  // Actions read these refs, which is what lets the actions object stay stable.
  const queueRef = useRef(queue);
  const songRef = useRef(song);
  songRef.current = song;
  const loadToken = useRef(0);
  const playCounted = useRef(false);

  const setQueue = useCallback((next: QueueState) => {
    queueRef.current = next;
    setQueueState(next);
  }, []);

  // Assigned below, once the engine exists; the engine's onEnded needs `apply`.
  const applyRef = useRef<(result: { queue: QueueState; action: QueueAction }) => void>(() => {});
  const engine = useEngine({ onEnded: () => applyRef.current(advance(queueRef.current, 'ended')) });
  const engineRef = useRef(engine);
  engineRef.current = engine;

  const loadSong = useCallback(
    async (id: number, autoplay: boolean) => {
      // Rapid skips start several loads; only the newest may touch the player.
      const token = ++loadToken.current;
      const row = await getSong(db, id);
      if (token !== loadToken.current) return;

      setSong(row);
      if (!row) return;
      playCounted.current = false;
      engineRef.current.load(
        row.uri,
        {
          title: row.title,
          artist: row.artist,
          album: row.album,
          artworkUri: albumArtUri(row.album_id),
        },
        autoplay
      );
    },
    [db]
  );

  applyRef.current = ({ queue: next, action }) => {
    setQueue(next);
    const e = engineRef.current;
    switch (action) {
      case 'play': {
        const id = currentId(next);
        if (id !== null) loadSong(id, true);
        break;
      }
      case 'replay':
        playCounted.current = false;
        e.seekTo(0).then(() => e.play());
        break;
      case 'stop':
        e.pause();
        e.seekTo(0);
        break;
    }
  };

  const actions = useMemo<PlayerActions>(
    () => ({
      playQueue(ids, { startId, shuffle = false, label } = {}) {
        const next = createQueue(ids, {
          startId,
          shuffle,
          source: label ? { label } : null,
          repeat: queueRef.current.repeat, // repeat is a preference, not per-queue
        });
        if (next.index < 0) return false;
        applyRef.current({ queue: next, action: 'play' });
        return true;
      },
      togglePlay() {
        const e = engineRef.current;
        if (e.status.playing) e.pause();
        else if (songRef.current) e.play();
        else {
          const id = currentId(queueRef.current);
          if (id !== null) loadSong(id, true);
        }
      },
      next: () => applyRef.current(advance(queueRef.current, 'skip')),
      previous: () =>
        applyRef.current(retreat(queueRef.current, engineRef.current.status.positionSec)),
      seekTo: (seconds) => {
        engineRef.current.seekTo(seconds);
      },
      toggleShuffle: () => setQueue(setShuffle(queueRef.current, !queueRef.current.shuffled)),
      cycleRepeat: () => setQueue(cycleRepeatMode(queueRef.current)),
      jumpTo(index) {
        const next = jumpToIndex(queueRef.current, index);
        if (next !== queueRef.current) applyRef.current({ queue: next, action: 'play' });
      },
    }),
    [loadSong, setQueue]
  );

  // Count a play once enough of the song has actually been heard, so skips don't
  // inflate play counts that smarter shuffles will later weight by.
  const { positionSec, durationSec } = engine.status;
  useEffect(() => {
    if (!song || playCounted.current || durationSec <= 0) return;
    if (positionSec >= Math.min(PLAY_COUNT_THRESHOLD_SEC, durationSec / 2)) {
      playCounted.current = true;
      recordPlay(db, song.id).catch((error) => console.warn('[player] recordPlay failed', error));
    }
  }, [db, song, positionSec, durationSec]);

  const nowPlaying = useMemo(() => ({ song, queue }), [song, queue]);

  return (
    <ActionsContext.Provider value={actions}>
      <NowPlayingContext.Provider value={nowPlaying}>
        <StatusContext.Provider value={engine.status}>{children}</StatusContext.Provider>
      </NowPlayingContext.Provider>
    </ActionsContext.Provider>
  );
}
