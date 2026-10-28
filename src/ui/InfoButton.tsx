import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { IconButton } from './IconButton';
import { Popover, useAnchor } from './Popover';
import { font, iconSize, spacing } from './theme';
import { makeStyles, useColors } from './ThemeContext';

export interface InfoButtonProps {
  /** What it explains, for the bubble's heading and the button's label ("About playlists"). */
  topic: string;
  /** Short paragraphs; each string is one. */
  paragraphs: readonly ReactNode[];
}

const WIDTH = 320;

/**
 * An (i) that opens a short explanation in a bubble pointing at it. Screens
 * show what's there and what to do; the why lives behind this, one tap away
 * for whoever wants it. Tap anywhere (or back) to close.
 */
export function InfoButton({ topic, paragraphs }: InfoButtonProps) {
  const colors = useColors();
  const styles = useStyles();
  const anchor = useAnchor();
  return (
    <View ref={anchor.ref} collapsable={false}>
      <IconButton
        icon="information-circle-outline"
        label={`About ${topic.toLowerCase()}`}
        size={iconSize.sm}
        color={colors.textDim}
        onPress={anchor.open}
      />
      <Popover anchor={anchor.rect} onClose={anchor.close} width={WIDTH} pointer dim>
        <View style={styles.bubble}>
          <Text style={styles.topic}>{topic}</Text>
          {paragraphs.map((text, i) => (
            <Text key={i} style={styles.paragraph}>
              {text}
            </Text>
          ))}
        </View>
      </Popover>
    </View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  bubble: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  topic: {
    ...font.heading,
    color: colors.text,
  },
  paragraph: {
    ...font.body,
    color: colors.textDim,
  },
}));
