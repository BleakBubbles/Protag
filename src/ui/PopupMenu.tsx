import { Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from './Icon';
import { Popover, type Rect } from './Popover';
import { colors, font, radius, spacing, touchTarget } from './theme';

export interface MenuAction {
  label: string;
  onPress: () => void;
  /** Shown before the label. */
  icon?: IconName;
  /** In red, set apart below a line (deleting, say). */
  destructive?: boolean;
  /** Shown but not selectable, e.g. the current parent in a "move to" list. */
  disabled?: boolean;
}

export interface PopupMenuProps {
  /** What opened it (a ⋯, a card, a pill); null while closed. See `useAnchor`. */
  anchor: Rect | null;
  actions: readonly MenuAction[];
  onClose: () => void;
  /** Above the actions: what they apply to, when that's worth repeating (a mix's artwork and tags). */
  header?: ReactNode;
  /** Dims the screen behind it, so what it's for stands out (a held card). */
  dim?: boolean;
  /** See `Popover`'s `flush`. */
  flush?: boolean;
}

const WIDTH = 240;
/** A touch bigger than the small icon size, to sit level with the menu's medium-weight labels. */
const MENU_ICON = 22;

/**
 * A short list of actions dropping from whatever opened it, like Android's
 * overflow menu, each with its icon; a destructive one sits apart below a
 * line, in red. Every action closes the menu before running.
 */
export function PopupMenu({ anchor, actions, onClose, header, dim, flush }: PopupMenuProps) {
  return (
    <Popover anchor={anchor} onClose={onClose} width={WIDTH} dim={dim} flush={flush} dark>
      <View style={styles.menu} accessibilityRole="menu">
        {header && <View style={styles.header}>{header}</View>}
        {actions.map((action, i) => (
          <Fragment key={action.label}>
            {action.destructive && i > 0 && <View style={styles.line} />}
            <Pressable
              disabled={action.disabled}
              onPress={() => {
                onClose();
                action.onPress();
              }}
              accessibilityRole="menuitem"
              accessibilityState={{ disabled: action.disabled }}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              {action.icon && (
                <Icon
                  name={action.icon}
                  size={MENU_ICON}
                  color={action.destructive ? colors.danger : action.disabled ? colors.textFaint : colors.text}
                />
              )}
              <Text
                style={[styles.label, action.destructive && styles.destructive, action.disabled && styles.disabled]}
                numberOfLines={1}
              >
                {action.label}
              </Text>
            </Pressable>
          </Fragment>
        ))}
      </View>
    </Popover>
  );
}

const styles = StyleSheet.create({
  // Clips the pressed highlight to the panel's corners.
  menu: {
    paddingVertical: spacing.xs,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    marginBottom: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  item: {
    minHeight: touchTarget + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pressed: {
    backgroundColor: colors.border,
  },
  line: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.xs,
    backgroundColor: colors.border,
  },
  label: {
    ...font.name,
    flexShrink: 1,
    color: colors.text,
  },
  destructive: {
    color: colors.danger,
  },
  disabled: {
    color: colors.textFaint,
  },
});
