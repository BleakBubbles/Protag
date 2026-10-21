import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/ui/stackOptions';

/**
 * The Library tab's own stack, so drilling into tags keeps the tab bar and the
 * mini-player on screen, the way browsing into a playlist does in other apps.
 */
export default function LibraryLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      {/* The index sets its own header: it changes while selecting songs. */}
      <Stack.Screen name="index" options={{ title: 'Library' }} />
      <Stack.Screen name="tag/[id]" options={{ title: '' }} />
      <Stack.Screen name="manage" options={{ title: 'Manage library' }} />
      <Stack.Screen name="folders" options={{ title: 'Folders' }} />
    </Stack>
  );
}
