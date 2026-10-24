import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/ui/stackOptions';

/**
 * The Mixes tab in a stack of its own, like Library's, so every tab's header
 * is drawn the same way (Android's own toolbar) and lines up.
 */
export default function MixesLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Mixes' }} />
    </Stack>
  );
}
