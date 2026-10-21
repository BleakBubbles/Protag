import { ScrollView, StyleSheet, Text } from 'react-native';

import { countSongs } from '@/db/songs';
import { listTags } from '@/db/tags';
import { loadFolderChoices } from '@/library/libraryFolders';
import { useBackup } from '@/library/useBackup';
import { useLibraryScan } from '@/library/useLibraryScan';
import { usePlaylistImport } from '@/library/usePlaylistImport';
import { openLibraryFolders } from '@/navigation';
import { Button } from '@/ui/Button';
import { Card, CardActions, CardText } from '@/ui/Card';
import { formatDaysAgo, plural } from '@/ui/format';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { ImportStatus } from '@/ui/library/ImportCards';
import { ScanCard } from '@/ui/library/ScanCard';
import { colors, font, spacing } from '@/ui/theme';

/** Rescan the device, import playlists, and back up tags — the library's housekeeping. */
export default function ManageLibraryScreen() {
  const { data: counts } = useLibraryQuery(async (db) => {
    const [songs, tags, folders] = await Promise.all([countSongs(db), listTags(db), loadFolderChoices(db)]);
    const choices = Object.values(folders);
    return { songs, tags: tags.length, folders: choices.length, reading: choices.filter((f) => f.include).length };
  }, []);
  const scan = useLibraryScan();
  const imports = usePlaylistImport();
  const backup = useBackup();
  const busy = scan.busy || imports.busy || backup.busy;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {counts && (
        <Card label="Library">
          <Text style={styles.stat}>{plural(counts.songs, 'song')}</Text>
          <Text style={styles.stat}>{plural(counts.tags, 'tag')}</Text>
        </Card>
      )}

      <ScanCard
        state={scan.state}
        hasSongs={(counts?.songs ?? 0) > 0}
        disabled={busy}
        onScan={scan.run}
        onChooseFolders={openLibraryFolders}
      />

      <Card title="Folders">
        <CardText>
          {counts && counts.folders > 0
            ? `Reading ${counts.reading} of ${plural(counts.folders, 'folder')}. Ones that look like voice messages or recordings are left out.`
            : 'ProTag reads every audio folder on this phone, except ones that look like voice messages or recordings.'}
        </CardText>
        <CardActions>
          <Button label="Choose folders" icon="folder-outline" variant="secondary" onPress={openLibraryFolders} disabled={busy} />
        </CardActions>
      </Card>

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

      {/* Tags are the one thing a reinstall or a lost phone can't bring back. */}
      <Card title="Backup">
        <CardText>
          Your tags live only on this phone. Export them to keep them safe or to move them to a new
          phone. Importing adds to what's here and never removes anything.
        </CardText>
        <CardText>
          {backup.lastExport ? `Last exported ${formatDaysAgo(backup.lastExport)}.` : 'Never exported.'}
        </CardText>
        {backup.state.kind === 'imported' && <CardText>{backup.state.message}</CardText>}
        {backup.state.kind === 'error' && <CardText tone="error">{backup.state.message}</CardText>}
        <CardActions>
          <Button label="Export tags" icon="share-outline" variant="tonal" onPress={backup.exportTags} disabled={busy} />
          <Button label="Import" icon="download-outline" variant="secondary" onPress={backup.importTags} disabled={busy} />
        </CardActions>
      </Card>
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
