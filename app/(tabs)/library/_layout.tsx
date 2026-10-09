import { Stack } from 'expo-router';

import { openManageLibrary } from '@/navigation';
import { IconButton } from '@/ui/IconButton';
import { stackScreenOptions } from '@/ui/stackOptions';

/**
 * The Library tab's own stack, so drilling into tags keeps the tab bar and the
 * mini-player on screen, the way browsing into a playlist does in other apps.
 */
export default function LibraryLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen
        name="index"
        options={{
          title: 'Library',
          headerRight: () => (
            <IconButton icon="settings-outline" label="Manage library" onPress={openManageLibrary} />
          ),
        }}
      />
      <Stack.Screen name="tag/[id]" options={{ title: '' }} />
      <Stack.Screen name="manage" options={{ title: 'Manage library' }} />
    </Stack>
  );
}
