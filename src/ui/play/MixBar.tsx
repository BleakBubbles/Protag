import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '../Button';
import { plural } from '../format';
import { IconButton } from '../IconButton';
import { colors, font, iconSize, radius, spacing } from '../theme';

const ROW = 32;
/** Fixed, so the screen can leave exactly this much room for it. */
export const MIX_BAR_HEIGHT = spacing.md * 2 + ROW + spacing.sm + 44;

export interface MixBarProps {
  visible: boolean;
  /** The combination in words, e.g. "driving AND kpop, not sad". */
  summary: string;
  count: number | null;
  /** Shown once two or more tags are included. */
  mode: 'and' | 'or' | null;
  onToggleMode: () => void;
  saveLabel: string;
  onSave: () => void;
  onShuffle: () => void;
  onClear: () => void;
}

/**
 * What you've picked and what you can do with it, like a basket: floats over
 * the bottom of the Play tab while any tag is chosen. Floating, so it never
 * moves the tiles; a fixed height, so nothing inside it jumps either.
 */
export function MixBar({ visible, summary, count, mode, onToggleMode, saveLabel, onSave, onShuffle, onClear }: MixBarProps) {
  const shown = useRef(new Animated.Value(visible ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(shown, { toValue: visible ? 1 : 0, duration: 180, useNativeDriver: true }).start();
  }, [visible, shown]);

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[
        styles.bar,
        {
          opacity: shown,
          transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [spacing.lg, 0] }) }],
        },
      ]}
    >
      <View style={styles.top}>
        <Text style={styles.summary} numberOfLines={1}>
          {summary}
          {count !== null && <Text style={styles.count}>{`  ·  ${plural(count, 'song')}`}</Text>}
        </Text>
        {mode && (
          <Pressable
            onPress={onToggleMode}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={mode === 'and' ? 'Matching all of these. Switch to any' : 'Matching any of these. Switch to all'}
            style={styles.mode}
          >
            <Ionicons name="swap-horizontal" size={iconSize.sm - 6} color={colors.accentFg} />
            <Text style={styles.modeText}>{mode === 'and' ? 'All of these' : 'Any of these'}</Text>
          </Pressable>
        )}
        <IconButton icon="close" label="Clear the selection" size={iconSize.sm} color={colors.textDim} onPress={onClear} />
      </View>
      <View style={styles.actions}>
        <Button label={saveLabel} icon="bookmark-outline" variant="tonal" onPress={onSave} style={styles.action} />
        <Button
          label={count === 0 ? 'No songs match' : 'Shuffle'}
          icon="shuffle"
          onPress={onShuffle}
          disabled={count === 0}
          style={styles.action}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: spacing.sm,
    height: MIX_BAR_HEIGHT,
    padding: spacing.md,
    paddingTop: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    elevation: 8,
  },
  top: {
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  summary: {
    ...font.label,
    color: colors.textDim,
    flex: 1,
  },
  count: {
    color: colors.text,
  },
  mode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: colors.accentTint,
  },
  modeText: {
    ...font.caption,
    color: colors.accentFg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  // Both pills, so the two read as a pair despite different strengths.
  action: {
    flex: 1,
    borderRadius: radius.pill,
  },
});
