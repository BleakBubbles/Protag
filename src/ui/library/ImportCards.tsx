import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { ImportState } from '../../library/usePlaylistImport';
import { Button } from '../Button';
import { Card, CardActions, CardText } from '../Card';
import { formatCount, plural } from '../format';
import { colors, spacing } from '../theme';

/**
 * The onboarding offer to import playlists. "Choose folder" is the prominent
 * default; Android requires the user to pick the folder, so this is as close to
 * automatic as the platform allows.
 */
export function ImportPrompt({
  onChoose,
  onDismiss,
  disabled,
}: {
  onChoose: () => void;
  onDismiss: () => void;
  disabled?: boolean;
}) {
  return (
    <Card title="Bring your playlists">
      <CardText>
        Pick the folder with your .m3u playlists and each one becomes a tag — so your library
        starts out organized.
      </CardText>
      <CardActions>
        <Button label="Choose folder" onPress={onChoose} disabled={disabled} />
        <Button label="Not now" variant="secondary" onPress={onDismiss} disabled={disabled} />
      </CardActions>
    </Card>
  );
}

/** Progress and per-playlist results of an import. Renders nothing when idle. */
export function ImportStatus({ state }: { state: ImportState }) {
  if (state.kind === 'idle') return null;

  if (state.kind === 'importing') {
    return (
      <Card>
        <View style={styles.row}>
          <ActivityIndicator color={colors.accent} />
          <CardText>Importing playlists…</CardText>
        </View>
      </Card>
    );
  }

  if (state.kind === 'error') {
    return (
      <Card>
        <CardText tone="error">Import failed: {state.message}</CardText>
      </Card>
    );
  }

  const { results, unreadable } = state.summary;
  return (
    <Card
      title={
        results.length === 0
          ? 'No playlists found in that folder'
          : `Imported ${plural(results.length, 'playlist')}`
      }
    >
      {results.map((r) => (
        <CardText key={r.name}>
          {r.tagId === null
            ? `${r.name} — none of its songs are on this phone`
            : `${r.name} — ${plural(r.matched, 'song')}${r.unmatched > 0 ? `, ${formatCount(r.unmatched)} not found` : ''}`}
        </CardText>
      ))}
      {unreadable > 0 && <CardText>{plural(unreadable, 'file')} couldn't be read.</CardText>}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
