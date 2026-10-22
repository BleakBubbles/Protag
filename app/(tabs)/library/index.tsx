import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { countSongs } from '@/db/songs';
import { useLibraryScan } from '@/library/useLibraryScan';
import { openLibraryFolders, openManageLibrary } from '@/navigation';
import { AlbumsView } from '@/screens/library/AlbumsView';
import { ArtistsView } from '@/screens/library/ArtistsView';
import { SongsView } from '@/screens/library/SongsView';
import { TagsView } from '@/screens/library/TagsView';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { useSongSelection } from '@/ui/hooks/useSongSelection';
import { IconButton } from '@/ui/IconButton';
import { ScanCard } from '@/ui/library/ScanCard';
import { LogoMark } from '@/ui/LogoMark';
import { PagerTabs } from '@/ui/PagerTabs';
import { colors, font, spacing } from '@/ui/theme';

type LibraryView = 'tags' | 'songs' | 'artists' | 'albums';

/** Set in full (not just the parts that differ), so it replaces the selection header cleanly. */
const libraryHeader = {
  title: 'Library',
  headerTitle: undefined,
  headerLeft: undefined,
  headerRight: () => <IconButton icon="settings-outline" label="Manage library" onPress={openManageLibrary} />,
};


/**
 * Library tab: browse by tag (where it opens: tags are ProTag's heart), by
 * song, by artist or by album. Before the first scan it's onboarding instead —
 * there's nothing to browse yet.
 */
export default function LibraryScreen() {
  const { data: songCount } = useLibraryQuery(countSongs, []);
  const scan = useLibraryScan();
  const [view, setView] = useState<LibraryView>('tags');
  // Selecting "Not tagged yet" songs in the Tags view. It lives here because
  // the header is this screen's; switching to Songs ends it.
  const [looseIds, setLooseIds] = useState<readonly number[]>();
  const selection = useSongSelection(view === 'tags' ? looseIds : undefined);
  const switchView = useCallback(
    (next: LibraryView) => {
      selection.clear();
      setView(next);
    },
    [selection.clear]
  );
  const header = selection.selecting ? selection.header : libraryHeader;

  if (songCount === undefined) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Stack.Screen options={header} />
        <ActivityIndicator color={colors.accentFg} />
      </View>
    );
  }

  if (songCount === 0) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.onboarding}>
        <Stack.Screen options={header} />
        {/* The one place the app introduces itself; everywhere else the music is the focus. */}
        <View style={styles.welcome}>
          <View style={styles.logo}>
            <LogoMark width={48} />
          </View>
          <Text style={styles.welcomeTitle}>Welcome to ProTag</Text>
          <Text style={styles.welcomeText}>Tag your songs, then shuffle by tag.</Text>
        </View>
        <ScanCard
          state={scan.state}
          hasSongs={false}
          disabled={scan.busy}
          onScan={scan.run}
          onChooseFolders={openLibraryFolders}
        />
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={header} />
      {/* No swiping away mid-selection, where a stray swipe would lose it; tapping a tab still ends it. */}
      <PagerTabs
        value={view}
        onChange={switchView}
        swipeEnabled={!selection.selecting}
        pages={[
          { value: 'tags', label: 'Tags', render: () => <TagsView selection={selection} onLooseSongs={setLooseIds} /> },
          { value: 'songs', label: 'Songs', render: () => <SongsView /> },
          { value: 'artists', label: 'Artists', render: () => <ArtistsView /> },
          { value: 'albums', label: 'Albums', render: () => <AlbumsView /> },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboarding: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.xl,
  },
  welcome: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  logo: {
    marginBottom: spacing.md,
  },
  welcomeTitle: {
    ...font.title,
    color: colors.text,
  },
  welcomeText: {
    ...font.body,
    color: colors.textDim,
  },
});
