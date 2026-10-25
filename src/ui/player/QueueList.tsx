import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { getPlayableSongs, type PlayableSong } from '@/db/songs';
import { albumArtUri } from '@/library/assets';
import { usePlayerActions } from '@/player/PlayerProvider';
import type { QueueState } from '@/player/queue';
import { formatCount } from '@/ui/format';
import { feelHold } from '@/ui/haptics';
import { Icon } from '@/ui/Icon';
import { IconButton } from '@/ui/IconButton';
import { colors, font, iconSize, radius, spacing, touchTarget } from '@/ui/theme';
import { Artwork } from './Artwork';

const ROW = 56;
const HEADING = 36;
const THUMB = 40;
const FADE_MS = 150;
/** How quickly the other songs step aside for the one being dragged. */
const SHIFT_MS = 120;
/** Dragged this near the list's top or bottom, it scrolls, faster the nearer, up to this many px a frame. */
const EDGE = ROW;
const MAX_SCROLL_STEP = 14;

type Item =
  | { kind: 'heading'; key: string; label: string }
  | { kind: 'song'; key: string; at: number; id: number };

/** A drag in progress, by item index: where it started, where it would land, and the part of the queue it may move within. */
interface Drag {
  from: number;
  target: number;
  lo: number;
  hi: number;
  /** Where the list was scrolled to when the drag began; it may scroll on during it. */
  scrollStart: number;
}

/**
 * What's coming up, in the player where the artwork was: the songs the
 * listener queued first ("Queued"), then the rest of the order ("Next from
 * kpop"). Tap a song to play it now, × takes it out, and the handle drags it
 * to another place in its part of the queue.
 */
