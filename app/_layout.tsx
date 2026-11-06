import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DATABASE_NAME, migrate } from '@/db/schema';
import { useLibraryWatch } from '@/library/libraryWatch';
import { PlayerProvider } from '@/player/PlayerProvider';
import { fontAssets } from '@/ui/fonts';
import { OverlayHost } from '@/ui/Overlay';
import { useStackScreenOptions } from '@/ui/stackOptions';
import { ThemeProvider, useColors } from '@/ui/ThemeContext';
import { WelcomeProvider } from '@/ui/welcome/WelcomeContext';

// Keep the splash screen up until fonts and the theme are ready, so text never reflows from
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
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

/** The app itself, inside the theme: it only mounts once the theme is known, so the splash can go. */
function App() {
  const colors = useColors();
  const stackScreenOptions = useStackScreenOptions();
  // Songs added to or deleted from the phone come and go by themselves.
  useLibraryWatch();

  useEffect(() => {
    SplashScreen.hide();
  }, []);

  return (
    <>
      <StatusBar style={colors.scheme === 'dark' ? 'light' : 'dark'} />
      {/* Above the navigator, so playback survives switching tabs and screens. */}
      <PlayerProvider>
        {/* The welcome, the first time, over everything. */}
        <WelcomeProvider>
          {/* Windows that grow out of the app (see `ExpandWindow`), over every screen. */}
          <OverlayHost>
            <Stack screenOptions={stackScreenOptions}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              {/* Focused tasks cover everything, the mini-player included. */}
              <Stack.Screen name="add-songs/[tagId]" options={{ presentation: 'modal', title: '' }} />
              <Stack.Screen name="edit-tags" options={{ presentation: 'modal', title: '' }} />
              {/* Settings are a detour, not a place: over the tabs, so leaving means Back, to where you were. */}
              <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
              <Stack.Screen name="settings/folders" options={{ title: 'Folders' }} />
              {/* Pages opened from the full player, over it, so Back returns to it as it was. */}
              <Stack.Screen name="from-player/tag/[id]" options={{ title: '' }} />
              <Stack.Screen name="from-player/album/[id]" options={{ title: '' }} />
              <Stack.Screen name="from-player/artist/[name]" options={{ title: '' }} />
            </Stack>
          </OverlayHost>
        </WelcomeProvider>
      </PlayerProvider>
    </>
  );
}
