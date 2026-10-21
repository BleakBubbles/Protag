import { useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ViewInstance } from 'react-native';

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
        <Pressable style={styles.scrim} onPress={() => setAt(null)} accessibilityLabel="Close">
          {at && <Bubble anchor={at} topic={topic} paragraphs={paragraphs} />}
        </Pressable>
      </Modal>
    </View>
  );
}

/**
 * Right-aligned under the (i), with a pointer at it; above it when there's
 * more room there. It always fits on screen: width is capped by the screen,
 * and when the text is taller than the room on either side (large system
 * fonts, a small phone, landscape), the bubble stops at the margin and its
 * text scrolls. Hidden for the one frame it takes to measure itself.
 */
function Bubble({ anchor, topic, paragraphs }: { anchor: Rect } & InfoButtonProps) {
  const screen = useWindowDimensions();
  /** The text's full height, however much of it fits. */
  const [natural, setNatural] = useState<number | null>(null);

  const width = Math.min(MAX_WIDTH, screen.width - EDGE * 2);
  const centre = anchor.x + anchor.width / 2;
  const left = Math.min(Math.max(EDGE, centre + POINTER * 2 - width), screen.width - EDGE - width);
  const below = anchor.y + anchor.height + POINTER;
  const roomBelow = screen.height - EDGE - below;
  const roomAbove = anchor.y - POINTER - EDGE;
  const placeBelow = natural === null || natural <= roomBelow || roomBelow >= roomAbove;
  const height = natural === null ? undefined : Math.min(natural, placeBelow ? roomBelow : roomAbove);
  const top = placeBelow ? below : anchor.y - POINTER - (height ?? 0);

  return (
    <View style={[styles.bubble, { width, left, top, height, opacity: natural === null ? 0 : 1 }]}>
      <View style={[styles.pointer, { left: centre - left - POINTER }, placeBelow ? styles.pointerUp : styles.pointerDown]} />
      <ScrollView bounces={false}>
        <View style={styles.body} onLayout={(e) => setNatural(e.nativeEvent.layout.height)}>
          <Text style={styles.topic}>{topic}</Text>
          {paragraphs.map((text, i) => (
            <Text key={i} style={styles.paragraph}>
              {text}
            </Text>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // The app dimmed behind the bubble: it stands out, and a tap anywhere closes it.
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
  },
  // A step lighter than the cards it sits over; the dimmed app gives it its edge.
  bubble: {
    position: 'absolute',
    borderRadius: radius.lg,
    backgroundColor: colors.raised,
    elevation: 12,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  // A square turned on its corner, half of it showing past the bubble's edge.
  pointer: {
    position: 'absolute',
    width: POINTER * 2,
    height: POINTER * 2,
    backgroundColor: colors.raised,
    transform: [{ rotate: '45deg' }],
  },
  pointerUp: {
    top: -POINTER,
  },
  pointerDown: {
    bottom: -POINTER,
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
