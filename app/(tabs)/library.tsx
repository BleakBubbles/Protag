import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { countSongs } from '@/db/songs';
import { useLibraryScan } from '@/library/useLibraryScan';
import { SongsView } from '@/screens/library/SongsView';
import { TagsView } from '@/screens/library/TagsView';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { ScanCard } from '@/ui/library/ScanCard';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { colors, spacing } from '@/ui/theme';

type LibraryView = 'tags' | 'songs';

const SEGMENTS = [
  { value: 'tags', label: 'Tags' },
  { value: 'songs', label: 'Songs' },
] as const;

/**
 * Library tab: browse by tag or by song. Before the first scan it's onboarding
 * instead — there's nothing to browse yet.
 */
export default function LibraryScreen() {
  const { data: songCount } = useLibraryQuery(countSongs, []);
  const scan = useLibraryScan();
  const [view, setView] = useState<LibraryView>('tags');

  if (songCount === undefined) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator color={colors.accentFg} />
      </View>
    );
  }

  if (songCount === 0) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.onboarding}>
        <ScanCard state={scan.state} hasSongs={false} disabled={scan.busy} onScan={scan.run} />
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.segments}>
        <SegmentedControl segments={SEGMENTS} value={view} onChange={setView} />
      </View>
      {view === 'tags' ? <TagsView /> : <SongsView />}
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
    padding: spacing.lg,
  },
  segments: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
});
