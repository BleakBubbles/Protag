import { useWindowDimensions } from 'react-native';

/**
 * A fixed height that grows with the phone's font size. `base` is the height at
 * the normal size; `text` is how much of it is lines of text, the part that
 * grows. Lists of fixed-height rows stay quick to scroll (positions are
 * arithmetic), and their text still has room at the largest sizes. Never
 * shrinks below `base`, so a smaller font keeps rows comfortable to tap.
 */
export function useScaledHeight(base: number, text: number): number {
  const { fontScale } = useWindowDimensions();
  return Math.round(base + text * Math.max(0, fontScale - 1));
}
