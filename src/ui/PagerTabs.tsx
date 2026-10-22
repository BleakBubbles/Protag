import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Keyboard, Pressable, StyleSheet, View, type ScrollViewInstance } from 'react-native';

import { colors, font, spacing } from './theme';

const TAB_HEIGHT = 44;
const BAR_HEIGHT = 3;
/** How much of its tab the bar spans. */
const BAR_SHARE = 0.56;
/** A tab's label away from its page; it brightens as its page slides in. */
const DIM = 0.45;

export interface Page<T extends string> {
  value: T;
  label: string;
  render: () => ReactNode;
}

export interface PagerTabsProps<T extends string> {
  pages: readonly Page<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Off while something on a page shouldn't be swiped away from (a selection). Tabs still work. */
  swipeEnabled?: boolean;
}

/**
 * Tabs that sit on the content they switch: a line across the screen with a
 * bar on the current tab, over pages you can also swipe between. The bar and
 * labels follow the pages as they move, so the tabs plainly drive them. A page
 * is only built the first time it's shown, then kept, so switching back is
 * instant.
 */
export function PagerTabs<T extends string>({ pages, value, onChange, swipeEnabled = true }: PagerTabsProps<T>) {
  const [width, setWidth] = useState(0);
  /** The pages' height: a sideways scroller doesn't stretch its pages to fill it. */
  const [height, setHeight] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const pager = useRef<ScrollViewInstance>(null);
  const index = Math.max(0, pages.findIndex((p) => p.value === value));
  const [shown, setShown] = useState<ReadonlySet<T>>(() => new Set([value]));

  useEffect(() => setShown((prev) => (prev.has(value) ? prev : new Set(prev).add(value))), [value]);
  // A tab tap changes `value`; the pages slide to it (a swipe is already there).
  // Leaving a page puts its keyboard away: a search field still focused on a
  // page off screen would keep taking the typing, and pull the pages back to it.
  useEffect(() => {
    Keyboard.dismiss();
    if (width > 0) pager.current?.scrollTo({ x: index * width, animated: true });
  }, [index, width]);

  const tabWidth = width / pages.length;
  // Before the first layout there's nothing to interpolate over.
  const span = Math.max(width, 1);

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {pages.map((page, i) => (
          <Pressable
            key={page.value}
            onPress={() => onChange(page.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: i === index }}
            style={styles.tab}
          >
            <Animated.Text
              style={[
                styles.label,
                {
                  opacity: scrollX.interpolate({
                    inputRange: [(i - 1) * span, i * span, (i + 1) * span],
                    outputRange: [DIM, 1, DIM],
                    extrapolate: 'clamp',
                  }),
                },
              ]}
            >
              {page.label}
            </Animated.Text>
          </Pressable>
        ))}
        {width > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.bar,
              {
                left: (tabWidth * (1 - BAR_SHARE)) / 2,
                width: tabWidth * BAR_SHARE,
                transform: [{ translateX: Animated.divide(scrollX, pages.length) }],
              },
            ]}
          />
        )}
      </View>

      <Animated.ScrollView
        ref={pager}
        onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
        horizontal
        pagingEnabled
        scrollEnabled={swipeEnabled}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        contentOffset={{ x: index * width, y: 0 }}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        onMomentumScrollEnd={(e) => {
          const landed = pages[Math.round(e.nativeEvent.contentOffset.x / span)];
          if (landed && landed.value !== value) onChange(landed.value);
        }}
      >
        {width > 0 &&
          pages.map((page) => (
            <View key={page.value} style={{ width, height }}>
              {shown.has(page.value) ? page.render() : null}
            </View>
          ))}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    height: TAB_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  label: {
    ...font.name,
    color: colors.text,
  },
  bar: {
    position: 'absolute',
    bottom: 0,
    height: BAR_HEIGHT,
    borderTopLeftRadius: BAR_HEIGHT,
    borderTopRightRadius: BAR_HEIGHT,
    backgroundColor: colors.text,
  },
});
