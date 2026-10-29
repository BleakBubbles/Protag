import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { font, iconSize, radius, spacing } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';

/** The search row's height: the label row it replaces is this tall too, so opening it moves nothing. */
export const SEARCH_HEIGHT = 32;
const SLOP = 10;

export interface SectionHeadProps {
  /** "Your tags", "Artists". */
  label: string;
  /** The current order, said after the label; tapping it moves to the next. */
  sort: string;
  onSort: () => void;
  /** Anything at the row's end, like the search button. */
  children?: ReactNode;
  /** Keeps the row the search row's height, for the section that hosts it. */
  tall?: boolean;
  /** Shown in place of the label, like a `Trail` while inside a tag. */
  title?: ReactNode;
}

/** A Play tab section's label, with its order beside it as a quiet control. */
export function SectionHead({ label, sort, onSort, children, tall, title }: SectionHeadProps) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.head, tall && styles.tall]}>
      {title ?? <Text style={styles.label}>{label}</Text>}
      <Text style={styles.label}>·</Text>
      <Pressable
        onPress={onSort}
        hitSlop={SLOP}
        accessibilityRole="button"
        accessibilityLabel={`${label}, sorted ${sort}`}
        accessibilityHint="Changes the order"
        style={({ pressed }) => [styles.sort, pressed && styles.pressed]}
      >
        <Text style={styles.sortText}>{sort}</Text>
        <Ionicons name="swap-vertical" size={12} color={colors.textDim} />
      </Pressable>
      {children}
    </View>
  );
}

export interface TrailProps {
  /** Where it starts: "Your tags". */
  root: string;
  /** The tags gone in to, outermost first; the last is where you are. */
  path: readonly { id: number; name: string }[];
  /** Go back out to one of them, or to the start (null). */
  onGo: (id: number | null) => void;
}

/** Where you are among your tags, like "Your tags › kpop › generations": tap any but the last to go back out to it. */
export function Trail({ root, path, onGo }: TrailProps) {
  const colors = useColors();
  const styles = useStyles();
  const crumbs = [{ id: null, name: root }, ...path];
  return (
    <View style={styles.trail}>
      {crumbs.map((crumb, i) => {
        const here = i === crumbs.length - 1;
        return (
          <View key={crumb.id ?? 'root'} style={[styles.crumb, here && styles.here]}>
            {i > 0 && <Ionicons name="chevron-forward" size={10} color={colors.textFaint} />}
            <Pressable
              onPress={() => onGo(crumb.id)}
              disabled={here}
              hitSlop={SLOP}
              accessibilityRole="button"
              accessibilityLabel={here ? crumb.name : `Back to ${crumb.name}`}
              style={({ pressed }) => [styles.crumb, pressed && styles.pressed]}
            >
              <Text style={[styles.label, here && styles.hereText]} numberOfLines={1}>
                {crumb.name}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/** The magnifier at the end of a section head, which opens the search row. */
export function SearchButton({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={SLOP}
      accessibilityRole="button"
      accessibilityLabel="Search tags, artists and albums"
      style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}
    >
      <Ionicons name="search" size={iconSize.sm - 2} color={colors.textDim} />
    </Pressable>
  );
}

export interface SearchRowProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Clears the search and puts the label row back. */
  onClose: () => void;
}

/** A slim search field in place of a section head. Leaving it empty closes it. */
export function SearchRow({ value, onChangeText, onClose }: SearchRowProps) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <Ionicons name="search" size={iconSize.sm - 4} color={colors.textFaint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onBlur={() => !value.trim() && onClose()}
        autoFocus
        placeholder="Tags, artists, albums"
        placeholderTextColor={colors.textDim}
        selectionColor={colors.accentFg}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={styles.input}
      />
      <Pressable onPress={onClose} hitSlop={SLOP} accessibilityRole="button" accessibilityLabel="Close search" style={styles.close}>
        <Ionicons name="close" size={iconSize.sm - 4} color={colors.textDim} />
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tall: {
    height: SEARCH_HEIGHT,
  },
  // Long trails give way from the middle; where you are keeps its room.
  trail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
  },
  crumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexShrink: 1,
  },
  here: {
    flexShrink: 0,
    maxWidth: '60%',
  },
  hereText: {
    color: colors.text,
  },
  label: {
    ...font.caption,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sort: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  sortText: {
    ...font.caption,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pressed: {
    opacity: 0.5,
  },
  searchButton: {
    marginLeft: 'auto',
    width: SEARCH_HEIGHT,
    height: SEARCH_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    height: SEARCH_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  input: {
    ...font.label,
    flex: 1,
    color: colors.text,
    paddingVertical: 0,
  },
  close: {
    width: SEARCH_HEIGHT,
    height: SEARCH_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
