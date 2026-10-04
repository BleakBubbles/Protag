import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { IconName } from './IconButton';
import { colors, font, spacing } from './theme';

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  body?: string;
  /** Buttons or anything else to offer a way forward. */
  children?: ReactNode;
}

export function EmptyState({ icon, title, body, children }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={48} color={colors.textFaint} />
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {children}
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
});
