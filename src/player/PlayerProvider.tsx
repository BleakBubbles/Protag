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

import { getPlayableSongs, getSong, recordPlay } from '../db/songs';
import type { SongRow } from '../db/types';
import { albumArtUri } from '../library/assets';
import { isTuned } from '../query/tuning';
import type { QueryDraft, TagQuery } from '../query/types';
import type { EngineStatus, Track, UseAudioEngine } from './engine';
import { useNativeEngine } from './nativeEngine';
import {
  advance,
  createQueue,
  currentId,
  cycleRepeat as cycleRepeatMode,
  EMPTY_QUEUE,
  jumpTo as jumpToIndex,
  nextShuffleMode,
  queueSongs as queueSongsInto,
  retuneQueue,
  removeUpcoming as removeUpcomingAt,
  moveUpcoming as moveUpcomingTo,
  retreat,
  setShuffleMode,
  shuffleModesOf,
  shuffleModeOf,
  type QueueAction,
  type QueueState,
  type ShuffleMode,
} from './queue';
import { albumGroups, queueForQuery, tunedOrder } from './sources';

/** The one line to change to swap audio engines. */
const useEngine: UseAudioEngine = useNativeEngine;

/** The queue as it stands, for the engine's `restore` to bring back (its index moves on without us). */
const memoOf = (queue: QueueState) => JSON.stringify({ ...queue, index: undefined });

/** A play counts once this much has been heard (or half the song, if shorter). */
const PLAY_COUNT_THRESHOLD_SEC = 30;

