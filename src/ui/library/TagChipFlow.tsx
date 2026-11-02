import { Ionicons } from '@expo/vector-icons';
import { Fragment, memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import type { TagMark } from '../../library/bulkTags';
import { font, radius, spacing } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';

const GAP = spacing.sm;
const HEIGHT = 36;

const MARK_LABEL: Record<TagMark, string> = {
  all: 'on all selected songs',
  some: 'on some selected songs',
  none: 'on none of the selected songs',
};

export interface FlowTag {
  id: number;
  color: string | null;
}

export interface TagChipFlowProps<T extends FlowTag> {
  tags: readonly T[];
  labelOf: (tag: T) => string;
  markOf: (id: number) => TagMark;
  /** A tag's subtags, in order: shown on a line of their own while it's on. Empty for none. */
  childrenOf: (id: number) => readonly T[];
  onPress: (id: number) => void;
}

/**
 * Tags as chips that wrap like words, for picking several at a glance. A tag
 * with subtags opens while it's on: its subtags drop in on an indented line
 * under the line it sits on, so the lines above never move and the tree shows
 * only as far as it's been tagged.
 *
 * Lines are packed here, not by flex wrapping, to know where a line ends; the
 * chips are measured on the first pass (behind the screen's opening slide).
 */
export function TagChipFlow<T extends FlowTag>(props: TagChipFlowProps<T>) {
  const { tags, labelOf, markOf, childrenOf, onPress } = props;
  const colors = useColors();
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const [widths, setWidths] = useState<ReadonlyMap<number, number>>(new Map());
  const measure = (id: number, w: number) =>
    setWidths((prev) => (prev.get(id) === w ? prev : new Map(prev).set(id, w)));
  const lines = useMemo(() => pack(tags, widths, width), [tags, widths, width]);

  const chip = (tag: T) => {
    const kids = childrenOf(tag.id).length;
    return (
      <TagToggleChip
        key={tag.id}
        id={tag.id}
        label={labelOf(tag)}
        color={tag.color}
        mark={markOf(tag.id)}
        family={kids > 0}
        onPress={onPress}
        onMeasure={measure}
      />
    );
  };
  const family = (tag: T) => {
    const kids = childrenOf(tag.id);
    if (kids.length === 0 || markOf(tag.id) === 'none') return null;
    return (
      <View key={`kids-${tag.id}`} style={[styles.kids, { borderLeftColor: colors.tag(tag.color) }]}>
        <TagChipFlow {...props} tags={kids} />
      </View>
    );
  };

  return (
    <View style={styles.flow} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {lines ? (
        lines.map((line, i) => (
          <Fragment key={i}>
            <View style={styles.line}>{line.map(chip)}</View>
            {line.map(family)}
          </Fragment>
        ))
      ) : (
        <>
          <View style={[styles.line, styles.wrap]}>{tags.map(chip)}</View>
          {tags.map(family)}
        </>
      )}
    </View>
  );
}

/** The chips in lines as wide as `width`; null until every chip has been measured. */
function pack<T extends FlowTag>(tags: readonly T[], widths: ReadonlyMap<number, number>, width: number): T[][] | null {
  if (width === 0) return null;
  const lines: T[][] = [];
  let line: T[] = [];
  let used = 0;
  for (const tag of tags) {
    const w = widths.get(tag.id);
    if (w === undefined) return null;
    const need = line.length === 0 ? w : used + GAP + w;
    if (line.length > 0 && need > width + 0.5) {
      lines.push(line);
      line = [tag];
      used = w;
    } else {
      line.push(tag);
      used = need;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

interface TagToggleChipProps {
  id: number;
  label: string;
  color: string | null;
  mark: TagMark;
  /** Has subtags: a chevron says it opens. */
  family: boolean;
  onPress: (id: number) => void;
  onMeasure: (id: number, width: number) => void;
}

/**
 * A tag that's on (filled with its colour), off (outlined in it) or on some
 * of the songs (half filled). Its width never changes with its state, so
 * toggling one never moves the others.
 */
const TagToggleChip = memo(function TagToggleChip({ id, label, color, mark, family, onPress, onMeasure }: TagToggleChipProps) {
  const colors = useColors();
  const styles = useStyles();
  const tint = colors.tag(color);
  const on = mark === 'all';
  const ink = on ? colors.onTag : colors.text;
  return (
    <Pressable
      onPress={() => onPress(id)}
      onLayout={(e: LayoutChangeEvent) => onMeasure(id, e.nativeEvent.layout.width)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: mark === 'some' ? 'mixed' : on }}
      accessibilityLabel={`${label}, ${MARK_LABEL[mark]}${family ? ', has subtags' : ''}`}
      style={({ pressed }) => [
        styles.chip,
        { borderColor: on ? tint : `${tint}8C` },
        on && { backgroundColor: tint },
        pressed && styles.pressed,
      ]}
    >
      {mark === 'some' && <View style={[styles.half, { backgroundColor: `${tint}73` }]} />}
      <View style={[styles.dot, { backgroundColor: on ? colors.onTag : tint }, on && styles.dotOn]} />
      <Text style={[styles.label, { color: ink }]} numberOfLines={1}>
        {label}
      </Text>
      {family && <Ionicons name={mark === 'none' ? 'chevron-forward' : 'chevron-down'} size={12} color={ink} style={styles.chevron} />}
    </Pressable>
  );
});

const useStyles = makeStyles(() => StyleSheet.create({
  flow: {
    gap: GAP,
  },
  line: {
    flexDirection: 'row',
    gap: GAP,
  },
  wrap: {
    flexWrap: 'wrap',
  },
  kids: {
    marginLeft: spacing.md,
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
  },
  chip: {
    height: HEIGHT,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  pressed: {
    transform: [{ scale: 0.95 }],
  },
  half: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '50%',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOn: {
    opacity: 0.5,
  },
  label: {
    ...font.label,
    fontSize: 14,
    flexShrink: 1,
  },
  chevron: {
    marginLeft: -spacing.xs,
  },
}));
