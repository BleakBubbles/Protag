import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { Artwork } from './Artwork';

export interface ArtworkSlotProps {
  uri: string | null;
}

/**
 * Album art that fills whatever space its parent leaves it.
 *
 * Give it `flex: 1` worth of room among fixed-height siblings and it renders the
 * largest square that fits. Sizing art from the window instead means guessing
 * how tall the header, tab bar, and controls are — and on some screen that guess
 * is wrong and the player scrolls.
 */
export function ArtworkSlot({ uri }: ArtworkSlotProps) {
  const [size, setSize] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize(Math.max(0, Math.floor(Math.min(width, height))));
  };

  return (
    <View style={styles.slot} onLayout={onLayout}>
      {size > 0 && <Artwork uri={uri} size={size} />}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
