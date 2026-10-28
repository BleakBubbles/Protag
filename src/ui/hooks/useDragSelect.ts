import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  FlatList,
  GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ViewInstance,
} from 'react-native';

import { SELECTION_BAR_HEIGHT } from '../library/SelectionBar';
import { spacing } from '../theme';
import type { SongSelection } from './useSongSelection';

/** How close to the list's top or bottom edge the finger has to be to scroll it. */
const EDGE = 72;
/** The list's visible bottom while selecting: the top of the selection bar floating over it. */
const BAR_TOP = SELECTION_BAR_HEIGHT + spacing.lg;
/** The fastest it scrolls, per frame, with the finger right at the edge. */
const MAX_SPEED = 18;

type ScrollHandler = (e: NativeSyntheticEvent<NativeScrollEvent>) => void;

export interface DragSelectOptions {
  /** The songs as listed, in order: row `i` is `ids[i]`. */
  ids: readonly number[] | undefined;
  rowHeight: number;
  /** The list header's height, above the first row (from `useFixedRowLayout`). */
  headerHeight: number;
  selection: SongSelection;
  /** The list's own scroll handler, if it has one: it still gets every event. */
  onScroll?: ScrollHandler;
}

/**
 * Press and hold a song, then slide: every song the finger passes over goes the
 * same way the held one did (selected, or unselected if it already was), like
 * Google Photos. Sliding back undoes it, row by row, and holding near the
 * list's top or bottom edge scrolls it.
 *
 * Works only for a list of fixed-height rows below a header, so the row under
 * the finger is arithmetic rather than measuring. Put `frameRef` and
 * `frameProps` on a View wrapping the list, spread `listProps` on the list,
 * and use `start` as each row's `onLongPress`.
 *
 * While a drag is on, the list stops scrolling under the finger: the finger is
 * picking rows, not moving the page. Touches are watched on the frame
 * (`onTouchMove` reaches every ancestor), so the held row's press is never
 * taken from it and it ends the way a hold always does.
 */
export function useDragSelect({ ids, rowHeight, headerHeight, selection, onScroll }: DragSelectOptions) {
  const listRef = useRef<FlatList<any>>(null);
  const frameRef = useRef<ViewInstance>(null);
  const [dragging, setDragging] = useState(false);

  // Read inside touch handlers and the scroll loop, which outlive any one render.
  const latest = useRef({ ids, rowHeight, headerHeight, selection });
  latest.current = { ids, rowHeight, headerHeight, selection };

  const offset = useRef(0);
  const contentHeight = useRef(0);
  const drag = useRef<{
    anchor: number;
    /** Selecting (true) or unselecting the rows passed over. */
    select: boolean;
    /** The selection before the drag: rows slid back off return to it. */
    before: ReadonlySet<number>;
    reached: number;
    /** The frame's place on screen, once measured. */
    frame: { top: number; height: number } | null;
    /** The finger, from the frame's top. */
    y: number | null;
    loop: number | null;
  } | null>(null);

  const reach = useCallback((index: number) => {
    const d = drag.current;
    const ids = latest.current.ids;
    if (!d || !ids || index === d.reached) return;
    d.reached = index;
    const next = new Set(d.before);
    for (let i = Math.min(d.anchor, index); i <= Math.max(d.anchor, index); i++) {
      if (d.select) next.add(ids[i]);
      else next.delete(ids[i]);
    }
    latest.current.selection.replace(next);
  }, []);

  /** Picks the row under the finger, and scrolls on while it's held at an edge. */
  const follow = useCallback(() => {
    const d = drag.current;
    const { ids, rowHeight, headerHeight } = latest.current;
    if (!d || !d.frame || d.y === null || !ids || ids.length === 0) return;
    d.loop = null;

    const fromTop = d.y;
    const fromBottom = d.frame.height - BAR_TOP - d.y;
    const speed =
      fromTop < EDGE
        ? -MAX_SPEED * (1 - Math.max(fromTop, 0) / EDGE)
        : fromBottom < EDGE
          ? MAX_SPEED * (1 - Math.max(fromBottom, 0) / EDGE)
          : 0;
    const end = Math.max(0, contentHeight.current - d.frame.height);
    const scrollTo = Math.min(end, Math.max(0, offset.current + speed));
    if (scrollTo !== offset.current) {
      offset.current = scrollTo;
      listRef.current?.scrollToOffset({ offset: scrollTo, animated: false });
    }

    const row = Math.floor((offset.current + d.y - headerHeight) / rowHeight);
    reach(Math.min(ids.length - 1, Math.max(0, row)));

    // Held at an edge with room left to scroll: keep going, even if the finger stays still.
    if ((speed < 0 && scrollTo > 0) || (speed > 0 && scrollTo < end)) {
      d.loop = requestAnimationFrame(follow);
    }
  }, [reach]);

  const stop = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    if (d.loop !== null) cancelAnimationFrame(d.loop);
    drag.current = null;
    setDragging(false);
  }, []);
  useEffect(() => stop, [stop]);

  /** A row's `onLongPress`: picks it (or unpicks it), and the slide that may follow goes the same way. */
  const start = useCallback(
    (songId: number) => {
      const { ids, selection } = latest.current;
      const anchor = ids?.indexOf(songId) ?? -1;
      if (anchor < 0) {
        selection.toggle(songId);
        return;
      }
      const before = selection.selection ?? new Set<number>();
      drag.current = { anchor, select: !before.has(songId), before, reached: -1, frame: null, y: null, loop: null };
      reach(anchor);
      setDragging(true);
      frameRef.current?.measure((_x, _y, _width, height, _pageX, pageY) => {
        if (drag.current) drag.current.frame = { top: pageY, height };
      });
    },
    [reach],
  );

  const onTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      const d = drag.current;
      if (!d?.frame) return;
      d.y = e.nativeEvent.pageY - d.frame.top;
      if (d.loop === null) follow();
    },
    [follow],
  );

  const track: ScrollHandler = (e) => {
    offset.current = e.nativeEvent.contentOffset.y;
    onScroll?.(e);
  };

  return {
    start,
    frameRef,
    frameProps: { onTouchMove, onTouchEnd: stop, onTouchCancel: stop },
    listProps: {
      ref: listRef,
      scrollEnabled: !dragging,
      onScroll: track,
      scrollEventThrottle: 32,
      // Throttling can drop the event for where a scroll stops; these always report it.
      onScrollEndDrag: track,
      onMomentumScrollEnd: track,
      onContentSizeChange: (_width: number, height: number) => {
        contentHeight.current = height;
      },
    },
  };
}
