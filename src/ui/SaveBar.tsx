import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { font, radius, spacing } from './theme';
import { makeStyles, useColors } from './ThemeContext';
import { timing } from './motion';

const HEIGHT = 52;
/** Room to leave under a screen's content, so the bar never covers its last row. */
export const SAVE_BAR_CLEARANCE = HEIGHT + spacing.lg * 2;

export interface SaveBarProps {
  /** What saving will do, like "1 tag to add · 2 to remove"; null while there's nothing to save. */
  changes: string | null;
  saving: boolean;
  onPress: () => void;
}

/**
 * Save for screens with staged changes: a bright bar that rises from the
 * bottom once there's something to save, saying what it will do, and sinks
 * away when there isn't. Where the thumb already is on a screen used often.
 */
export function SaveBar({ changes, saving, onPress }: SaveBarProps) {
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const shown = changes !== null;
  const rise = useRef(new Animated.Value(shown ? 1 : 0)).current;
  // The last summary stays on the bar while it sinks away.
  const last = useRef(changes);
  if (changes !== null) last.current = changes;

  useEffect(() => {
    timing(rise, { toValue: shown ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [rise, shown]);

  return (
    <Animated.View
      pointerEvents={shown ? 'box-none' : 'none'}
      style={[
        styles.wrap,
        { bottom: insets.bottom + spacing.lg },
        {
          opacity: rise,
          transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [HEIGHT, 0] }) }],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        disabled={saving || !shown}
        accessibilityRole="button"
        accessibilityLabel={`Save, ${last.current ?? ''}`}
        android_ripple={{ color: `${colors.bg}33` }}
        style={styles.bar}
      >
        <Text style={styles.label} numberOfLines={1}>
          Save <Text style={styles.changes}>· {last.current}</Text>
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    borderRadius: radius.pill,
    overflow: 'hidden',
    elevation: 8,
  },
  // Bright teal with the page's own colour as ink: it reads in both themes.
  bar: {
    height: HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.accentFg,
  },
  label: {
    ...font.name,
    color: colors.bg,
  },
  changes: {
    ...font.label,
    color: colors.bg,
    opacity: 0.8,
  },
}));
