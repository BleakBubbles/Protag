import { Fragment } from 'react';
import { StyleSheet, View } from 'react-native';

import type { TagWithCounts } from '../../db/types';
import type { TagChoice } from '../../query/types';
import { spacing, tagColor } from '../theme';
import { TagTile } from './TagTile';

const COLUMNS = 2;
const GAP = spacing.sm;
/** Left border plus padding of a subtag block. */
const INDENT = 2 + spacing.md;

export interface TagGridProps {
  /** Tags at this level. */
  tags: readonly TagWithCounts[];
  childrenOf: ReadonlyMap<number | null, readonly TagWithCounts[]>;
  expanded: ReadonlySet<number>;
  choiceOf: (tagId: number) => TagChoice;
  onTap: (tagId: number) => void;
  onToggleExpanded: (tagId: number) => void;
  /** The width this level has to fill. */
  width: number;
}

/**
 * Tags as a two-column grid of tiles. A tag's subtags open as their own grid
 * *below its row*, not right after the tile, so expanding never moves the tile
 * beside it.
 */
export function TagGrid({ tags, childrenOf, expanded, choiceOf, onTap, onToggleExpanded, width }: TagGridProps) {
  const tileWidth = (width - GAP * (COLUMNS - 1)) / COLUMNS;
  const rows: TagWithCounts[][] = [];
  for (let i = 0; i < tags.length; i += COLUMNS) rows.push(tags.slice(i, i + COLUMNS));

  return (
    <View style={styles.grid}>
      {rows.map((row) => (
        <Fragment key={row[0].id}>
          <View style={styles.row}>
            {row.map((tag) => {
              const hasChildren = (childrenOf.get(tag.id)?.length ?? 0) > 0;
              return (
                <TagTile
                  key={tag.id}
                  tagId={tag.id}
                  name={tag.name}
                  color={tag.color}
                  songCount={tag.song_count}
                  choice={choiceOf(tag.id)}
                  width={tileWidth}
                  onPress={() => onTap(tag.id)}
                  expanded={expanded.has(tag.id)}
                  onToggleExpanded={hasChildren ? () => onToggleExpanded(tag.id) : undefined}
                />
              );
            })}
          </View>
          {row
            .filter((tag) => expanded.has(tag.id))
            .map((tag) => (
              <View key={`sub-${tag.id}`} style={[styles.subtags, { borderLeftColor: tagColor(tag.color) }]}>
                <TagGrid
                  tags={childrenOf.get(tag.id) ?? []}
                  childrenOf={childrenOf}
                  expanded={expanded}
                  choiceOf={choiceOf}
                  onTap={onTap}
                  onToggleExpanded={onToggleExpanded}
                  width={width - INDENT}
                />
              </View>
            ))}
        </Fragment>
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
  subtags: {
    borderLeftWidth: 2,
    paddingLeft: INDENT - 2,
  },
});
