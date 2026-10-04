import { ScrollView, StyleSheet, Text } from 'react-native';

import { countSongs } from '@/db/songs';
import { listTags } from '@/db/tags';
import { useLibraryScan } from '@/library/useLibraryScan';
import { usePlaylistImport } from '@/library/usePlaylistImport';
import { Button } from '@/ui/Button';
import { Card, CardActions, CardText } from '@/ui/Card';
import { plural } from '@/ui/format';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { ImportStatus } from '@/ui/library/ImportCards';
import { ScanCard } from '@/ui/library/ScanCard';
import { colors, font, spacing } from '@/ui/theme';

/** Rescan the device and import playlists — the library's housekeeping. */
export default function ManageLibraryScreen() {
  const { data: counts } = useLibraryQuery(async (db) => {
    const [songs, tags] = await Promise.all([countSongs(db), listTags(db)]);
    return { songs, tags: tags.length };
  }, []);
  const scan = useLibraryScan();
  const imports = usePlaylistImport();
  const busy = scan.busy || imports.busy;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {counts && (
        <Card label="Library">
          <Text style={styles.stat}>{plural(counts.songs, 'song')}</Text>
          <Text style={styles.stat}>{plural(counts.tags, 'tag')}</Text>
        </Card>
      )}

      <ScanCard state={scan.state} hasSongs={(counts?.songs ?? 0) > 0} disabled={busy} onScan={scan.run} />

      <Card title="Playlists">
        <CardText>
          Turn .m3u playlists into tags. Re-importing is safe — existing tags are reused, never
          duplicated.
        </CardText>
        <CardActions>
          <Button label="Import playlists" variant="secondary" onPress={imports.run} disabled={busy} />
        </CardActions>
      </Card>
      <ImportStatus state={imports.state} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  stat: {
    ...font.heading,
    color: colors.text,
  },
});
