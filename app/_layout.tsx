import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DATABASE_NAME, migrate } from '@/db/schema';
import { PlayerProvider } from '@/player/PlayerProvider';
import { fontAssets } from '@/ui/fonts';
import { colors, headerTitleStyle } from '@/ui/theme';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  useEffect(() => {
    if (fontError) console.warn('[fonts] failed to load; using system fonts', fontError);
  }, [fontError]);

  // A brief wait at startup so text doesn't reflow from system font to Lora.
  // The app's own background rather than nothing, so there's no white flash.
  // If loading fails, carry on — text falls back to the system font.
  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate}>
        <StatusBar style="light" />
        {/* Above the navigator, so playback survives switching tabs and screens. */}
        <PlayerProvider>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.text,
              headerTitleStyle,
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="tag/[id]" options={{ title: '' }} />
            <Stack.Screen name="song/[id]/tags" options={{ presentation: 'modal', title: 'Tags' }} />
            <Stack.Screen name="add-songs/[tagId]" options={{ presentation: 'modal', title: '' }} />
            <Stack.Screen name="library-manage" options={{ title: 'Manage library' }} />
          </Stack>
        </PlayerProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
