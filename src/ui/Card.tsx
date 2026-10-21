import { Children, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { ButtonFillContext } from './Button';
import { InfoButton, type InfoButtonProps } from './InfoButton';
import { colors, font, iconSize, radius, spacing, touchTarget } from './theme';

export interface CardProps {
  /** Small uppercase caption above the content. */
  label?: string;
  /** Heading inside the card. */
  title?: string;
  /** An (i) beside the title that explains the card, so the card itself can stay short. */
  info?: InfoButtonProps;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function Card({ label, title, info, children, style }: CardProps) {
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

/**
 * A card's buttons, sharing its width equally: one button spans the card, two
 * get half each. Main action first (tonal), the other after it (secondary).
 */
export function CardActions({ children }: { children: ReactNode }) {
  return (
    <ButtonFillContext.Provider value={true}>
      <View style={styles.actions}>
        {Children.toArray(children).map((child, i) => (
          <View key={i} style={styles.slot}>
            {child}
          </View>
        ))}
      </View>
    </ButtonFillContext.Provider>
  );
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
    flex: 1,
  },
  // The (i) sits in the top-right corner; its touch area overhangs the row.
  info: {
    height: font.heading.lineHeight,
    justifyContent: 'center',
    marginRight: -(touchTarget - iconSize.sm) / 2,
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
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  slot: {
    flex: 1,
  },
});
