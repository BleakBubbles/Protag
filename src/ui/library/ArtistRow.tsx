import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ArtistSummary } from '../../db/albums';
import { albumArtUri } from '../../library/assets';
import { plural } from '../format';
import { Artwork } from '../player/Artwork';
import { font, iconSize, spacing } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';

export const ARTIST_ROW_HEIGHT = 72;
const PICTURE = 48;

/** An artist, pictured round (a person; albums are square) by the cover of their biggest album. */
export const ArtistRow = memo(function ArtistRow({
  artist,
  onPress,
}: {
  artist: ArtistSummary;
  onPress: (name: string) => void;
}) {
  const colors = useColors();
  const styles = useStyles();
  const meta = [plural(artist.songs, 'song'), artist.albums > 0 ? plural(artist.albums, 'album') : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={() => onPress(artist.name)}
      accessibilityRole="button"
      accessibilityLabel={`${artist.name}, ${meta}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Artwork
        uri={artist.coverAlbumId ? albumArtUri(artist.coverAlbumId) : null}
        size={PICTURE}
        cornerRadius={PICTURE / 2}
      />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {artist.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textFaint} />
    </Pressable>
  );
});

const useStyles = makeStyles((colors) => StyleSheet.create({
  row: {
    height: ARTIST_ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  text: {
    flex: 1,
  },
  name: {
    ...font.name,
    color: colors.text,
  },
  meta: {
    ...font.caption,
    color: colors.textDim,
  },
}));
