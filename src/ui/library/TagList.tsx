import { useEffect, useMemo } from 'react';
import { View } from 'react-native';

import type { TagWithCounts } from '../../db/types';
import { useDragSelect } from '../hooks/useDragSelect';
import type { Selection } from '../hooks/useSelection';
import { TagRow, useTagRowHeight } from './TagRow';

export interface TagListProps {
  /** Siblings, in the order picked above them. */
  tags: readonly TagWithCounts[];
  /** The selection these tags are picked into (`useSelection`, with these tags' ids). */
  selection: Selection;
  onOpen: (id: number) => void;
  /** Dimmed and untappable, keeping their place (while selecting songs). */
  disabled?: boolean;
  /** A slide across rows is on: the list around them shouldn't scroll. */
  onBusy?: (busy: boolean) => void;
}

/**
 * Tags as folder rows that can be selected like songs: hold one to start, then
 * tap or slide across others.
 */
export function TagList({ tags, selection, onOpen, disabled, onBusy }: TagListProps) {
  const rowHeight = useTagRowHeight();
  const ids = useMemo(() => tags.map((t) => t.id), [tags]);
  const slide = useDragSelect({ ids, rowHeight, headerHeight: 0, selection });
  useEffect(() => onBusy?.(slide.dragging), [onBusy, slide.dragging]);

  return (
    <View ref={slide.frameRef} collapsable={false} {...slide.frameProps}>
      {tags.map((tag) => (
        <TagRow
          key={tag.id}
          name={tag.name}
          color={tag.color}
          songCount={tag.song_count}
          childCount={tag.child_count}
          onPress={() => (selection.selecting ? selection.toggle(tag.id) : onOpen(tag.id))}
          onLongPress={() => slide.start(tag.id)}
          selecting={selection.selecting}
          selected={selection.selection?.has(tag.id) ?? false}
          disabled={disabled}
        />
      ))}
    </View>
  );
}
