import { ScrollView, StyleSheet, View } from 'react-native';

import { spacing } from '../theme';
import { MixCard } from './MixCard';

const GAP = spacing.sm;

export interface ShelfMix {
  id: number;
  name: string;
  description: string;
  albumIds: readonly string[];
  color: string;
}

export interface MixShelfProps {
  mixes: readonly ShelfMix[];
  /** The width the shelf has to fill. */
  width: number;
  onPlay: (id: number) => void;
  onMenu: (id: number) => void;
}

/**
 * Saved mixes in two rows. Up to four fill the width exactly; past that, the
 * columns narrow so the next one peeks in from the edge, showing there's more
 * to scroll to.
 */
export function MixShelf({ mixes, width, onPlay, onMenu }: MixShelfProps) {
  const cardWidth = mixes.length <= 4 ? (width - GAP) / 2 : (width - GAP) * 0.45;
  const columns: ShelfMix[][] = [];
  for (let i = 0; i < mixes.length; i += 2) columns.push(mixes.slice(i, i + 2));

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      scrollEnabled={mixes.length > 4}
      contentContainerStyle={styles.columns}
    >
      {columns.map((column) => (
        <View key={column[0].id} style={styles.column}>
          {column.map((mix) => (
            <MixCard
              key={mix.id}
              name={mix.name}
              description={mix.description}
              albumIds={mix.albumIds}
              color={mix.color}
              width={cardWidth}
              onPress={() => onPlay(mix.id)}
              onLongPress={() => onMenu(mix.id)}
            />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  columns: {
    gap: GAP,
  },
  column: {
    gap: GAP,
  },
});
