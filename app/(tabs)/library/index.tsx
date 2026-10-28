import { Stack } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { countSongs } from '@/db/songs';
import { useLibraryScan } from '@/library/useLibraryScan';
import { openLibraryFolders, openSettings } from '@/navigation';
import { AlbumsView } from '@/screens/library/AlbumsView';
import { ArtistsView } from '@/screens/library/ArtistsView';
import { SongsView } from '@/screens/library/SongsView';
import { TagsView } from '@/screens/library/TagsView';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { useSongSelection } from '@/ui/hooks/useSongSelection';
import { IconButton } from '@/ui/IconButton';
import { Welcome } from '@/ui/library/Welcome';
import { PagerTabs } from '@/ui/PagerTabs';
import { HeaderTitle } from '@/ui/stackOptions';
import { makeStyles, useColors } from '@/ui/ThemeContext';

type LibraryView = 'tags' | 'songs' | 'artists' | 'albums';

/** Set in full (not just the parts that differ), so it replaces the selection header cleanly. */
const libraryHeader = {
  title: 'Library',
  headerTitle: HeaderTitle,
  headerLeft: undefined,
  headerRight: () => <IconButton icon="cog" label="Settings" onPress={openSettings} />,
};


/**
 * Library tab: browse by tag (where it opens: tags are ProTag's heart), by
 * song, by artist or by album. Before the first scan it's onboarding instead —
 * there's nothing to browse yet.
 */
export default function LibraryScreen() {
  const colors = useColors();
  const styles = useStyles();
  const { data: songCount } = useLibraryQuery(countSongs, []);
  const scan = useLibraryScan();
  const [view, setView] = useState<LibraryView>('tags');
  // Selecting songs, in the Tags view ("Not tagged yet") or the Songs view. It
  // lives here because the header is this screen's; switching views ends it.
  const [looseIds, setLooseIds] = useState<readonly number[]>();
  const [songIds, setSongIds] = useState<readonly number[]>();
  const selection = useSongSelection(view === 'tags' ? looseIds : view === 'songs' ? songIds : undefined);
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
        <Welcome state={scan.state} disabled={scan.busy} onScan={scan.run} onChooseFolders={openLibraryFolders} />
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
          { value: 'songs', label: 'Songs', render: () => <SongsView selection={selection} onSongs={setSongIds} /> },
          { value: 'artists', label: 'Artists', render: () => <ArtistsView /> },
          { value: 'albums', label: 'Albums', render: () => <AlbumsView /> },
        ]}
      />
    </View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
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
  },
}));
