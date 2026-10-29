import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

import { notifyLibraryChanged } from '../../db/changes';
import { getSetting, setSetting, SettingKey } from '../../db/settings';
import { setTagOrder } from '../../db/tags';
import type { TagWithCounts } from '../../db/types';
import { parseSorts } from '../../library/sorts';
import { feelHold } from '../haptics';
import { useDragSelect } from '../hooks/useDragSelect';
import type { Selection } from '../hooks/useSelection';
import { timing } from '../motion';
import { makeStyles } from '../ThemeContext';
import { TagRow, useTagRowHeight } from './TagRow';

/** How quickly the other tags step aside for the one being dragged. */
const SHIFT_MS = 120;

export interface TagListProps {
  /** Siblings, in the order they're kept in (arranged, or A–Z). */
  tags: readonly TagWithCounts[];
  /** The selection these tags are picked into (`useSelection`, with these tags' ids). */
  selection: Selection;
  onOpen: (id: number) => void;
  /** Dimmed and untappable, keeping their place (while selecting songs). */
  disabled?: boolean;
  /** A slide across rows or a drag by a handle is on: the list around them shouldn't scroll. */
  onBusy?: (busy: boolean) => void;
}

/**
 * Tags as folder rows that can be selected like songs: hold one to start, then
 * tap or slide across others. While selecting, each row has a handle on the
 * right: drag it to put the tag somewhere else among its siblings. That order
 * is kept, here and as "Your order" on the Play tab.
 */
export function TagList({ tags, selection, onOpen, disabled, onBusy }: TagListProps) {
  const styles = useStyles();
  const db = useSQLiteContext();
  const rowHeight = useTagRowHeight();

  // A drop shows at once; the stored order catches up when the library reloads.
  const [order, setOrder] = useState<readonly number[] | null>(null);
  useEffect(() => setOrder(null), [tags]);
  const shown = useMemo(() => {
    if (!order) return tags;
    const byId = new Map(tags.map((t) => [t.id, t]));
    return order.map((id) => byId.get(id)).filter((t): t is TagWithCounts => t !== undefined);
  }, [tags, order]);
  const ids = useMemo(() => shown.map((t) => t.id), [shown]);

  const slide = useDragSelect({ ids, rowHeight, headerHeight: 0, selection });

  const [drag, setDragState] = useState<{ from: number; target: number } | null>(null);
  const dragRef = useRef(drag);
  const setDrag = (next: typeof drag) => {
    dragRef.current = next;
    setDragState(next);
  };
  const dy = useRef(new Animated.Value(0)).current;

  useEffect(() => onBusy?.(slide.dragging || drag !== null), [onBusy, slide.dragging, drag]);

  const arrange = async (next: number[]) => {
    await setTagOrder(db, next);
    // Arranged by hand: the Play tab follows it, unless another order was picked there.
    const sorts = parseSorts(await getSetting(db, SettingKey.shuffleSorts));
    if (sorts.tags === 'name') {
      await setSetting(db, SettingKey.shuffleSorts, JSON.stringify({ ...sorts, tags: 'custom' }));
    }
    notifyLibraryChanged();
  };
  const moved = (from: number, to: number) => {
    const next = [...ids];
    next.splice(to, 0, ...next.splice(from, 1));
    return next;
  };
  /** TalkBack's one place up or down: straight in, the rows sliding to their new places. */
  const nudge = (from: number, to: number) => {
    if (to < 0 || to >= ids.length) return;
    const next = moved(from, to);
    setOrder(next);
    arrange(next);
  };

  const dragging = {
    begin(i: number) {
      if (dragRef.current) return;
      feelHold();
      dy.setValue(0);
      setDrag({ from: i, target: i });
    },
    move(distance: number) {
      dy.setValue(distance);
      const current = dragRef.current;
      if (!current) return;
      const target = Math.min(ids.length - 1, Math.max(0, current.from + Math.round(distance / rowHeight)));
      if (target !== current.target) setDrag({ ...current, target });
    },
    /**
     * The floating tag glides into the place it was let go over, and only then
     * does the order change: by then every row already stands where the new
     * order puts it, so nothing on screen moves. `drop`: false when something
     * else took the touch over, and it glides back.
     */
    end(drop = true) {
      const current = dragRef.current;
      if (!current) return;
      const to = drop ? current.target : current.from;
      if (to !== current.target) setDrag({ ...current, target: to });
      timing(dy, {
        toValue: (to - current.from) * rowHeight,
        duration: SHIFT_MS,
        useNativeDriver: false,
      }).start(() => {
        if (to !== current.from) {
          const next = moved(current.from, to);
          setOrder(next);
          arrange(next);
        }
        setDrag(null);
      });
    },
  };

  /** Where each row stands: its place in the order, or, while one is dragged past, a place up or down. */
  const slotOf = (i: number) => {
    if (!drag) return i;
    if (i === drag.from) return drag.target;
    if (drag.from < drag.target && i > drag.from && i <= drag.target) return i - 1;
    if (drag.target < drag.from && i >= drag.target && i < drag.from) return i + 1;
    return i;
  };

  const dragged = drag ? shown[drag.from] : undefined;

  return (
    // Rows stand by place rather than in a column, so a new order that matches
    // where they already are changes nothing on screen.
    <View
      ref={slide.frameRef}
      collapsable={false}
      style={{ height: shown.length * rowHeight }}
      {...slide.frameProps}
    >
      {shown.map((tag, i) => (
        <Placed key={tag.id} slot={slotOf(i)} rowHeight={rowHeight} hidden={drag?.from === i}>
          <HandledTagRow
            tag={tag}
            selection={selection}
            disabled={disabled}
            onOpen={onOpen}
            onHold={slide.start}
            onDragStart={() => dragging.begin(i)}
            onDragMove={dragging.move}
            onDragEnd={dragging.end}
            onNudge={(step) => nudge(i, i + step)}
          />
        </Placed>
      ))}
      {/* The dragged tag floats over the list, following the finger; its row keeps
          the place (and the touch, on its handle) unseen underneath. */}
      {drag && dragged && (
        <Animated.View
          pointerEvents="none"
          style={[styles.floating, { top: drag.from * rowHeight, transform: [{ translateY: dy }] }]}
        >
          <TagRow
            name={dragged.name}
            color={dragged.color}
            songCount={dragged.song_count}
            childCount={dragged.child_count}
            onPress={() => {}}
            selecting
            selected={selection.selection?.has(dragged.id) ?? false}
          />
        </Animated.View>
      )}
    </View>
  );
}

