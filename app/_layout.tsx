import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DATABASE_NAME, migrate } from '@/db/schema';
import { PlayerProvider } from '@/player/PlayerProvider';
import { fontAssets } from '@/ui/fonts';
import { colors, headerTitleStyle } from '@/ui/theme';

// Keep the splash screen up until fonts are ready, so text never reflows from
// the system font to Lora. Called at module scope, per the docs: inside a
// component it can run after the splash has already gone.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);

  const ready = fontsLoaded || !!fontError;

  useEffect(() => {
    if (fontError) console.warn('[fonts] failed to load; using system fonts', fontError);
  }, [fontError]);

  // If loading fails, carry on: text falls back to the system font.
  useEffect(() => {
    if (ready) SplashScreen.hide();
  }, [ready]);

  if (!ready) return null;

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
