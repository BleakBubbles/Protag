import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type GestureResponderHandlers,
  type ViewInstance,
} from 'react-native';

import type { PotItem, PotSpot } from '../../query/pot';
import { colors, font, radius, spacing } from '../theme';

/** How long a finger rests on a tag before it lifts. Shorter fights scrolling; longer feels stuck. */
const HOLD_MS = 100;
/** How far a finger can wander during the hold and still lift (or still count as a tap). */
const SLOP = 8;
const GHOST_WIDTH = 280;
/** The ghost floats this far above the finger, so the finger never hides it or what's under it. */
const GHOST_LIFT = 64;

/** What the floating copy of a dragged thing shows. */
export interface Ghost {
  names: string[];
  /** Hex, one per name. */
  colors: string[];
}

type Rect = { x: number; y: number; width: number; height: number };
type Target = { spot: NonNullable<PotSpot>; ref: RefObject<ViewInstance | null> };

const itemKey = (item: PotItem): string =>
  item.kind === 'ingredient' ? `i${item.index}` : `${item.kind}${item.tagId}`;

export const spotKey = (spot: PotSpot): string =>
  spot === null ? 'away' : spot.kind === 'ingredient' ? `i${spot.index}` : spot.kind;

/** Ingredients win over Keep out, which wins over the pot behind them both. */
const PRIORITY: Record<NonNullable<PotSpot>['kind'], number> = {
  ingredient: 0,
  keepOut: 1,
  pot: 2,
};

const measure = (ref: RefObject<ViewInstance | null>) =>
  new Promise<Rect | null>((resolve) => {
    if (!ref.current) return resolve(null);
    ref.current.measure((_x, _y, width, height, pageX, pageY) => resolve({ x: pageX, y: pageY, width, height }));
  });

const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

/**
 * Drag and drop for the Shuffle tab's pot, on React Native's own touch system.
 * Hold a tile or a chip for a moment and it lifts; while it's up, scrolling is
 * off (`active` tells the screen), so the page holds still under the finger
 * and the drop targets stay where they were measured.
 */
export function usePotDragRoot(onDrop: (item: PotItem, spot: PotSpot) => void) {
  const rootRef = useRef<ViewInstance>(null);
  const [active, setActive] = useState<{ item: PotItem; ghost: Ghost } | null>(null);
  const [hover, setHover] = useState<string>('away');
  const position = useRef(new Animated.ValueXY()).current;
  const targets = useRef(new Map<string, Target>()).current;
  const measured = useRef<{
    root: Rect | null;
    spots: { spot: NonNullable<PotSpot>; rect: Rect }[];
  }>({ root: null, spots: [] });
  const ownKey = useRef<string | null>(null);
  /** Counts lifts, so a measurement that finishes after its finger let go is ignored. */
  const lift = useRef({ id: 0, ready: false });
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  const api = useMemo(() => {
    const hitTest = (x: number, y: number): PotSpot => {
      let best: PotSpot = null;
      for (const { spot, rect } of measured.current.spots) {
        if (spotKey(spot) === ownKey.current || !inside(rect, x, y)) continue;
        if (best === null || PRIORITY[spot.kind] < PRIORITY[best.kind]) best = spot;
      }
      return best;
    };
    const place = (x: number, y: number) => {
      const root = measured.current.root;
      if (!root) return;
      position.setValue({
        x: x - root.x - GHOST_WIDTH / 2,
        y: y - root.y - GHOST_LIFT,
      });
    };
    return {
      register(key: string, target: Target) {
        targets.set(key, target);
        return () => {
          if (targets.get(key) === target) targets.delete(key);
        };
      },
      async begin(item: PotItem, ghost: Ghost, x: number, y: number) {
        // Felt the moment it lifts, so the finger knows it can move. Follows
        // the phone's own touch-feedback setting.
        performAndroidHapticsAsync(AndroidHaptics.Drag_Start).catch(() => {});
        const id = ++lift.current.id;
        lift.current.ready = false;
        ownKey.current = item.kind === 'ingredient' ? spotKey({ kind: 'ingredient', index: item.index }) : null;
        const [root, ...rects] = await Promise.all([
          measure(rootRef),
          ...[...targets.values()].map(async ({ spot, ref }) => ({
            spot,
            rect: await measure(ref),
          })),
        ]);
        if (id !== lift.current.id) return;
        lift.current.ready = true;
        measured.current = {
          root,
          spots: rects.filter((r): r is { spot: NonNullable<PotSpot>; rect: Rect } => r.rect !== null),
        };
        place(x, y);
        setActive({ item, ghost });
      },
      move(x: number, y: number) {
        if (!lift.current.ready) return;
        place(x, y);
        setHover(spotKey(hitTest(x, y)));
      },
      end(item: PotItem, x: number, y: number) {
        const ready = lift.current.ready;
        const spot = ready ? hitTest(x, y) : null;
        lift.current = { id: lift.current.id + 1, ready: false };
        setActive(null);
        setHover('away');
        if (ready) dropRef.current(item, spot);
      },
      cancel() {
        lift.current = { id: lift.current.id + 1, ready: false };
        setActive(null);
        setHover('away');
      },
    };
  }, [position, targets]);

  return { rootRef, active, hover, position, ...api };
}

