import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, font, radius, spacing } from './theme';

export interface CardProps {
  /** Small uppercase caption above the content. */
  label?: string;
  /** Heading inside the card. */
  title?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Card({ label, title, children, style }: CardProps) {
  return (
    <View style={[styles.card, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );
}

/** Body text inside a card. */
export function CardText({ children, tone = 'dim' }: { children: ReactNode; tone?: 'dim' | 'error' }) {
  return <Text style={tone === 'error' ? styles.error : styles.text}>{children}</Text>;
}

/** A horizontal group of buttons inside a card. */
export function CardActions({ children }: { children: ReactNode }) {
  return <View style={styles.actions}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  label: {
    ...font.caption,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    ...font.heading,
    color: colors.text,
  },
  text: {
    ...font.body,
    color: colors.textDim,
    flexShrink: 1,
  },
  error: {
    ...font.body,
    color: colors.danger,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
});