export function QueueList({ queue }: { queue: QueueState }) {
  const db = useSQLiteContext();
  const { jumpTo, removeUpcoming, moveUpcoming } = usePlayerActions();

  // Each song's details, for the whole order at once: one query per new order, not per row.
  const [songs, setSongs] = useState<ReadonlyMap<number, PlayableSong>>(new Map());
  useEffect(() => {
    let live = true;
    getPlayableSongs(db, queue.order).then((rows) => live && setSongs(new Map(rows.map((s) => [s.id, s]))));
    return () => {
      live = false;
    };
  }, [db, queue.order]);

  const items = useMemo(() => {
    const out: Item[] = [];
    // Keyed by song and which time it appears, so a row keeps its key when it moves.
    const seen = new Map<number, number>();
    const song = (at: number): Item => {
      const id = queue.order[at];
      const n = (seen.get(id) ?? 0) + 1;
      seen.set(id, n);
      return { kind: 'song', key: `${id}#${n}`, at, id };
    };
    const first = queue.index + 1;
    const queuedEnd = Math.max(first, queue.queuedEnd);
    if (queuedEnd > first) out.push({ kind: 'heading', key: 'queued', label: `Queued · ${formatCount(queuedEnd - first)}` });
    for (let at = first; at < queuedEnd; at++) out.push(song(at));
    const rest = queue.order.length - queuedEnd;
    if (rest > 0) {
      const from = queue.source ? `Next from ${queue.source.label}` : 'Next';
      out.push({ kind: 'heading', key: 'next', label: `${from} · ${formatCount(rest)}` });
    }
    for (let at = queuedEnd; at < queue.order.length; at++) out.push(song(at));
    return out;
  }, [queue]);

  // Rows and headings have fixed heights, so a long order scrolls without measuring each one.
  const offsets = useMemo(() => {
    const out = [0];
    for (const item of items) out.push(out[out.length - 1] + (item.kind === 'heading' ? HEADING : ROW));
    return out;
  }, [items]);

  /** Each song's part of the queue, as the first and last item index of its run of songs. */
  const sectionOf = (i: number) => {
    let lo = i;
    let hi = i;
    while (items[lo - 1]?.kind === 'song') lo--;
    while (items[hi + 1]?.kind === 'song') hi++;
    return { lo, hi };
  };

  // The dragged song floats over the list, following the finger; the others step aside.
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  };
  const dy = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(0);
  const at = (i: number) => (items[i] as Extract<Item, { kind: 'song' }>).at;

  // Auto-scroll reads these from a frame loop, outside any render.
  const list = useRef<FlatList<Item>>(null);
  const listHeight = useRef(0);
  const finger = useRef(0);
  const frame = useRef<number | null>(null);
  const layout = useRef({ offsets, length: offsets[offsets.length - 1] });
  layout.current = { offsets, length: offsets[offsets.length - 1] };

  /** Where the dragged song would land: how far the finger moved, plus how far the list scrolled under it. */
  const retarget = () => {
    const current = dragRef.current;
    if (!current) return;
    const moved = finger.current + scrollY.current - current.scrollStart;
    const target = Math.min(current.hi, Math.max(current.lo, current.from + Math.round(moved / ROW)));
    if (target !== current.target) setDrag({ ...current, target });
  };

  /** Each frame while dragging: near an edge, scroll that way. */
  const autoScroll = () => {
    const current = dragRef.current;
    if (!current) {
      frame.current = null;
      return;
    }
    const top = layout.current.offsets[current.from] - current.scrollStart + finger.current;
    const bottom = top + ROW;
    const into = top < EDGE ? top - EDGE : bottom > listHeight.current - EDGE ? bottom - (listHeight.current - EDGE) : 0;
    const step = Math.max(-MAX_SCROLL_STEP, Math.min(MAX_SCROLL_STEP, (into / EDGE) * MAX_SCROLL_STEP));
    const end = Math.max(0, layout.current.length - listHeight.current);
    const next = Math.max(0, Math.min(end, scrollY.current + step));
    if (Math.abs(next - scrollY.current) >= 0.5) {
      scrollY.current = next;
      list.current?.scrollToOffset({ offset: next, animated: false });
      retarget();
    }
    frame.current = requestAnimationFrame(autoScroll);
  };

  const dragging = {
    begin(i: number) {
      feelHold();
      dy.setValue(0);
      finger.current = 0;
      setDrag({ from: i, target: i, ...sectionOf(i), scrollStart: scrollY.current });
      frame.current ??= requestAnimationFrame(autoScroll);
    },
    move(distance: number) {
      dy.setValue(distance);
      finger.current = distance;
      retarget();
    },
    /** `drop`: false when the list took the touch over (a flick faster than the drag could start): nothing moves. */
    end(drop = true) {
      const current = dragRef.current;
      if (drop && current && current.target !== current.from) moveUpcoming(at(current.from), at(current.target));
      setDrag(null);
      dy.setValue(0);
    },
  };
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    []
  );
  /** TalkBack: a song moves one place at a time. */
  const nudge = (i: number, step: 1 | -1) => {
    const { lo, hi } = sectionOf(i);
    if (i + step >= lo && i + step <= hi) moveUpcoming(at(i), at(i + step));
  };

  const shiftOf = (i: number) => {
    if (!drag || i === drag.from || i < drag.lo || i > drag.hi) return 0;
    if (drag.from < drag.target && i > drag.from && i <= drag.target) return -ROW;
    if (drag.target < drag.from && i >= drag.target && i < drag.from) return ROW;
    return 0;
  };

  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
  }, [fade]);

  const dragged = drag ? (items[drag.from] as Extract<Item, { kind: 'song' }>) : null;

  return (
    <Animated.View style={[styles.box, { opacity: fade }]}>
      <FlatList
        ref={list}
        onLayout={(e) => (listHeight.current = e.nativeEvent.layout.height)}
        data={items}
        extraData={[drag, songs]}
        keyExtractor={(item) => item.key}
        getItemLayout={(_, i) => ({ length: offsets[i + 1] - offsets[i], offset: offsets[i], index: i })}
        scrollEnabled={!drag}
        onScroll={(e) => (scrollY.current = e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        renderItem={({ item, index }) =>
          item.kind === 'heading' ? (
            <Text style={styles.heading} numberOfLines={1}>
              {item.label}
            </Text>
          ) : (
            <QueueRow
              song={songs.get(item.id)}
              shift={shiftOf(index)}
              settling={drag !== null}
              hidden={drag?.from === index}
              onPlay={() => jumpTo(item.at)}
              onRemove={() => removeUpcoming(item.at)}
              onDragStart={() => dragging.begin(index)}
              onDragMove={dragging.move}
              onDragEnd={dragging.end}
              onNudge={(step) => nudge(index, step)}
            />
          )
        }
        ListEmptyComponent={<Text style={styles.empty}>Nothing after this song</Text>}
      />
      {drag && dragged && (
        <Animated.View
          pointerEvents="none"
          style={[styles.floating, { top: offsets[drag.from] - drag.scrollStart, transform: [{ translateY: dy }] }]}
        >
          <RowContent song={songs.get(dragged.id)} />
          {/* Where the × was, then the handle, still under the finger. */}
          <View style={styles.handle} />
          <View style={styles.handle}>
            <Icon name="reorder-three" size={iconSize.sm} color={colors.text} />
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
}

interface QueueRowProps {
  song?: PlayableSong;
  /** How far it has stepped aside for a song being dragged past it. */
  shift: number;
  /** A drag is on: steps aside smoothly. Off: back in place at once (the list has just reordered). */
  settling: boolean;
  /** It's the one being dragged: its copy floats over the list, this keeps its place. */
  hidden: boolean;
  onPlay: () => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragMove: (distance: number) => void;
  onDragEnd: (drop?: boolean) => void;
  onNudge: (step: 1 | -1) => void;
}

function QueueRow(props: QueueRowProps) {
  const { song, shift, settling, hidden, onPlay, onRemove, onNudge } = props;
  const title = song?.title ?? ' ';

  const offset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (settling) Animated.timing(offset, { toValue: shift, duration: SHIFT_MS, useNativeDriver: true }).start();
    else offset.setValue(shift);
  }, [offset, shift, settling]);

  // Latest callbacks for the gesture, which is made once.
  const latest = useRef(props);
  latest.current = props;
  const handle = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // The list mustn't take the touch over and scroll instead.
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
    <Animated.View style={[styles.row, { opacity: hidden ? 0 : 1, transform: [{ translateY: offset }] }]}>
      <Pressable
        onPress={onPlay}
        accessibilityRole="button"
        accessibilityLabel={`Play ${title} now`}
        style={({ pressed }) => [styles.main, pressed && styles.pressed]}
      >
        <RowContent song={song} />
      </Pressable>
      <IconButton icon="close" label={`Remove ${title} from the queue`} size={iconSize.sm} color={colors.textDim} onPress={onRemove} />
      <View
        {...handle.panHandlers}
        style={styles.handle}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`Move ${title}`}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onNudge(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      >
        <Icon name="reorder-three" size={iconSize.sm} color={colors.textDim} />
      </View>
    </Animated.View>
  );
}

function RowContent({ song }: { song?: PlayableSong }) {
  return (
    <>
      <Artwork uri={albumArtUri(song?.album_id ?? null)} size={THUMB} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {song?.title ?? ' '}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {song?.artist ?? ' '}
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    alignSelf: 'stretch',
  },
  heading: {
    ...font.caption,
    height: HEADING,
    paddingTop: spacing.md,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  row: {
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
  },
  main: {
    flex: 1,
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  handle: {
    width: touchTarget,
    height: ROW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floating: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    elevation: 8,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...font.listTitle,
    color: colors.text,
    includeFontPadding: false,
  },
  artist: {
    ...font.caption,
    color: colors.textDim,
    includeFontPadding: false,
  },
  empty: {
    ...font.body,
    color: colors.textDim,
    textAlign: 'center',
    paddingTop: spacing.xl,
  },
});
