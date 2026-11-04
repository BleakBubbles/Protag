import { Ionicons } from '@expo/vector-icons';
import { Fragment, memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import type { TagMark } from '../../library/bulkTags';
import { font, radius, spacing } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';

const GAP = spacing.sm;
const HEIGHT = 36;
/** The › end of a family's chip. */
const OPEN_WIDTH = 32;
const NOTCH = 7;
/** Trays nest this deep; deeper ones open without stepping in, so chips keep their room. */
const MAX_NEST = 3;

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
  /** The whole path, for the caption of a tray too deep to step in. */
  pathOf?: (tag: T) => string;
  markOf: (id: number) => TagMark;
  /** For a tag on some of the songs, how many, like "3/5". */
  countOf?: (id: number) => string | undefined;
  /** A tag's subtags, in order. Empty for none. */
  childrenOf: (id: number) => readonly T[];
  isOpen?: (id: number) => boolean;
  onPress: (id: number) => void;
  onOpen?: (id: number) => void;
  /** How many trays in this flow sits; set by the flow itself. */
  depth?: number;
}

/**
 * Tags as chips that wrap like words, for picking several at a glance. A tag
 * with subtags has a › of its own: tapping the name tags, tapping the › opens
 * the family into a tray under the line it sits on, tinted in its colour and
 * pointing back at it. So the lines above never move, and a family can be
 * looked through without tagging anything.
 *
 * Lines are packed here, not by flex wrapping, to know where a line ends and
 * where the › sits; the chips are measured on the first pass (behind the
 * screen's opening slide).
 */
export function TagChipFlow<T extends FlowTag>(props: TagChipFlowProps<T>) {
  const { tags, labelOf, pathOf = labelOf, markOf, countOf, childrenOf, isOpen, onPress, onOpen, depth = 0 } = props;
  const colors = useColors();
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const [widths, setWidths] = useState<ReadonlyMap<number, number>>(new Map());
  const measure = (id: number, w: number) =>
    setWidths((prev) => (prev.get(id) === w ? prev : new Map(prev).set(id, w)));
  const lines = useMemo(() => pack(tags, widths, width), [tags, widths, width]);

  const chip = (tag: T) => {
    const family = childrenOf(tag.id).length > 0;
    return (
      <TagToggleChip
        key={tag.id}
        id={tag.id}
        label={labelOf(tag)}
        color={tag.color}
        mark={markOf(tag.id)}
        count={countOf?.(tag.id)}
        open={family ? Boolean(isOpen?.(tag.id)) : undefined}
        onPress={onPress}
        onOpen={onOpen}
        onMeasure={measure}
      />
    );
  };
  // `notch`: where the tag's › is along its line, when the line's been packed.
  const tray = (tag: T, notch?: number) => {
    const kids = childrenOf(tag.id);
    if (kids.length === 0 || !isOpen?.(tag.id)) return null;
    const tint = colors.tag(tag.color);
    const flat = depth >= MAX_NEST;
    return (
      <View
        key={`tray-${tag.id}`}
        style={[styles.tray, { backgroundColor: `${tint}1C`, borderColor: `${tint}4D` }, flat && styles.flat]}
      >
        {notch !== undefined && <View style={[styles.notch, { left: notch - NOTCH, borderBottomColor: `${tint}4D` }]} />}
        <Text style={[styles.caption, { color: tint }]} numberOfLines={1}>
          in {flat ? pathOf(tag) : labelOf(tag)}
        </Text>
        <TagChipFlow {...props} tags={kids} depth={depth + 1} />
      </View>
    );
  };

  return (
    <View style={styles.flow} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {lines ? (
        lines.map((line, i) => {
          let x = 0;
          const notches = line.map((tag) => {
            x += widths.get(tag.id)! + GAP;
            return x - GAP - OPEN_WIDTH / 2;
          });
          return (
            <Fragment key={i}>
              <View style={styles.line}>{line.map(chip)}</View>
              {line.map((tag, j) => tray(tag, notches[j]))}
            </Fragment>
          );
        })
      ) : (
        <>
          <View style={[styles.line, styles.wrap]}>{tags.map(chip)}</View>
          {tags.map((tag) => tray(tag))}
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
  count: string | undefined;
  /** For a tag with subtags, whether its tray is open; undefined for one without. */
  open: boolean | undefined;
  onPress: (id: number) => void;
  onOpen?: (id: number) => void;
  onMeasure: (id: number, width: number) => void;
}

/**
 * A tag that's on (filled with its colour), off (outlined in it) or on some
 * of the songs (lightly tinted, with how many: "3/5"). Its width never changes with its state, so
 * toggling one never moves the others.
 */
const TagToggleChip = memo(function TagToggleChip({ id, label, color, mark, count, open, onPress, onOpen, onMeasure }: TagToggleChipProps) {
  const colors = useColors();
  const styles = useStyles();
  const tint = colors.tag(color);
  const on = mark === 'all';
  const ink = on ? colors.onTag : colors.text;
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => onMeasure(id, e.nativeEvent.layout.width)}
      style={[
        styles.chip,
        { borderColor: on ? tint : `${tint}8C` },
        on && { backgroundColor: tint },
        mark === 'some' && { backgroundColor: `${tint}33`, borderColor: tint },
      ]}
    >
      <Pressable
        onPress={() => onPress(id)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: mark === 'some' ? 'mixed' : on }}
        accessibilityLabel={`${label}, ${count && mark === 'some' ? `on ${count.replace('/', ' of ')} songs` : MARK_LABEL[mark]}`}
        style={({ pressed }) => [styles.name, open !== undefined && styles.nameBeforeOpen, pressed && styles.pressed]}
      >
        <View style={[styles.dot, { backgroundColor: on ? colors.onTag : tint }, on && styles.dotOn]} />
        <Text style={[styles.label, { color: ink }]} numberOfLines={1}>
          {label}
        </Text>
        {count !== undefined && <Text style={[styles.count, { color: on ? ink : tint }]}>{count}</Text>}
      </Pressable>
      {open !== undefined && (
        <Pressable
          onPress={() => onOpen?.(id)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${open ? 'Close' : 'Open'} ${label}`}
          style={({ pressed }) => [
            styles.open,
            { borderLeftColor: on ? `${colors.onTag}33` : `${tint}66` },
            pressed && styles.pressed,
          ]}
        >
          <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={13} color={on ? ink : colors.textDim} />
        </Pressable>
      )}
    </View>
  );
});

const useStyles = makeStyles((colors) => StyleSheet.create({
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
  tray: {
    padding: spacing.sm,
    paddingTop: spacing.sm - 2,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.xs + 2,
  },
  // Too deep to step in again: the chips keep the room they have.
  flat: {
    paddingHorizontal: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  // A small triangle on the tray's top edge, under the › that opened it.
  notch: {
    position: 'absolute',
    top: -NOTCH - 1,
    width: 0,
    height: 0,
    borderLeftWidth: NOTCH,
    borderRightWidth: NOTCH,
    borderBottomWidth: NOTCH,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  caption: {
    ...font.caption,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginHorizontal: 2,
  },
  chip: {
    height: HEIGHT,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  name: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  nameBeforeOpen: {
    paddingRight: spacing.sm + 2,
  },
  open: {
    width: OPEN_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1.5,
  },
  pressed: {
    backgroundColor: '#8080802E',
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
  count: {
    ...font.caption,
    fontVariant: ['tabular-nums'],
  },
}));
