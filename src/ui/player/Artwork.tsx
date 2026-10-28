import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { radius } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';

export interface ArtworkProps {
  /** `content://` album-art URI from MediaStore, or null. */
  uri: string | null;
  size: number;
  /** Overrides the size-scaled corner radius, e.g. 0 for tiles in a mosaic. */
  cornerRadius?: number;
}

/**
 * Album art with a placeholder. MediaStore's album-art URI is derived, not
 * checked, so it may point at nothing — a load error falls back to the
 * placeholder rather than an empty box.
 */
/** Corners scale with size: a thumbnail with the full radius would look like a pill. */
export function artworkRadius(size: number): number {
  return Math.min(radius.lg, size * 0.15);
}

export function Artwork({ uri, size, cornerRadius }: ArtworkProps) {
  const colors = useColors();
  const styles = useStyles();
  // Keyed by uri so a new song gets a fresh chance to load.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const showImage = uri !== null && failedUri !== uri;

  return (
    <View style={[styles.frame, { width: size, height: size, borderRadius: cornerRadius ?? artworkRadius(size) }]}>
      {showImage ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          onError={() => setFailedUri(uri)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Ionicons name="musical-notes" size={size * 0.3} color={colors.textFaint} />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  frame: {
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
