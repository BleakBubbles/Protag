import { StyleSheet, Text, View } from 'react-native';

import { colors, font, spacing } from '../theme';

export interface TrackInfoProps {
  title: string;
  artist: string | null;
  album: string | null;
  /** Lines the title may wrap to. Space for all of them is always reserved. */
  titleLines?: number;
}

/**
 * Title and artist/album in a block of *constant* height.
 *
 * Without that, the block grows and shrinks from song to song — a long title
 * wraps to a second line, and CJK text renders taller than Latin — pushing the
 * controls below it around. The height comes from the font tokens, so it stays
 * right if they change.
 */
export function TrackInfo({ title, artist, album, titleLines = 2 }: TrackInfoProps) {
  const subtitle = [artist, album].filter(Boolean).join(' · ');
  const height = font.title.lineHeight * titleLines + spacing.xs + font.body.lineHeight;

  return (
    <View style={[styles.container, { height }]}>
      <Text style={styles.title} numberOfLines={titleLines}>
        {title}
      </Text>
      {/* Always rendered, so a song with no artist doesn't shift the title. */}
      <Text style={styles.subtitle} numberOfLines={1}>
        {subtitle || ' '}
      </Text>
    </View>
  );
}

// includeFontPadding: Android otherwise adds padding sized from each font's own
// metrics, which differ between Latin and the fallback fonts CJK text uses.
const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  title: {
    ...font.title,
    color: colors.text,
    textAlign: 'center',
    includeFontPadding: false,
  },
  subtitle: {
    ...font.body,
    color: colors.textDim,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
