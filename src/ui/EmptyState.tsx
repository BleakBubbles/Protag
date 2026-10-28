import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from './Icon';
import { font, spacing } from './theme';
import { makeStyles, useColors } from './ThemeContext';

export interface EmptyStateProps {
  icon?: IconName;
  /** Shown in place of the icon, e.g. a muted logo. */
  art?: ReactNode;
  title: string;
  body?: string;
  /** Buttons or anything else to offer a way forward. */
  children?: ReactNode;
  /** For a whole tab with nothing in it yet: a bigger icon and title. */
  large?: boolean;
}

export function EmptyState({ icon, art, title, body, children, large }: EmptyStateProps) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.container}>
      {art ?? (icon ? <Icon name={icon} size={large ? 64 : 48} color={colors.textFaint} /> : null)}
      <Text style={[styles.title, large && styles.titleLarge]}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {/* A row, so buttons centre here whatever their own alignSelf. */}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  // Full width, centred inside, rather than a box shrunk to fit the words:
  // Android can measure that box in the system font before the display font
  // is ready (after a reload), and the wider serif then wraps out of sight.
  title: {
    ...font.heading,
    alignSelf: 'stretch',
    color: colors.text,
    textAlign: 'center',
  },
  titleLarge: {
    ...font.title,
  },
  body: {
    ...font.body,
    alignSelf: 'stretch',
    color: colors.textDim,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
}));
