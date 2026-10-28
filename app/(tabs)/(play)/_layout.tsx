import { Stack } from 'expo-router';

import { openSettings } from '@/navigation';
import { IconButton } from '@/ui/IconButton';
import { useStackScreenOptions } from '@/ui/stackOptions';
import { useColors } from '@/ui/ThemeContext';

/**
 * The Play tab in a stack of its own, like Library's, so every tab's header
 * is drawn the same way (Android's own toolbar) and lines up.
 */
export default function PlayLayout() {
  const stackScreenOptions = useStackScreenOptions();
  const colors = useColors();
  return (
    <Stack screenOptions={stackScreenOptions}>
      {/* The header is the top of the pot's band, flowing into it with no line between. Set
          here, so it's teal from the first frame, whatever the screen is still loading. */}
      <Stack.Screen
        name="index"
        options={{
          title: 'Play',
          headerStyle: { backgroundColor: colors.potBand },
          headerTintColor: colors.onPot,
          headerShadowVisible: false,
          headerRight: () => <IconButton icon="cog" label="Settings" color={colors.onPot} onPress={openSettings} />,
        }}
      />
    </Stack>
  );
}
