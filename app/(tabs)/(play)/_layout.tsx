import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/ui/stackOptions';

/**
 * The Play tab in a stack of its own, like Library's, so every tab's header
 * is drawn the same way (Android's own toolbar) and lines up.
 */
export default function PlayLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Play' }} />
    </Stack>
  );
}
