import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { IconName } from '../IconButton';
import { colors, font, iconSize, radius, spacing } from '../theme';

/** Fits in the room a list already leaves at the bottom for its floating button. */
export const SELECTION_BAR_HEIGHT = 64;

export interface SelectionAction {
  label: string;
  icon: IconName;
  onPress: () => void;
  destructive?: boolean;
}

/**
 * What can be done to the selected items, floating where the list's add
 * button sits. Big, evenly split targets with an icon over a short label.
 */
export function SelectionBar({ actions }: { actions: readonly SelectionAction[] }) {
  return (
    <View style={styles.bar}>
      {actions.map((action) => {
        const color = action.destructive ? colors.danger : colors.text;
        return (
          <Pressable
            key={action.label}
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            android_ripple={{ color: colors.border, borderless: false }}
            style={styles.action}
          >
            <Ionicons name={action.icon} size={iconSize.sm} color={color} />
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {action.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    height: SELECTION_BAR_HEIGHT,
    flexDirection: 'row',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    elevation: 8,
  },
  action: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    ...font.caption,
  },
});
