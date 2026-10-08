import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { IconName } from './IconButton';
import { colors, font, spacing } from './theme';

export interface EmptyStateProps {
  icon?: IconName;
  /** Shown in place of the icon, e.g. a muted logo. */
  art?: ReactNode;
  title: string;
  body?: string;
  /** Buttons or anything else to offer a way forward. */
  children?: ReactNode;
}

export function EmptyState({ icon, art, title, body, children }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {art ?? (icon ? <Ionicons name={icon} size={48} color={colors.textFaint} /> : null)}
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {/* A row, so buttons centre here whatever their own alignSelf. */}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  title: {
    ...font.heading,
    color: colors.text,
    textAlign: 'center',
  },
  body: {
    ...font.body,
    color: colors.textDim,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
});
