import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Marquee } from '../Marquee';
import { colors, font, spacing } from '../theme';

export interface TrackInfoProps {
  title: string;
  artist: string | null;
  album: string | null;
  /** Tapping the artist · album line: off to their pages. */
  onPressSubtitle?: () => void;
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
export function TrackInfo({ title, artist, album, onPressSubtitle }: TrackInfoProps) {
  const subtitle = [artist, album].filter(Boolean).join(' · ');
  const [width, setWidth] = useState(0);

  return (
    <View style={styles.container} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* Keyed by the text, so each new song's line starts from its beginning. */}
      <Marquee key={`t${title}`} style={styles.title} maxWidth={width}>
        {title}
      </Marquee>
      {/* Always rendered, so a song with no artist doesn't shift the title. */}
      <Pressable
        onPress={onPressSubtitle}
        disabled={!onPressSubtitle}
        accessibilityRole={onPressSubtitle ? 'link' : undefined}
        accessibilityHint={onPressSubtitle ? 'Goes to the artist or album' : undefined}
        hitSlop={8}
      >
        <Marquee key={`s${subtitle}`} style={styles.subtitle} maxWidth={width}>
          {subtitle || ' '}
        </Marquee>
      </Pressable>
    </View>
  );
}

// includeFontPadding: Android otherwise adds padding sized from each font's own
// metrics, which differ between Latin and the fallback fonts CJK text uses.
const styles = StyleSheet.create({
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
});
