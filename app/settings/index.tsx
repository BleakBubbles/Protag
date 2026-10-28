import { ScrollView, StyleSheet } from 'react-native';

import { getSetting, SettingKey } from '@/db/settings';
import { countSongs } from '@/db/songs';
import { listTags } from '@/db/tags';
import { loadFolderChoices } from '@/library/libraryFolders';
import { useBackup } from '@/library/useBackup';
import { useLibraryScan } from '@/library/useLibraryScan';
import { usePlaylistImport } from '@/library/usePlaylistImport';
import { openLibraryFolders } from '@/navigation';
import { Button } from '@/ui/Button';
import { Card, CardActions, CardStatus, CardText } from '@/ui/Card';
import { formatDaysAgo } from '@/ui/format';
import type { IconName } from '@/ui/Icon';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { PlaylistsCard } from '@/ui/library/ImportCards';
import { LibraryOverview, type LibraryCounts } from '@/ui/library/LibraryOverview';
import { spacing } from '@/ui/theme';
import { makeStyles, useThemeChoice, type ThemeChoice } from '@/ui/ThemeContext';

/** Settings: what ProTag sees on this phone, playlists, tag backups, and how the app looks. */
export default function SettingsScreen() {
  const styles = useStyles();
  const { data: counts } = useLibraryQuery(async (db): Promise<LibraryCounts> => {
    const [songs, tags, folders, lastScanAt] = await Promise.all([
      countSongs(db),
      listTags(db),
      loadFolderChoices(db),
      getSetting(db, SettingKey.lastScanAt),
    ]);
    const choices = Object.values(folders);
    return {
      songs,
      tags: tags.length,
      folders: choices.length,
      reading: choices.filter((f) => f.include).length,
      lastScanAt: lastScanAt === null ? null : Number(lastScanAt),
    };
  }, []);
  const scan = useLibraryScan();
  const imports = usePlaylistImport();
  const backup = useBackup();
  const busy = scan.busy || imports.busy || backup.busy;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {counts && (
        <LibraryOverview
          counts={counts}
          state={scan.state}
          disabled={busy}
          onScan={scan.run}
          onChooseFolders={openLibraryFolders}
        />
      )}

      <PlaylistsCard state={imports.state} disabled={busy} onImport={imports.run} />

      {/* Tags are the one thing a reinstall or a lost phone can't bring back. */}
      <Card
        title="Backup"
        info={{
          topic: 'Backup',
          paragraphs: [
            'Your tags live only on this phone. A reinstall or a lost phone would lose them, so back them up now and then, as a file you can keep anywhere or move to a new phone.',
            'Save puts the file in a folder on this phone. Share sends it to another app, like Drive or email.',
            'Restore adds the tags from a backup file to what’s here, and never removes anything.',
          ],
        }}
      >
        <CardStatus>
          {backup.lastExport ? `Last backed up ${formatDaysAgo(backup.lastExport)}` : 'Not backed up yet'}
        </CardStatus>
        {backup.state.kind === 'done' && <CardText>{backup.state.message}</CardText>}
        {backup.state.kind === 'error' && <CardText tone="error">{backup.state.message}</CardText>}
        <CardActions>
          <Button label="Save" icon="save-outline" variant="tonal" onPress={backup.saveToPhone} disabled={busy} />
          <Button label="Share" icon="share-social-outline" variant="secondary" onPress={backup.sendToApp} disabled={busy} />
          <Button label="Restore" icon="download-outline" variant="secondary" onPress={backup.restore} disabled={busy} />
        </CardActions>
      </Card>

      <AppearanceCard />
    </ScrollView>
  );
}

const THEMES: { choice: ThemeChoice; label: string; icon: IconName }[] = [
  { choice: 'system', label: 'System', icon: 'phone-portrait-outline' },
  { choice: 'dark', label: 'Dark', icon: 'moon-outline' },
  { choice: 'light', label: 'Light', icon: 'sunny-outline' },
];

/** Dark or light: the phone's own setting unless one is picked here. */
function AppearanceCard() {
  const { choice, setChoice } = useThemeChoice();
  return (
    <Card title="Appearance">
      <CardActions>
        {THEMES.map((theme) => (
          <Button
            key={theme.choice}
            label={theme.label}
            icon={theme.icon}
            variant={choice === theme.choice ? 'tonal' : 'secondary'}
            onPress={() => setChoice(theme.choice)}
          />
        ))}
      </CardActions>
    </Card>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
}));
