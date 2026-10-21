import { useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from './BottomSheet';
import { IconButton } from './IconButton';
import { colors, font, iconSize, spacing } from './theme';

export interface InfoButtonProps {
  /** What it explains, for the sheet's heading and the button's label ("About playlists"). */
  topic: string;
  /** Short paragraphs; each string is one. */
  paragraphs: readonly ReactNode[];
}

/**
 * An (i) that opens a short explanation. Screens show what's there and what
 * to do; the why lives behind this, one tap away for whoever wants it.
 */
export function InfoButton({ topic, paragraphs }: InfoButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        icon="information-circle-outline"
        label={`About ${topic.toLowerCase()}`}
        size={iconSize.sm}
        color={colors.textDim}
        onPress={() => setOpen(true)}
      />
      <BottomSheet visible={open} title={topic} onClose={() => setOpen(false)}>
        <View style={styles.body}>
          {paragraphs.map((text, i) => (
            <Text key={i} style={styles.paragraph}>
              {text}
            </Text>
          ))}
        </View>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  paragraph: {
    ...font.body,
    color: colors.textDim,
  },
});
