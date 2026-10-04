import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getSetting, setSetting, SettingKey } from '@/db/settings';
import { countSongs } from '@/db/songs';
import { listTags } from '@/db/tags';
import { importPlaylistsFrom, type FolderImportSummary } from '@/library/playlistFolder';
import { pickFolder } from '@/library/saf';
import { MusicPermissionError, scanLibrary, type ScanProgress, type ScanSummary } from '@/library/scan';
import { Button } from '@/ui/Button';
import { formatCount, plural } from '@/ui/format';
import { colors, font, radius, spacing } from '@/ui/theme';

type ScanState =
  | { kind: 'idle' }
  | { kind: 'scanning'; progress: ScanProgress | null }
  | { kind: 'done'; summary: ScanSummary }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'error'; message: string };

type ImportState =
  | { kind: 'idle' }
  | { kind: 'importing' }
  | { kind: 'done'; summary: FolderImportSummary }
  | { kind: 'error'; message: string };

/**
 * Library screen.
 *
 * Task 4 scope: scan the device library and import playlists. The Tags/Songs
 * views replace the counts card in task 6.
 */
export default function LibraryScreen() {
  const db = useSQLiteContext();
  const [counts, setCounts] = useState<{ songs: number; tags: number } | null>(null);
  const [scan, setScan] = useState<ScanState>({ kind: 'idle' });
  const [importState, setImportState] = useState<ImportState>({ kind: 'idle' });
  const [promptDismissed, setPromptDismissed] = useState(false);

  const refresh = useCallback(async () => {
    const [songs, tags, prompt] = await Promise.all([
      countSongs(db),
      listTags(db),
      getSetting(db, SettingKey.playlistPrompt),
    ]);
    setCounts({ songs, tags: tags.length });
    setPromptDismissed(prompt === 'dismissed');
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const busy = scan.kind === 'scanning' || importState.kind === 'importing';

  const runScan = useCallback(async () => {
    setScan({ kind: 'scanning', progress: null });
    try {
      const summary = await scanLibrary(db, (progress) => setScan({ kind: 'scanning', progress }));
      setScan({ kind: 'done', summary });
    } catch (error) {
      if (error instanceof MusicPermissionError) {
        setScan({ kind: 'denied', canAskAgain: error.canAskAgain });
      } else {
        setScan({ kind: 'error', message: String(error) });
      }
    }
    await refresh();
  }, [db, refresh]);

  // Always goes through the picker, opened at the last-used folder, so choosing
  // a different folder is never more than one tap away.
  const runImport = useCallback(async () => {
    const remembered = await getSetting(db, SettingKey.playlistFolder);
    const folder = await pickFolder(remembered);
    if (!folder) return; // Backed out of the picker.

    setImportState({ kind: 'importing' });
    try {
      await setSetting(db, SettingKey.playlistFolder, folder);
      const summary = await importPlaylistsFrom(db, folder);
      setImportState({ kind: 'done', summary });
    } catch (error) {
      setImportState({ kind: 'error', message: String(error) });
    }
    await refresh();
  }, [db, refresh]);

  const dismissPrompt = useCallback(async () => {
    await setSetting(db, SettingKey.playlistPrompt, 'dismissed');
    setPromptDismissed(true);
  }, [db]);

  if (!counts) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const hasSongs = counts.songs > 0;
  const showPrompt = hasSongs && !promptDismissed && importState.kind === 'idle';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Library</Text>
        <Text style={styles.cardValue}>{plural(counts.songs, 'song')}</Text>
        <Text style={styles.cardValue}>{plural(counts.tags, 'tag')}</Text>
      </View>

      <ScanSection state={scan} hasSongs={hasSongs} busy={busy} onScan={runScan} />

      {showPrompt && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bring your playlists</Text>
          <Text style={styles.body}>
            Pick the folder with your .m3u playlists and each one becomes a tag — so your
            library starts out organized.
          </Text>
          <View style={styles.row}>
            <Button label="Choose folder" onPress={runImport} disabled={busy} />
            <Button label="Not now" variant="secondary" onPress={dismissPrompt} disabled={busy} />
          </View>
        </View>
      )}

      <ImportSection state={importState} />

      {hasSongs && !showPrompt && importState.kind !== 'importing' && (
        <Pressable onPress={runImport} disabled={busy}>
          <Text style={styles.link}>Import playlists from a folder</Text>
        </Pressable>
      )}

    </ScrollView>
  );
}

