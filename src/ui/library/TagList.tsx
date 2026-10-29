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
import { makeStyles } from '../ThemeContext';
import { TAG_ROW_HEIGHT, TagRow } from './TagRow';

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
  const db = useSQLiteContext();

  // A drop shows at once; the stored order catches up when the library reloads.
  const [order, setOrder] = useState<readonly number[] | null>(null);
  useEffect(() => setOrder(null), [tags]);
  const shown = useMemo(() => {
    if (!order) return tags;
    const byId = new Map(tags.map((t) => [t.id, t]));
    return order.map((id) => byId.get(id)).filter((t): t is TagWithCounts => t !== undefined);
  }, [tags, order]);
  const ids = useMemo(() => shown.map((t) => t.id), [shown]);

  const slide = useDragSelect({ ids, rowHeight: TAG_ROW_HEIGHT, headerHeight: 0, selection });

  const [drag, setDragState] = useState<{ from: number; target: number } | null>(null);
  const dragRef = useRef(drag);
  const setDrag = (next: typeof drag) => {
    dragRef.current = next;
    setDragState(next);
  };
  const dy = useRef(new Animated.Value(0)).current;

  useEffect(() => onBusy?.(slide.dragging || drag !== null), [onBusy, slide.dragging, drag]);

  const arrange = async (next: number[]) => {
    setOrder(next);
    await setTagOrder(db, next);
    // Arranged by hand: the Play tab follows it, unless another order was picked there.
    const sorts = parseSorts(await getSetting(db, SettingKey.shuffleSorts));
    if (sorts.tags === 'name') await setSetting(db, SettingKey.shuffleSorts, JSON.stringify({ ...sorts, tags: 'custom' }));
    notifyLibraryChanged();
  };
  const move = (from: number, to: number) => {
    if (to === from || to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(to, 0, ...next.splice(from, 1));
    arrange(next);
  };

  const dragging = {
    begin(i: number) {
      feelHold();
      dy.setValue(0);
      setDrag({ from: i, target: i });
    },
    move(distance: number) {
      dy.setValue(distance);
      const current = dragRef.current;
      if (!current) return;
      const target = Math.min(ids.length - 1, Math.max(0, current.from + Math.round(distance / TAG_ROW_HEIGHT)));
      if (target !== current.target) setDrag({ ...current, target });
    },
    /** `drop`: false when something else took the touch over: nothing moves. */
    end(drop = true) {
      const current = dragRef.current;
      if (drop && current) move(current.from, current.target);
      setDrag(null);
      dy.setValue(0);
    },
  };

  const shiftOf = (i: number) => {
    if (!drag || i === drag.from) return 0;
    if (drag.from < drag.target && i > drag.from && i <= drag.target) return -TAG_ROW_HEIGHT;
    if (drag.target < drag.from && i >= drag.target && i < drag.from) return TAG_ROW_HEIGHT;
    return 0;
  };

  return (
    <View ref={slide.frameRef} collapsable={false} {...slide.frameProps}>
      {shown.map((tag, i) => (
        <Shifting key={tag.id} shift={shiftOf(i)} settling={drag !== null} lifted={drag?.from === i ? dy : null}>
          <HandledTagRow
            tag={tag}
            selection={selection}
            disabled={disabled}
            onOpen={onOpen}
            onHold={slide.start}
            onDragStart={() => dragging.begin(i)}
            onDragMove={dragging.move}
            onDragEnd={dragging.end}
            onNudge={(step) => move(i, i + step)}
          />
        </Shifting>
      ))}
    </View>
  );
}

/** A row that steps aside for one being dragged past it, or, being dragged, follows the finger above the rest. */
function Shifting({
  shift,
  settling,
  lifted,
  children,
}: {
  shift: number;
  settling: boolean;
  lifted: Animated.Value | null;
  children: ReactNode;
}) {
  const styles = useStyles();
  const offset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (settling) Animated.timing(offset, { toValue: shift, duration: SHIFT_MS, useNativeDriver: true }).start();
    else offset.setValue(shift);
  }, [offset, shift, settling]);
  return (
    <Animated.View style={[lifted ? styles.lifted : null, { transform: [{ translateY: lifted ?? offset }] }]}>
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
  // The dragged row stands over the others it passes.
  lifted: {
    zIndex: 1,
    elevation: 8,
    backgroundColor: colors.surfaceAlt,
  },
}));
