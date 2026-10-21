import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { InfoButton, type InfoButtonProps } from './InfoButton';
import { colors, font, iconSize, radius, spacing, touchTarget } from './theme';

export interface CardProps {
  /** Small uppercase caption above the content. */
  label?: string;
  /** Heading inside the card. */
  title?: string;
  /** An (i) beside the title that explains the card, so the card itself can stay short. */
  info?: InfoButtonProps;
  /** A card's one action, at the end of the title row. */
  action?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Card({ label, title, info, action, children, style }: CardProps) {
  return (
    <View style={[styles.card, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {title ? (
        <View style={styles.titleRow}>
          <Text style={[styles.title, styles.titleText]}>{title}</Text>
          {info && (
            // Full touch area, overhanging the row so the card isn't taller for it.
            <View style={styles.info}>
              <InfoButton {...info} />
            </View>
          )}
          <View style={styles.spacer} />
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Body text inside a card. */
export function CardText({ children, tone = 'dim' }: { children: ReactNode; tone?: 'dim' | 'error' }) {
  return <Text style={tone === 'error' ? styles.error : styles.text}>{children}</Text>;
}

/** A line saying how things stand ("Last scanned 2 days ago"): smaller and quieter than body text. */
export function CardStatus({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.status} numberOfLines={1}>
      {children}
    </Text>
  );
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleText: {
    flexShrink: 1,
  },
  // The (i) sits just after the title; its touch area overhangs on every side.
  info: {
    height: font.heading.lineHeight,
    justifyContent: 'center',
    marginLeft: spacing.xs - (touchTarget - iconSize.sm) / 2,
    marginRight: -(touchTarget - iconSize.sm) / 2,
  },
  spacer: {
    flex: 1,
  },
  status: {
    ...font.label,
    color: colors.textFaint,
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