export interface PlayerActions {
  /** Start a new queue. Returns false if there was nothing to play. */
  playQueue(
    ids: number[],
    options?: {
      startId?: number;
      shuffle?: boolean;
      /** Shuffle by album, if it may (else the last way picked carries over). */
      byAlbum?: boolean;
      label?: string;
      draft?: QueryDraft;
      /** The ways it may shuffle, if not all (see `shuffleModesOf`). */
      modes?: readonly ShuffleMode[];
      /** A play order already woven (a tuned mix), led by `startId` if there is one. */
      order?: readonly number[];
    }
  ): boolean;
  togglePlay(): void;
  next(): void;
  previous(): void;
  seekTo(seconds: number): void;
  toggleShuffle(): void;
  cycleRepeat(): void;
  jumpTo(index: number): void;
  /**
   * Queue songs after the current one: `next` straight after it, `last`
   * after whatever's queued already. With nothing playing, they just play.
   */
  queueSongs(ids: readonly number[]): void;
  /** Take an upcoming song (by its place in the order) out of the queue. */
  removeUpcoming(at: number): void;
  /** Move an upcoming song within its part of the queue (see `moveUpcoming` in queue.ts). */
  moveUpcoming(from: number, to: number): void;
  /**
   * Retune the mix that's playing (its Details, from the player): the song
   * playing plays on, queued songs stay next, the rest is woven afresh.
   */
  retune(draft: QueryDraft): void;
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

/**
 * "Shuffle this query" — the app's core action, in one call. Pass the `draft`
 * it was built from, and the player can offer to save it as a mix.
 */
export function usePlayQuery() {
  const db = useSQLiteContext();
  const { playQueue } = usePlayerActions();
  return useCallback(
    async (
      query: TagQuery,
      { shuffle = true, label, draft }: { shuffle?: boolean; label?: string; draft?: QueryDraft } = {}
    ) => {
      const request = await queueForQuery(db, query);
      // A tuned mix plays its own weave rather than a plain shuffle of its songs.
      const order = draft && isTuned(draft) ? await tunedOrder(db, draft) : undefined;
      // A mix plays under its own name; anything else is described from the query.
      return playQueue(request.ids, { shuffle, label: label ?? request.label, draft, order });
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
  /** Whether shuffling means by album: the last shuffle mode picked, carried to new queues like repeat. */
  const prefersAlbums = useRef(false);
  const playCounted = useRef(false);

  const setQueue = useCallback((next: QueueState) => {
    queueRef.current = next;
    setQueueState(next);
  }, []);

  // Assigned below, once the engine exists; the engine's onEnded needs `apply`.
  const applyRef = useRef<(result: { queue: QueueState; action: QueueAction }) => void>(() => {});
  const engine = useEngine({
    onEnded: () => applyRef.current(advance(queueRef.current, 'ended')),
    // The lock screen, headphones, a song ending or repeat-all wrapping round
    // moved playback by itself; the queue follows.
    onMoved: (index, repeated) => {
      // Repeat-one going round: the same song again, heard again.
      if (repeated) playCounted.current = false;
      const next = jumpToIndex(queueRef.current, index);
      if (next === queueRef.current) return;
      setQueue(next);
      showSong(next);
    },
  });
  const engineRef = useRef(engine);
  engineRef.current = engine;

  /** The play order the engine holds: moving within it is a skip, anything else a new order. */
  const engineOrder = useRef<readonly number[] | null>(null);
  const orderToken = useRef(0);

  /** Show the queue's current song in the app (the engine shows it everywhere else). */
  const showSong = useCallback(
    async (queue: QueueState) => {
      const id = currentId(queue);
      if (id === null) return;
      // Rapid skips start several loads; only the newest may show.
      const token = ++loadToken.current;
      const row = await getSong(db, id);
      if (token !== loadToken.current) return;

      if (row?.id !== songRef.current?.id) {
        setSong(row);
        playCounted.current = false;
      }
    },
    [db]
  );

  const tracksOf = useCallback(
    async (ids: readonly number[]) =>
      (await getPlayableSongs(db, ids)).map((s): Track => ({ ...s, artworkUri: albumArtUri(s.album_id) })),
    [db]
  );
  /**
   * Hand the engine the queue's whole order, starting at its current song.
   * `keepPlaying`: it's the song already playing (shuffle changed), which
   * plays on while the order is swapped around it.
   */
  const loadOrder = useCallback(
    async (queue: QueueState, options: { autoplay: boolean; keepPlaying?: boolean }) => {
      const token = ++orderToken.current;
      const tracks = await tracksOf(queue.order);
      if (token !== orderToken.current) return;
      engineOrder.current = queue.order;
      const memo = memoOf(queue);
      if (options.keepPlaying) engineRef.current.reorder(tracks, queue.index, memo);
      else engineRef.current.setOrder(tracks, queue.index, { autoplay: options.autoplay, repeat: queue.repeat, memo });
      showSong(queue);
    },
    [tracksOf, showSong]
  );

  // Playback outlives the app (swiped away mid-song): opening it again picks
  // up the queue that's still playing.
  useEffect(() => {
    engineRef.current.restore().then((playing) => {
      if (!playing || queueRef.current !== EMPTY_QUEUE) return;
      // Memos from before queuing existed have no `queuedEnd`.
      const memo = JSON.parse(playing.memo) as Omit<QueueState, 'index' | 'queuedEnd'> & { queuedEnd?: number };
      if (playing.index < 0 || playing.index >= memo.order.length) return;
      const queue: QueueState = { ...memo, queuedEnd: memo.queuedEnd ?? 0, index: playing.index, repeat: playing.repeat };
      engineOrder.current = queue.order;
      setQueue(queue);
      showSong(queue);
    });
  }, [setQueue, showSong]);

  applyRef.current = ({ queue: next, action }) => {
    setQueue(next);
    const e = engineRef.current;
    switch (action) {
      case 'play':
        if (next.order === engineOrder.current) {
          e.skipTo(next.index, true);
          showSong(next);
        } else {
          loadOrder(next, { autoplay: true });
        }
        break;
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
      playQueue(ids, { startId, shuffle = false, byAlbum, label, draft, modes, order } = {}) {
        const source = label ? { label, draft, modes } : null;
        // Like repeat, how to shuffle is a preference that carries over to new queues, where allowed.
        const modesHere = shuffleModesOf(source);
        const shuffled = shuffle || !modesHere.includes('off');
        const albums = (byAlbum ?? prefersAlbums.current) && modesHere.includes('albums');
        const build = (groups?: number[][]) =>
          createQueue(ids, {
            startId,
            shuffle: shuffled,
            byAlbum: albums,
            groups,
            source,
            repeat: queueRef.current.repeat, // repeat is a preference, not per-queue
            order,
          });
        if (ids.length === 0) return false;
        // Shuffling by album needs to know the albums first.
        if (shuffled && albums) {
          albumGroups(db, ids).then((groups) => applyRef.current({ queue: build(groups), action: 'play' }));
          return true;
        }
        const next = build();
        if (next.index < 0) return false;
        applyRef.current({ queue: next, action: 'play' });
        return true;
      },
      togglePlay() {
        const e = engineRef.current;
        if (e.status.playing) e.pause();
        else if (songRef.current) e.play();
        else if (currentId(queueRef.current) !== null) loadOrder(queueRef.current, { autoplay: true });
      },
      next: () => applyRef.current(advance(queueRef.current, 'skip')),
      previous: () =>
        applyRef.current(retreat(queueRef.current, engineRef.current.status.positionSec)),
      seekTo: (seconds) => {
        engineRef.current.seekTo(seconds);
      },
      // Off → songs → albums → off. A new order for the engine around the
      // song that's playing, which plays on.
      toggleShuffle: async () => {
        const queue = queueRef.current;
        const mode = nextShuffleMode(shuffleModeOf(queue), shuffleModesOf(queue.source));
        if (mode === shuffleModeOf(queue)) return; // Only one way to shuffle it (a mix).
        if (mode !== 'off') prefersAlbums.current = mode === 'albums';
        const groups = mode === 'albums' ? await albumGroups(db, queue.original) : undefined;
        if (queueRef.current !== queue) return; // Something else changed the queue meanwhile.
        const next = setShuffleMode(queue, mode, { groups });
        setQueue(next);
        loadOrder(next, { autoplay: engineRef.current.status.playing, keepPlaying: true });
      },
      cycleRepeat: () => {
        const next = cycleRepeatMode(queueRef.current);
        setQueue(next);
        engineRef.current.setRepeat(next.repeat);
      },
      queueSongs: async (ids) => {
        const queue = queueRef.current;
        const { queue: next, at } = queueSongsInto(queue, ids);
        if (at < 0) {
          const source = { label: 'Picked songs' };
          applyRef.current({ queue: createQueue(ids, { source, repeat: queue.repeat }), action: 'play' });
          return;
        }
        setQueue(next);
        // Its order is the engine's, with these added: moves within it stay skips.
        engineOrder.current = next.order;
        const token = orderToken.current;
        const added = await tracksOf(ids);
        if (token !== orderToken.current) return; // A new order was loaded meanwhile.
        engineRef.current.insert(added, at, memoOf(next));
      },
      retune: async (draft) => {
        const queue = queueRef.current;
        const current = currentId(queue);
        if (!queue.source?.draft || current === null) return;
        const woven = await tunedOrder(db, draft, { first: current });
        if (queueRef.current !== queue) return; // Something else changed the queue meanwhile.
        const rest = woven[0] === current ? woven.slice(1) : woven;
        const next = retuneQueue(queue, rest, { ...queue.source, draft });
        setQueue(next);
        loadOrder(next, { autoplay: engineRef.current.status.playing, keepPlaying: true });
      },
      moveUpcoming(from, to) {
        const next = moveUpcomingTo(queueRef.current, from, to);
        if (next === queueRef.current) return;
        setQueue(next);
        engineOrder.current = next.order;
        engineRef.current.move(from, to, memoOf(next));
      },
      removeUpcoming(at) {
        const next = removeUpcomingAt(queueRef.current, at);
        if (next === queueRef.current) return;
        setQueue(next);
        engineOrder.current = next.order;
        engineRef.current.remove(at, memoOf(next));
      },
      jumpTo(index) {
        const next = jumpToIndex(queueRef.current, index);
        if (next !== queueRef.current) applyRef.current({ queue: next, action: 'play' });
      },
    }),
    [db, loadOrder, setQueue]
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
