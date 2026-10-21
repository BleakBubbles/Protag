import { useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View, type ViewInstance } from 'react-native';

import { IconButton } from './IconButton';
import { colors, font, iconSize, radius, spacing } from './theme';

export interface InfoButtonProps {
  /** What it explains, for the bubble's heading and the button's label ("About playlists"). */
  topic: string;
  /** Short paragraphs; each string is one. */
  paragraphs: readonly ReactNode[];
}

const MAX_WIDTH = 320;
/** The screen's edge margin, which the bubble keeps clear of. */
const EDGE = spacing.lg;
const POINTER = 10;

type Rect = { x: number; y: number; width: number; height: number };

/**
 * An (i) that opens a short explanation in a bubble pointing at it. Screens
 * show what's there and what to do; the why lives behind this, one tap away
 * for whoever wants it. Tap anywhere (or back) to close.
 */
export function InfoButton({ topic, paragraphs }: InfoButtonProps) {
  const anchor = useRef<ViewInstance>(null);
  const [at, setAt] = useState<Rect | null>(null);

  const open = () =>
    anchor.current?.measureInWindow((x, y, width, height) => setAt({ x, y, width, height }));

  return (
    <View ref={anchor} collapsable={false}>
      <IconButton
        icon="information-circle-outline"
        label={`About ${topic.toLowerCase()}`}
        size={iconSize.sm}
        color={colors.textDim}
        onPress={open}
      />
      <Modal visible={at !== null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setAt(null)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setAt(null)} accessibilityLabel="Close">
          {at && <Bubble anchor={at} topic={topic} paragraphs={paragraphs} />}
        </Pressable>
      </Modal>
    </View>
  );
}

/**
 * Right-aligned under the (i), with a pointer at it; above it instead when
 * there isn't room below. Hidden for the one frame it takes to measure itself.
 */
function Bubble({ anchor, topic, paragraphs }: { anchor: Rect } & InfoButtonProps) {
  const screen = useWindowDimensions();
  const [height, setHeight] = useState<number | null>(null);

  const width = Math.min(MAX_WIDTH, screen.width - EDGE * 2);
  const centre = anchor.x + anchor.width / 2;
  const left = Math.min(Math.max(EDGE, centre + POINTER * 2 - width), screen.width - EDGE - width);
  const below = anchor.y + anchor.height + POINTER;
  const fitsBelow = height === null || below + height <= screen.height - EDGE;
  const top = fitsBelow ? below : anchor.y - POINTER - (height ?? 0);

  return (
    <View
      style={[styles.bubble, { width, left, top, opacity: height === null ? 0 : 1 }]}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
    >
      <View
        style={[
          styles.pointer,
          { left: centre - left - POINTER },
          fitsBelow ? styles.pointerUp : styles.pointerDown,
        ]}
      />
      <Text style={styles.topic}>{topic}</Text>
      {paragraphs.map((text, i) => (
        <Text key={i} style={styles.paragraph}>
          {text}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    elevation: 12,
  },
  // A square turned on its corner, half of it showing past the bubble's edge.
  pointer: {
    position: 'absolute',
    width: POINTER * 2,
    height: POINTER * 2,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    transform: [{ rotate: '45deg' }],
  },
  // Outlined on the two sides that show: the corner pointing up, or down.
  pointerUp: {
    top: -POINTER,
    borderLeftWidth: 1,
    borderTopWidth: 1,
  },
  pointerDown: {
    bottom: -POINTER,
    borderRightWidth: 1,
    borderBottomWidth: 1,
  },
  topic: {
    ...font.heading,
    color: colors.text,
  },
  paragraph: {
    ...font.body,
    color: colors.textDim,
  },
});