/** A row at its place in the list, sliding when its place changes; `hidden` while its floating copy is what's seen. */
function Placed({
  slot,
  rowHeight,
  hidden,
  children,
}: {
  slot: number;
  rowHeight: number;
  hidden: boolean;
  children: ReactNode;
}) {
  const styles = useStyles();
  const y = useRef(new Animated.Value(slot * rowHeight)).current;
  useEffect(() => {
    timing(y, { toValue: slot * rowHeight, duration: SHIFT_MS, useNativeDriver: true }).start();
  }, [y, slot, rowHeight]);
  return (
    <Animated.View style={[styles.placed, { opacity: hidden ? 0 : 1, transform: [{ translateY: y }] }]}>
      {children}
    </Animated.View>
  );
}

interface HandledTagRowProps {
  tag: TagWithCounts;
  selection: Selection;
  disabled?: boolean;
  onOpen: (id: number) => void;
  onHold: (id: number) => void;
  onDragStart: () => void;
  onDragMove: (distance: number) => void;
  onDragEnd: (drop?: boolean) => void;
  onNudge: (step: 1 | -1) => void;
}

function HandledTagRow(props: HandledTagRowProps) {
  const { tag, selection, disabled, onOpen, onHold, onNudge } = props;
  // Latest callbacks for the gesture, which is made once.
  const latest = useRef(props);
  latest.current = props;
  const handle = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // The list around mustn't take the touch over and scroll instead.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => latest.current.onDragStart(),
      onPanResponderMove: (_, g) => latest.current.onDragMove(g.dy),
      // A quick drag can lift before its last moves were handled: land where the finger left.
      onPanResponderRelease: (_, g) => {
        latest.current.onDragMove(g.dy);
        latest.current.onDragEnd();
      },
      onPanResponderTerminate: () => latest.current.onDragEnd(false),
    })
  ).current;

  return (
    <TagRow
      name={tag.name}
      color={tag.color}
      songCount={tag.song_count}
      childCount={tag.child_count}
      onPress={() => (selection.selecting ? selection.toggle(tag.id) : onOpen(tag.id))}
      onLongPress={() => onHold(tag.id)}
      selecting={selection.selecting}
      selected={selection.selection?.has(tag.id) ?? false}
      handle={handle.panHandlers}
      onNudge={onNudge}
      disabled={disabled}
    />
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  placed: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  // The dragged row, standing over the others it passes.
  floating: {
    position: 'absolute',
    left: 0,
    right: 0,
    elevation: 8,
    backgroundColor: colors.surfaceAlt,
  },
}));