function ScanSection({
  state,
  hasSongs,
  busy,
  onScan,
}: {
  state: ScanState;
  hasSongs: boolean;
  busy: boolean;
  onScan: () => void;
}) {
  if (state.kind === 'scanning') {
    const { progress } = state;
    return (
      <View style={[styles.card, styles.row]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.body}>
          {progress
            ? `Reading your library… ${formatCount(progress.scanned)} of ${formatCount(progress.total)}`
            : 'Reading your library…'}
        </Text>
      </View>
    );
  }

  if (state.kind === 'denied') {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>ProTag needs access to your music</Text>
        <Text style={styles.body}>
          It only reads audio files — never photos, videos, or anything else.
        </Text>
        {state.canAskAgain ? (
          <Button label="Allow access" onPress={onScan} />
        ) : (
          <Button label="Open settings" onPress={() => Linking.openSettings()} />
        )}
      </View>
    );
  }

  const skipped =
    state.kind === 'done'
      ? state.summary.skipped['too-short'] +
        state.summary.skipped.unavailable +
        state.summary.skipped['no-uri']
      : 0;

  return (
    <View style={styles.card}>
      {!hasSongs && state.kind === 'idle' && (
        <>
          <Text style={styles.cardTitle}>Find your music</Text>
          <Text style={styles.body}>ProTag reads the songs already on this phone.</Text>
        </>
      )}

      {state.kind === 'done' && (
        <>
          <Text style={styles.cardTitle}>{plural(state.summary.found, 'song')} found</Text>
          {skipped > 0 && (
            <Text style={styles.body}>
              Skipped {plural(skipped, 'short clip or unplayable file', 'short clips or unplayable files')}.
            </Text>
          )}
          {state.summary.missing > 0 && (
            <Text style={styles.body}>
              {plural(state.summary.missing, 'song')} no longer on this phone — their tags are kept
              in case they come back.
            </Text>
          )}
        </>
      )}

      {state.kind === 'error' && <Text style={styles.error}>Scan failed: {state.message}</Text>}

      <Button
        label={hasSongs ? 'Rescan library' : 'Scan my music'}
        variant={hasSongs ? 'secondary' : 'primary'}
        onPress={onScan}
        disabled={busy}
      />
    </View>
  );
}

function ImportSection({ state }: { state: ImportState }) {
  if (state.kind === 'importing') {
    return (
      <View style={[styles.card, styles.row]}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.body}>Importing playlists…</Text>
      </View>
    );
  }
  if (state.kind === 'error') {
    return (
      <View style={styles.card}>
        <Text style={styles.error}>Import failed: {state.message}</Text>
      </View>
    );
  }
  if (state.kind !== 'done') return null;

  const { results, unreadable } = state.summary;
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>
        {results.length === 0 ? 'No playlists found in that folder' : `Imported ${plural(results.length, 'playlist')}`}
      </Text>
      {results.map((r) => (
        <Text key={r.name} style={styles.body}>
          {r.tagId === null
            ? `${r.name} — none of its songs are on this phone`
            : `${r.name} — ${plural(r.matched, 'song')}${r.unmatched > 0 ? `, ${formatCount(r.unmatched)} not found` : ''}`}
        </Text>
      ))}
      {unreadable > 0 && <Text style={styles.body}>{plural(unreadable, 'file')} couldn't be read.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  cardLabel: {
    ...font.caption,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  cardTitle: {
    ...font.heading,
    color: colors.text,
  },
  cardValue: {
    ...font.heading,
    color: colors.text,
  },
  body: {
    ...font.body,
    color: colors.textDim,
    flexShrink: 1,
  },
  error: {
    ...font.body,
    color: colors.danger,
  },
  link: {
    ...font.label,
    color: colors.accent,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
});
