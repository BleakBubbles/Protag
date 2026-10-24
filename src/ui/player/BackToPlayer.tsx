import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { BackHandler } from 'react-native';

import { IconButton } from '../IconButton';
import { usePlayerSheet } from './PlayerSheet';

/**
 * For a page opened from the full player (a tag chip, the artist or album
 * link): Back returns to the player, over the screen it was opened on,
 * rather than into the Library. The `player` param, set by the opening link,
 * is that screen's path. Returns header options to spread, empty otherwise.
 */
export function useBackToPlayer(): { headerLeft?: () => ReactNode } {
  const { player } = useLocalSearchParams<{ player?: string }>();
  const sheet = usePlayerSheet();

  const back = useCallback(() => {
    if (!player) return;
    router.back();
    // Opened from another tab: back there first. (From within the Library, `back` already is.)
    if (!player.startsWith('/library')) router.navigate(player as never);
    sheet.expand();
  }, [player, sheet]);

  useFocusEffect(
    useCallback(() => {
      if (!player) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        back();
        return true;
      });
      return () => sub.remove();
    }, [player, back])
  );

  return player ? { headerLeft: () => <IconButton icon="arrow-back" label="Back to the player" onPress={back} /> } : {};
}
