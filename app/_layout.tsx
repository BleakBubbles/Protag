import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DATABASE_NAME, migrate } from '@/db/schema';
import { PlayerProvider } from '@/player/PlayerProvider';
import { colors } from '@/ui/theme';

export default function RootLayout() {
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
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </PlayerProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
