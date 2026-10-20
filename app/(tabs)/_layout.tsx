import { BottomTabBar, Tabs, type BottomTabBarProps } from 'expo-router/tabs';
import { View } from 'react-native';

import { Icon } from '@/ui/Icon';
import { MiniPlayer } from '@/ui/player/MiniPlayer';
import { MiniPlayerVisibilityProvider } from '@/ui/player/MiniPlayerVisibility';
import { PlayerSheet, usePlayerSheet } from '@/ui/player/PlayerSheet';
import { colors, headerTitleStyle } from '@/ui/theme';

/**
 * Three tabs: Mixes (play what you've saved; the app opens here), Shuffle (build
 * something new from tags) and Library (organise it). The full player
 * isn't a tab; it's a sheet that grows out of the mini-player, which sits on
 * the tab bar. Rendering it inside the tab bar slot means every screen above
 * automatically ends where the mini-player begins, with no per-screen padding.
 */
export default function TabsLayout() {
  return (
    <MiniPlayerVisibilityProvider>
      <PlayerSheet>
        <Tabs
          tabBar={(props) => <BottomBar {...props} />}
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
              title: 'Mixes',
              // Filled when selected, outlined otherwise: the usual Android tab pattern.
              tabBarIcon: ({ color, size, focused }) => (
                <Icon name={focused ? 'albums' : 'albums-outline'} color={color} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="shuffle"
            options={{
              title: 'Shuffle',
              tabBarIcon: ({ color, size, focused }) => (
                <Icon name={focused ? 'shuffle' : 'shuffle-outline'} color={color} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="library"
            options={{
              title: 'Library',
              // The Library tab's own stack draws its headers.
              headerShown: false,
              tabBarIcon: ({ color, size, focused }) => <Icon name={focused ? 'tags-filled' : 'tags'} color={color} size={size} />,
            }}
          />
        </Tabs>
      </PlayerSheet>
    </MiniPlayerVisibilityProvider>
  );
}

/** Mini-player over the tab bar. Measured so the player sheet grows from its top edge. */
function BottomBar(props: BottomTabBarProps) {
  const { setBarHeight } = usePlayerSheet();
  return (
    <View style={{ backgroundColor: colors.bg }} onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}>
      <MiniPlayer />
      <BottomTabBar {...props} />
    </View>
  );
}
