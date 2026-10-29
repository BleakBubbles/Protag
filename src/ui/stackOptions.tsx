import { useMemo } from 'react';
import { StyleSheet, Text, type ColorValue } from 'react-native';

import { headerTitleStyle, navTextScale } from './theme';
import { useColors } from './ThemeContext';

/** A header title's text; for a header that builds its own title (a tag page's, with its colour dot). */
export const headerTitleText = {
  ...headerTitleStyle,
  fontSize: 20,
  lineHeight: 26,
  transform: [{ translateY: -1.5 }],
};

/**
 * A header's title, in the display face at the header's default Android size.
 * Lora's letters sit low in their line, so on the header's centre line beside
 * an icon (×, back, settings) they looked a touch low; they're raised to line
 * up by eye.
 */
export function HeaderTitle({ children, tintColor }: { children: string; tintColor?: ColorValue }) {
  const colors = useColors();
  return (
    <Text
      style={[styles.title, { color: tintColor ?? colors.text }]}
      numberOfLines={1}
      maxFontSizeMultiplier={navTextScale}
    >
      {children}
    </Text>
  );
}

/** Header and background styling shared by every stack, so nested stacks match the root. */
export function useStackScreenOptions() {
  const colors = useColors();
  return useMemo(
    () => ({
      headerStyle: { backgroundColor: colors.bg },
      headerTintColor: colors.text,
      headerTitleStyle,
      headerTitle: HeaderTitle,
      contentStyle: { backgroundColor: colors.bg },
    }),
    [colors]
  );
}

const styles = StyleSheet.create({
  title: headerTitleText,
});
