import { BottomTabBar, Tabs, type BottomTabBarProps } from 'expo-router/tabs';
import { View } from 'react-native';

import { Icon } from '@/ui/Icon';
import { MiniPlayer } from '@/ui/player/MiniPlayer';
import { MiniPlayerVisibilityProvider } from '@/ui/player/MiniPlayerVisibility';
import { PlayerSheet, usePlayerSheet } from '@/ui/player/PlayerSheet';
import { useColors } from '@/ui/ThemeContext';

/**
 * Three tabs: Mixes (play what you've saved; the app opens here), Shuffle (build
 * something new from tags) and Library (organise it). The full player
 * isn't a tab; it's a sheet that grows out of the mini-player, which sits on
 * the tab bar. Rendering it inside the tab bar slot means every screen above
 * automatically ends where the mini-player begins, with no per-screen padding.
 */
export default function TabsLayout() {
  const colors = useColors();
  return (
    <MiniPlayerVisibilityProvider>
      <PlayerSheet>
        <Tabs
          tabBar={(props) => <BottomBar {...props} />}
          screenOptions={{
            sceneStyle: { backgroundColor: colors.bg },
            tabBarStyle: {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            },
            tabBarActiveTintColor: colors.accentFg,
            tabBarInactiveTintColor: colors.textDim,
            // Each tab's own stack draws its headers, so they all match.
            headerShown: false,
            // A short fade between tabs, so switching feels smooth; the bar and mini-player stay put.
            animation: 'fade',
          }}
        >
          <Tabs.Screen
            name="(play)"
            options={{
              title: 'Play',
              // Filled when selected, outlined otherwise: the usual Android tab pattern.
              tabBarIcon: ({ color, size, focused }) => (
                <Icon name={focused ? 'play-circle' : 'play-circle-outline'} color={color} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="library"
            options={{
              title: 'Library',
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
  const colors = useColors();
  const { setBarHeight } = usePlayerSheet();
  return (
    <View style={{ backgroundColor: colors.bg }} onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}>
      <MiniPlayer />
      <BottomTabBar {...props} />
    </View>
  );
}
