import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { albumArtUri } from '../../library/assets';
import { MOSAIC_TILES } from '../../library/mixArt';
import { Artwork } from '../player/Artwork';
import { iconSize } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';

export interface ArtMosaicProps {
  /** Up to four album ids, most representative first. */
  albumIds: readonly string[];
  size: number;
  /** Shown as a colour block when there's no artwork at all. */
  fallbackColor: string;
}

/**
 * A square of album art: a 2×2 grid when there are four albums, otherwise the
 * first one full size (a grid with gaps or repeats looks broken).
 */
export function ArtMosaic({ albumIds, size, fallbackColor }: ArtMosaicProps) {
  const styles = useStyles();
  if (albumIds.length === 0) {
    return (
      <View style={[styles.fallback, { width: size, height: size, backgroundColor: `${fallbackColor}40` }]}>
        <Ionicons name="musical-notes" size={iconSize.lg} color={fallbackColor} />
      </View>
    );
  }
  if (albumIds.length < MOSAIC_TILES) {
    return <Artwork uri={albumArtUri(albumIds[0])} size={size} cornerRadius={0} />;
  }
  const tile = size / 2;
  return (
    <View style={[styles.grid, { width: size, height: size }]}>
      {albumIds.slice(0, MOSAIC_TILES).map((id) => (
        <Artwork key={id} uri={albumArtUri(id)} size={tile} cornerRadius={0} />
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.surfaceAlt,
  },
}));