type PotDrag = ReturnType<typeof usePotDragRoot>;
export const PotDragContext = createContext<PotDrag | null>(null);

function usePotDrag(): PotDrag {
  const drag = useContext(PotDragContext);
  if (!drag) throw new Error('Pot drag pieces must sit inside PotDragContext');
  return drag;
}

/** The screen's drag state: whether something is up, and where it hovers. */
export function usePotDragState() {
  const { active, hover } = usePotDrag();
  return { active: active?.item ?? null, hover };
}

/**
 * Makes a view tappable and, after a hold, draggable: spread `handlers` on it.
 * `pressed` is for a press preview, `lifting` for dimming what was picked up.
 * A child Pressable (like a tile's expand arrow) still gets its own taps,
 * since the deepest view asks first.
 */
export function useDraggable(item: PotItem, ghost: Ghost, onTap: () => void) {
  const drag = usePotDrag();
  const [pressed, setPressed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const wandered = useRef(false);
  const lifted = useRef(false);

  const stopTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stopTimer, []);

  const page = (e: GestureResponderEvent) => ({
    x: e.nativeEvent.pageX,
    y: e.nativeEvent.pageY,
  });

  const handlers: GestureResponderHandlers = {
    onStartShouldSetResponder: () => true,
    // Once lifted, nothing (a scroll view, say) may take the finger away.
    onResponderTerminationRequest: () => !lifted.current,
    onResponderGrant: (e) => {
      start.current = page(e);
      wandered.current = false;
      lifted.current = false;
      setPressed(true);
      timer.current = setTimeout(() => {
        lifted.current = true;
        setPressed(false);
        void drag.begin(item, ghost, start.current.x, start.current.y);
      }, HOLD_MS);
    },
    onResponderMove: (e) => {
      const { x, y } = page(e);
      if (lifted.current) return drag.move(x, y);
      if (Math.hypot(x - start.current.x, y - start.current.y) > SLOP) {
        wandered.current = true;
        stopTimer();
        setPressed(false);
      }
    },
    onResponderRelease: (e) => {
      stopTimer();
      setPressed(false);
      if (lifted.current) {
        lifted.current = false;
        const { x, y } = page(e);
        drag.end(item, x, y);
      } else if (!wandered.current) {
        onTap();
      }
    },
    onResponderTerminate: () => {
      stopTimer();
      setPressed(false);
      if (lifted.current) {
        lifted.current = false;
        drag.cancel();
      }
    },
  };

  const lifting = drag.active !== null && itemKey(drag.active.item) === itemKey(item);

  return { handlers, pressed, lifting };
}

/** Registers a view as somewhere to drop; `hovered` while a drag is over it. */
export function useDropTarget(spot: NonNullable<PotSpot>) {
  const drag = usePotDrag();
  const ref = useRef<ViewInstance>(null);
  const key = spotKey(spot);
  const kind = spot.kind;
  const index = spot.kind === 'ingredient' ? spot.index : -1;
  const { register } = drag;
  useEffect(
    () =>
      register(key, {
        spot: kind === 'ingredient' ? { kind, index } : { kind },
        ref,
      }),
    [register, key, kind, index]
  );
  return { ref, hovered: drag.active !== null && drag.hover === key };
}

/** Stroke of the pot's + and ×, in dp: a touch heavier than Ionicons' own. */
const STROKE = 1.75;

/**
 * The pot's + ("either") and × ("both"): two rounded bars, the × being the +
 * turned on its corner, so the two always match in size and weight.
 */
export function Join({ both, size }: { both?: boolean; size: number }) {
  const arm = Math.round(size * 0.6);
  const bar = { backgroundColor: colors.textDim, borderRadius: STROKE / 2 };
  return (
    <View style={[styles.join, { width: size, height: size }, both && styles.turned]}>
      <View style={[bar, { width: arm, height: STROKE }]} />
      <View style={[bar, styles.across, { width: STROKE, height: arm }]} />
    </View>
  );
}

/** The floating copy of whatever is being dragged. Render it last in the drag root. */
export function DragGhost() {
  const { active, position } = usePotDrag();
  if (!active) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.ghost, { transform: position.getTranslateTransform() }]}>
      {/* A combination rides in its tray, as in the pot. */}
      <View style={[styles.pill, active.ghost.names.length > 1 && styles.tray]}>
        {active.ghost.names.map((name, i) => (
          <View key={i} style={styles.segment}>
            {i > 0 && (
              <View style={styles.times}>
                <Join both size={18} />
              </View>
            )}
            <View style={[styles.name, { backgroundColor: active.ghost.colors[i] }]}>
              <Text style={styles.nameText} numberOfLines={1}>
                {name}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ghost: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: GHOST_WIDTH,
    alignItems: 'center',
    elevation: 12,
  },
  pill: {
    flexDirection: 'row',
    height: 40,
    borderRadius: radius.pill,
    overflow: 'hidden',
    transform: [{ scale: 1.06 }],
  },
  tray: {
    padding: 3,
    backgroundColor: colors.border,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  name: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  nameText: {
    ...font.label,
    color: colors.bg,
  },
  times: {
    paddingHorizontal: 2,
  },
  join: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  across: {
    position: 'absolute',
  },
  turned: {
    transform: [{ rotate: '45deg' }],
  },
});
