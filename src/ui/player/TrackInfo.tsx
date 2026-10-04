import { StyleSheet, Text, View } from 'react-native';

import { colors, font, spacing } from '../theme';

export interface TrackInfoProps {
  title: string;
  artist: string | null;
  album: string | null;
}

export function TrackInfo({ title, artist, album }: TrackInfoProps) {
  const subtitle = [artist, album].filter(Boolean).join(' · ');
  return (
    <View style={styles.container}>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    alignItems: 'center',
  },
  title: {
    ...font.title,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    ...font.body,
    color: colors.textDim,
    textAlign: 'center',
  },
});
