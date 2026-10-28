import { useCallback, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

/**
 * `getItemLayout` for a FlatList of fixed-height rows below a header.
 *
 * Fixed row heights let the list compute positions instead of measuring every
 * row. But React Native measures drawn rows from the top of the *content*,
 * header included, while `getItemLayout` describes undrawn ones — so the
 * offsets must include the header too, or the two disagree by its height and
 * long lists can jump or flash blank when flung. Put `onHeaderLayout` on a
 * View wrapping the list header.
 */
export function useFixedRowLayout(rowHeight: number) {
  const [headerHeight, setHeaderHeight] = useState(0);

  const onHeaderLayout = useCallback(
    (e: LayoutChangeEvent) => setHeaderHeight(e.nativeEvent.layout.height),
    []
  );

  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: rowHeight,
      offset: headerHeight + rowHeight * index,
      index,
    }),
    [rowHeight, headerHeight]
  );

  return { getItemLayout, onHeaderLayout, headerHeight };
}
