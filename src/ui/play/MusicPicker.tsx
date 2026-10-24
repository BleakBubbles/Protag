import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { albumArtUri } from '../../library/assets';
import { matchesQuery, searchKey } from '../../library/search';
import type { Ref } from '../../query/refs';
import type { TagChoice } from '../../query/types';
import { BottomSheet } from '../BottomSheet';
import { Artwork } from '../player/Artwork';
import { SearchField } from '../SearchField';
import { colors, font, iconSize, spacing } from '../theme';

const ROW_HEIGHT = 64;
const PICTURE = 44;

export interface PickerItem {
  ref: Ref;
  name: string;
  /** "12 songs", or an album's artist. */
  detail: string;
  cover: string | null;
  round: boolean;
}

export interface MusicPickerProps {
  visible: boolean;
  /** "Artists", "Albums". */
  title: string;
  items: readonly PickerItem[];
  choiceOf: (ref: Ref) => TagChoice;
  onTap: (ref: Ref) => void;
  onClose: () => void;
}

/**
 * Every artist (or album), searchable, for the ones the Play tab's row
 * doesn't show. A tap puts one in the pot or takes it out, as on a tile, and
 * the sheet stays open to pick several.
 */
export function MusicPicker({ visible, title, items, choiceOf, onTap, onClose }: MusicPickerProps) {
  const screen = useWindowDimensions();
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const searchable = useMemo(() => items.map((item) => ({ item, key: searchKey([item.name, item.detail]) })), [items]);
  const trimmed = query.trim();
  const shown = useMemo(
    () => searchable.filter((s) => !trimmed || matchesQuery(s.key, trimmed)).map((s) => s.item),
    [searchable, trimmed]
  );

  return (
    <BottomSheet visible={visible} title={title} onClose={onClose}>
      <View style={{ height: screen.height * 0.62 }}>
        <View style={styles.search}>
          <SearchField value={query} onChangeText={setQuery} placeholder={`Search ${title.toLowerCase()}`} />
        </View>
        <FlatList
          data={shown}
          keyExtractor={(item) => String(item.ref)}
          keyboardShouldPersistTaps="handled"
          getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
          renderItem={({ item }) => {
            const choice = choiceOf(item.ref);
            return (
              <Pressable
                onPress={() => onTap(item.ref)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: choice !== 'off' }}
                accessibilityLabel={`${item.name}, ${item.detail}${choice === 'exclude' ? ', kept out' : ''}`}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Artwork
                  uri={item.cover ? albumArtUri(item.cover) : null}
                  size={PICTURE}
                  cornerRadius={item.round ? PICTURE / 2 : undefined}
                />
                <View style={styles.text}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.detail} numberOfLines={1}>
                    {item.detail}
                  </Text>
                </View>
                <Ionicons
                  name={choice === 'include' ? 'checkmark-circle' : choice === 'exclude' ? 'remove-circle' : 'ellipse-outline'}
                  size={iconSize.md}
                  color={choice === 'include' ? colors.text : choice === 'exclude' ? colors.exclude : colors.textFaint}
                />
              </Pressable>
            );
          }}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  search: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pressed: {
    backgroundColor: colors.surfaceAlt,
  },
  text: {
    flex: 1,
  },
  name: {
    ...font.name,
    color: colors.text,
  },
  detail: {
    ...font.caption,
    color: colors.textDim,
  },
});
