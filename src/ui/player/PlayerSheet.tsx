import { useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, BackHandler, Dimensions, PanResponder, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { useColors } from '../ThemeContext';
import { FullPlayer } from './FullPlayer';

/** A slow release past this fraction of the way finishes the move; short of it, springs back. */
const SETTLE_FRACTION = 0.25;
/** A flick at least this fast (px/ms) settles in its direction however far it went. */
const FLICK_VELOCITY = 0.5;
/** The sheet fades in over the first stretch, so it reads as the mini-player growing. */
const FADE_IN = 0.15;

export interface PlayerSheetControls {
  expand(): void;
  collapse(): void;
  /** Follow a finger, from the mini-player (upward) or the player itself (downward). */
  beginDrag(): void;
  dragBy(dy: number): void;
  endDrag(vy: number): void;
  /** Height of the bar the sheet grows out of: mini-player plus tab bar. */
  setBarHeight(height: number): void;
}

const Context = createContext<PlayerSheetControls | null>(null);

export function usePlayerSheet(): PlayerSheetControls {
  const value = useContext(Context);
  if (!value) throw new Error('usePlayerSheet must be used inside PlayerSheet');
  return value;
}

/**
 * The full player as a sheet over `children`. One value, `progress` (0 closed,
 * 1 open), drives it; drags write it directly so the sheet follows the finger,
 * and releases spring it to whichever end is nearer or flicked towards.
 *
 * It sits inside the tabs layout rather than the root stack so the root's
 * modals (the tag editor) still cover it. The player only mounts while the
 * sheet is open or moving, so playback ticks don't re-render it while hidden.
 */
export function PlayerSheet({ children }: { children: ReactNode }) {
  const colors = useColors();
  const progress = useRef(new Animated.Value(0)).current;
  // progress as JS last set or aimed it; native-driven springs don't report back.
  const current = useRef(0);
  const dragStart = useRef(0);
  const [height, setHeight] = useState(() => Dimensions.get('window').height);
  const [barHeight, setBarHeight] = useState(0);
  const travel = Math.max(1, height - barHeight);
  const travelRef = useRef(travel);
  travelRef.current = travel;
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  const settleTo = useCallback(
    (target: 0 | 1) => {
      current.current = target;
      setOpen(target === 1);
      setMounted(true);
      Animated.spring(progress, {
        toValue: target,
        useNativeDriver: true,
        overshootClamping: true,
        speed: 16,
        bounciness: 0,
      }).start(({ finished }) => {
        if (finished && target === 0) setMounted(false);
      });
    },
    [progress]
  );

  const controls = useMemo<PlayerSheetControls>(
    () => ({
      expand: () => settleTo(1),
      collapse: () => settleTo(0),
      beginDrag: () => {
        setMounted(true);
        dragStart.current = current.current;
        // Catching it mid-spring: carry on from where it actually is.
        progress.stopAnimation((value) => {
          current.current = value;
          dragStart.current = value;
        });
      },
      dragBy: (dy) => {
        const value = Math.min(1, Math.max(0, dragStart.current - dy / travelRef.current));
        current.current = value;
        progress.setValue(value);
      },
      endDrag: (vy) => {
        const from = dragStart.current >= 0.5 ? 1 : 0;
        if (vy < -FLICK_VELOCITY) settleTo(1);
        else if (vy > FLICK_VELOCITY) settleTo(0);
        else settleTo(Math.abs(current.current - from) > SETTLE_FRACTION ? (from === 1 ? 0 : 1) : from);
      },
      setBarHeight,
    }),
    [progress, settleTo]
  );

  // Back closes the sheet first. Only while this layout is focused: with a
  // modal on top, back belongs to the modal.
  useFocusEffect(
    useCallback(() => {
      if (!open) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        controls.collapse();
        return true;
      });
      return () => sub.remove();
    }, [open, controls])
  );

  const closeResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: controls.beginDrag,
      onPanResponderMove: (_, g) => controls.dragBy(g.dy),
      onPanResponderRelease: (_, g) => controls.endDrag(g.vy),
      onPanResponderTerminate: () => controls.endDrag(0),
    })
  ).current;

  const sheetStyle = useMemo(
    () => ({
      opacity: progress.interpolate({ inputRange: [0, FADE_IN], outputRange: [0, 1], extrapolate: 'clamp' }),
      // Closed, its top edge sits on the mini-player's; open, on the screen's.
      transform: [
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [travel, 0], extrapolate: 'clamp' }) },
      ],
    }),
    [progress, travel]
  );

  const onLayout = (e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height);

  return (
    <Context.Provider value={controls}>
      <View style={styles.host} onLayout={onLayout}>
        <View style={styles.host} importantForAccessibility={open ? 'no-hide-descendants' : 'auto'}>
          {children}
        </View>
        {mounted && (
          <Animated.View style={[StyleSheet.absoluteFill, sheetStyle]}>
            <FullPlayer onClose={controls.collapse} dragHandlers={closeResponder.panHandlers} />
          </Animated.View>
        )}
        {/* Open, the player sets the status bar for its own page, over whatever the tab asked for. */}
        {open && <StatusBar style={colors.scheme === 'dark' ? 'light' : 'dark'} />}
      </View>
    </Context.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
});
