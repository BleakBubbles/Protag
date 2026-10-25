import { StyleSheet, View } from 'react-native';

import type { TagWithCounts } from '../../db/types';
import type { TagChoice } from '../../query/types';
import { spacing } from '../theme';
import { TagTile } from './TagTile';

const COLUMNS = 2;
/** Room between tiles for both their rings (TagTile) and a sliver of space. */
const GAP = spacing.md;

export interface TagGridProps {
  /** Tags at this level. */
  tags: readonly TagWithCounts[];
  /** How many subtags a tag has, for the strip that goes in to them. */
  subtagsOf: (tagId: number) => number;
  choiceOf: (tagId: number) => TagChoice;
  onTap: (tagId: number) => void;
  /** Go in to a tag's subtags. */
  onOpen: (tagId: number) => void;
  /** The width this level has to fill. */
  width: number;
  /** A tag's parent's name, shown before its own: for search results, where levels mix. */
  parentOf?: (tag: TagWithCounts) => string | undefined;
}

/** One level of tags as a two-column grid of tiles. */
export function TagGrid({ tags, subtagsOf, choiceOf, onTap, onOpen, width, parentOf }: TagGridProps) {
  const tileWidth = (width - GAP * (COLUMNS - 1)) / COLUMNS;
  const rows: TagWithCounts[][] = [];
  for (let i = 0; i < tags.length; i += COLUMNS) rows.push(tags.slice(i, i + COLUMNS));

  return (
    <View style={styles.grid}>
      {rows.map((row) => (
        <View key={row[0].id} style={styles.row}>
          {row.map((tag) => (
            <TagTile
              key={tag.id}
              tagId={tag.id}
              name={tag.name}
              parent={parentOf?.(tag)}
              color={tag.color}
              songCount={tag.song_count}
              choice={choiceOf(tag.id)}
              width={tileWidth}
              onPress={() => onTap(tag.id)}
              subtags={subtagsOf(tag.id)}
              onOpen={() => onOpen(tag.id)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    gap: GAP,
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
  },
});
