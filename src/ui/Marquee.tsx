import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
} from 'react-native';

import { useReduceMotion } from './motion';

/** Pixels per second: slow enough to read along. */
const SPEED = 30;
/** Rest at the start of each pass, so the beginning can be read first. */
const PAUSE_MS = 1500;
/** Space between the end of the text and its next copy. */
const GAP = 48;

export interface MarqueeProps {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  /** The most room it may take; narrower text takes only its own width. */
  maxWidth: number;
}

/**
 * One line of text that scrolls sideways when it doesn't fit, like a song
 * title in a car stereo or another music player. It only moves when it has to,
 * and stays still (cut off with an ellipsis) when the phone asks for reduced
 * motion.
 *
 * How: the text sits in a horizontal ScrollView, so it lays out at its full
 * width, which is measured; past `maxWidth`, it slides left by its width plus
 * a gap, with a second copy following on, and starts again from where the
 * copy now sits, which looks the same.
 */
export function Marquee({ children, style, maxWidth }: MarqueeProps) {
  const [textWidth, setTextWidth] = useState(0);
  const reduceMotion = useReduceMotion();
  const offset = useRef(new Animated.Value(0)).current;
  const overflows = textWidth > maxWidth && maxWidth > 0;

  useEffect(() => {
    offset.setValue(0);
    if (!overflows || reduceMotion) return;
    const distance = textWidth + GAP;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(PAUSE_MS),
        Animated.timing(offset, {
          toValue: -distance,
          duration: (distance / SPEED) * 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(offset, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [overflows, reduceMotion, textWidth, offset]);

  if (reduceMotion) {
    return (
      <Text style={[style, { maxWidth }]} numberOfLines={1}>
        {children}
      </Text>
    );
  }

  return (
    <ScrollView
      horizontal
      scrollEnabled={false}
      showsHorizontalScrollIndicator={false}
      // Until measured, it takes no room rather than flashing at full width.
      style={[styles.window, { width: Math.max(0, Math.min(textWidth, maxWidth)) }]}
    >
      <Animated.View style={[styles.row, { transform: [{ translateX: offset }] }]}>
        <Text style={style} onLayout={(e) => setTextWidth(Math.ceil(e.nativeEvent.layout.width))}>
          {children}
        </Text>
        {overflows && <Text style={[style, styles.copy]}>{children}</Text>}
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  window: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
  },
  copy: {
    marginLeft: GAP,
  },
});
