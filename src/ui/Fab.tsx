import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Icon, type IconName } from './Icon';
import { colors, font, radius, spacing } from './theme';

/** The button's height, and its width with the label folded away. */
export const FAB_SIZE = 56;
const ICON = 24;

/** Room to leave at the bottom of a list so its last row can scroll clear of the button. */
export const FAB_CLEARANCE = FAB_SIZE + spacing.lg * 2;

/** Scrolled further than this, the button folds to its icon. */
const FOLD_AT = 48;

/**
 * Whether a list's button should show its label, plus the scroll props that
 * drive it: label at the top of the list, folded once scrolled past it. It
 * changes only when crossing that line, never with scroll direction, so a
 * button that's always there doesn't keep moving and pulling the eye.
 */
export function useFabFold() {
  const [extended, setExtended] = useState(true);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setExtended(e.nativeEvent.contentOffset.y < FOLD_AT);
  }, []);
  return {
    extended,
    scrollProps: {
      onScroll,
      scrollEventThrottle: 32,
      // Throttling can drop the event for where a short scroll actually stops;
      // these two always report the final position.
      onScrollEndDrag: onScroll,
      onMomentumScrollEnd: onScroll,
    },
  };
}

export interface FabProps {
  label: string;
  icon: IconName;
  /**
   * Shows the label. Fold it away once a list is scrolled, so the button covers
   * less of it, and bring it back at the top. Avoid toggling on scroll direction:
   * the movement draws the eye every time.
   */
  extended: boolean;
  onPress: () => void;
}

/**
 * Floating action button: the screen's main action, reachable from anywhere in
 * a long list. Bottom-right of the screen it's in; for a tab screen that's
 * already above the tab bar and mini-player, so no insets are added here.
 */
export function Fab({ label, icon, extended, onPress }: FabProps) {
  const progress = useRef(new Animated.Value(extended ? 1 : 0)).current;
  const [labelWidth, setLabelWidth] = useState(0);

  useEffect(() => {
    // Width can't use the native driver; it's one small view, so the JS thread copes.
    Animated.timing(progress, {
      toValue: extended ? 1 : 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [extended, progress]);

  return (
    <>
      {/* Measures the label at its natural width. Outside the button, because
          inside it the text would be measured against the folded width. */}
      <Text
        style={[styles.label, styles.measure]}
        onLayout={(e) => setLabelWidth(Math.ceil(e.nativeEvent.layout.width))}
        pointerEvents="none"
        aria-hidden
      >
        {label}
      </Text>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        android_ripple={{ color: colors.rippleOnAccent, foreground: true }}
        style={styles.fab}
      >
        <Icon name={icon} size={ICON} color={colors.onAccent} />
        <Animated.View
          style={{
            width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, labelWidth] }),
            opacity: progress,
            overflow: 'hidden',
          }}
        >
          <Text style={[styles.label, { width: labelWidth || undefined }]} numberOfLines={1}>
            {label}
          </Text>
        </Animated.View>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg,
    height: FAB_SIZE,
    minWidth: FAB_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: (FAB_SIZE - ICON) / 2,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    overflow: 'hidden',
    elevation: 6,
  },
  label: {
    ...font.listTitle,
    color: colors.onAccent,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
  },
  measure: {
    position: 'absolute',
    top: 0,
    left: 0,
    opacity: 0,
  },
});
