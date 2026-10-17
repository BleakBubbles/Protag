import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Pressable, StyleSheet, Text } from 'react-native';

import { Fab, FAB_SIZE } from './Fab';
import type { IconName } from './IconButton';
import { colors, font, iconSize, radius, spacing } from './theme';

/**
 * Pill size. The rest of the screen is dimmed while the menu is open, so the
 * pills can afford a big footprint. Tune here.
 */
const PILL = { height: 64, minWidth: 200, icon: iconSize.md };

export interface FabMenuItem {
  label: string;
  icon: IconName;
  onPress: () => void;
}

export interface FabMenuProps {
  label: string;
  icon: IconName;
  extended: boolean;
  items: readonly FabMenuItem[];
}

/**
 * A floating button that opens a short menu above itself (Material's FAB menu):
 * labelled pills rise out of the button, which turns into a close button.
 * Tapping anywhere else, the button again, or back closes it.
 *
 * Drawn inside its screen rather than in a modal, so the button and the menu
 * stay exactly where they are; the screen's container must fill the screen.
 */
export function FabMenu({ label, icon, extended, items }: FabMenuProps) {
  const [open, setOpen] = useState(false);
  const shown = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(shown, { toValue: open ? 1 : 0, duration: 150, useNativeDriver: true }).start();
  }, [open, shown]);

  useFocusEffect(
    useCallback(() => {
      if (!open) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setOpen(false);
        return true;
      });
      // Leaving the screen closes it, so it's never found open on return.
      return () => {
        sub.remove();
        setOpen(false);
      };
    }, [open])
  );

  return (
    <>
      <Animated.View pointerEvents={open ? 'auto' : 'none'} style={[styles.backdrop, { opacity: shown }]}>
        <Pressable style={styles.fill} onPress={() => setOpen(false)} accessibilityLabel="Close menu" />
      </Animated.View>
      <Animated.View
        pointerEvents={open ? 'box-none' : 'none'}
        style={[
          styles.items,
          {
            opacity: shown,
            transform: [{ translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [spacing.md, 0] }) }],
          },
        ]}
      >
        {items.map((item) => (
          <Pressable
            key={item.label}
            onPress={() => {
              setOpen(false);
              item.onPress();
            }}
            accessibilityRole="menuitem"
            accessibilityLabel={item.label}
            // A pressed colour on the pill itself rather than Android's ripple,
            // which spread to the pill's square corners.
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
          >
            <Ionicons name={item.icon} size={PILL.icon} color={colors.accentFg} />
            <Text style={styles.itemLabel}>{item.label}</Text>
          </Pressable>
        ))}
      </Animated.View>
      <Fab
        label={label}
        icon={open ? 'close' : icon}
        extended={extended}
        onPress={() => setOpen((o) => !o)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  fill: {
    flex: 1,
  },
  items: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.lg + FAB_SIZE + spacing.md,
    // The column is as wide as its widest pill, and every pill stretches to it.
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    height: PILL.height,
    minWidth: PILL.minWidth,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    elevation: 6,
  },
  itemPressed: {
    backgroundColor: colors.border,
  },
  itemLabel: {
    ...font.listTitle,
    fontSize: 17,
    lineHeight: 22,
    color: colors.text,
  },
});
