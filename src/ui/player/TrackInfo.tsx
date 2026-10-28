import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Marquee } from '../Marquee';
import { font, spacing } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';

export interface TrackInfoProps {
  title: string;
  artist: string | null;
  album: string | null;
  /** Each name is a link to its page, when given. */
  onPressArtist?: () => void;
  onPressAlbum?: () => void;
}

/** Always one line each, so the block never changes height. */
const HEIGHT = font.title.lineHeight + spacing.xs + font.body.lineHeight;

/**
 * Title and artist/album, centred, one line each: a line too long to fit
 * scrolls sideways (see Marquee) instead of wrapping or being cut off.
 *
 * The block is a *constant* height, so the controls below never move from
 * song to song, whatever the title's length or script (CJK text renders
 * taller than Latin). The height comes from the font tokens, so it stays right
 * if they change.
 */
export function TrackInfo({ title, artist, album, onPressArtist, onPressAlbum }: TrackInfoProps) {
  const styles = useStyles();
  const subtitle = [artist, album].filter(Boolean).join(' · ');
  // Spans inside one line, so it still scrolls as a whole; each name is its own link.
  const link = (name: string, onPress: (() => void) | undefined) => (
    <Text
      onPress={onPress}
      style={onPress && styles.link}
      accessibilityRole={onPress ? 'link' : undefined}
      suppressHighlighting
    >
      {name}
    </Text>
  );
  const [width, setWidth] = useState(0);

  return (
    <View style={styles.container} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* Keyed by the text, so each new song's line starts from its beginning. */}
      <Marquee key={`t${title}`} style={styles.title} maxWidth={width}>
        {title}
      </Marquee>
      {/* Always rendered, so a song with no artist doesn't shift the title. */}
      <Marquee key={`s${subtitle}`} style={styles.subtitle} maxWidth={width}>
        {artist && link(artist, onPressArtist)}
        {artist && album && ' · '}
        {album && link(album, onPressAlbum)}
        {!subtitle && ' '}
      </Marquee>
    </View>
  );
}

// includeFontPadding: Android otherwise adds padding sized from each font's own
// metrics, which differ between Latin and the fallback fonts CJK text uses.
const useStyles = makeStyles((colors) => StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: HEIGHT,
  },
  title: {
    ...font.title,
    color: colors.text,
    includeFontPadding: false,
  },
  subtitle: {
    ...font.body,
    color: colors.textDim,
    includeFontPadding: false,
  },
  link: {
    color: colors.accentFg,
  },
}));
