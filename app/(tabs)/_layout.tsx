import { Ionicons } from '@expo/vector-icons';
import { BottomTabBar, Tabs } from 'expo-router/tabs';
import { View } from 'react-native';

import { MiniPlayer } from '@/ui/player/MiniPlayer';
import { MiniPlayerVisibilityProvider } from '@/ui/player/MiniPlayerVisibility';
import { colors, headerTitleStyle } from '@/ui/theme';

/**
 * Two tabs: Play (start something) and Library (organise it). The full player
 * isn't a tab; it slides up from the mini-player, which sits on the tab bar.
 * Rendering it inside the tab bar slot means every screen above automatically
 * ends where the mini-player begins, with no per-screen padding.
 */
export default function TabsLayout() {
  return (
    <MiniPlayerVisibilityProvider>
      <Tabs
        tabBar={(props) => (
          <View style={{ backgroundColor: colors.bg }}>
            <MiniPlayer />
            <BottomTabBar {...props} />
          </View>
        )}
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle,
          sceneStyle: { backgroundColor: colors.bg },
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
          tabBarActiveTintColor: colors.accentFg,
          tabBarInactiveTintColor: colors.textFaint,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Play',
            tabBarIcon: ({ color, size }) => <Ionicons name="play-circle-outline" color={color} size={size} />,
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: 'Library',
            // The Library tab's own stack draws its headers.
            headerShown: false,
            tabBarIcon: ({ color, size }) => <Ionicons name="pricetags-outline" color={color} size={size} />,
          }}
        />
      </Tabs>
    </MiniPlayerVisibilityProvider>
  );
}
