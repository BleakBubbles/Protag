import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, font, spacing } from '@/ui/theme';

/**
 * Player screen.
 *
 * Placeholder until `PlayerProvider` lands — deliberately states that nothing is
 * wired up yet rather than showing fake transport controls that do nothing.
 */
export default function PlayerScreen() {
  return (
    <View style={styles.container}>
      <Ionicons name="musical-notes-outline" size={64} color={colors.textFaint} />
      <Text style={styles.title}>Nothing playing</Text>
      <Text style={styles.subtitle}>
        Playback arrives with the player milestone. Scan your library first from the Library tab.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    ...font.title,
    color: colors.text,
  },
  subtitle: {
    ...font.body,
    color: colors.textDim,
    textAlign: 'center',
  },
});
