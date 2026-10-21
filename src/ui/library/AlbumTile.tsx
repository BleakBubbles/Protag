import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { albumArtUri } from '../../library/assets';
import { Artwork } from '../player/Artwork';
import { colors, font, spacing } from '../theme';

export interface AlbumTileProps {
  albumId: string;
  title: string;
  /** Left out where it's obvious (on the artist's own page). */
  artist?: string | null;
  size: number;
  onPress: (albumId: string) => void;
}

/** An album as its cover, with its name under it: square, like the cover itself. */
export const AlbumTile = memo(function AlbumTile({ albumId, title, artist, size, onPress }: AlbumTileProps) {
  return (
    <Pressable
      onPress={() => onPress(albumId)}
      accessibilityRole="button"
      accessibilityLabel={`${title}${artist ? ` by ${artist}` : ''}, album`}
      style={({ pressed }) => [{ width: size }, pressed && styles.pressed]}
    >
      <Artwork uri={albumArtUri(albumId)} size={size} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {artist !== undefined && (
          <Text style={styles.artist} numberOfLines={1}>
            {artist ?? ' '}
          </Text>
        )}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.7,
  },
  text: {
    paddingTop: spacing.sm,
  },
  title: {
    ...font.name,
    color: colors.text,
  },
  artist: {
    ...font.caption,
    color: colors.textDim,
  },
});
