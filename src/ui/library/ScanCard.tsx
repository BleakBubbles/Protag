import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';

import type { ScanSummary } from '../../library/scan';
import type { ScanState } from '../../library/useLibraryScan';
import { Button } from '../Button';
import { Card, CardActions, CardText } from '../Card';
import { formatCount, plural } from '../format';
import { colors, spacing } from '../theme';

export interface ScanCardProps {
  state: ScanState;
  disabled?: boolean;
  onScan: () => void;
  /** Shown after a scan that left files out, to see why or change it. */
  onChooseFolders?: () => void;
}

/** Scan status and the rescan button, once there's a library (the first scan is `Welcome`'s). */
export function ScanCard({ state, disabled, onScan, onChooseFolders }: ScanCardProps) {
  if (state.kind === 'scanning') {
    const { progress } = state;
    return (
      <Card>
        <View style={styles.row}>
          <ActivityIndicator color={colors.accentFg} />
          <CardText>
            {progress
              ? `Reading your library… ${formatCount(progress.scanned)} of ${formatCount(progress.total)}`
              : 'Reading your library…'}
          </CardText>
        </View>
      </Card>
    );
  }

  if (state.kind === 'denied') {
    return (
      <Card title="ProTag needs access to your music">
        <CardText>It only reads audio files — never photos, videos, or anything else.</CardText>
        <CardActions>
          {state.canAskAgain ? (
            <Button label="Allow access" variant="tonal" onPress={onScan} />
          ) : (
            <Button label="Open settings" icon="settings-outline" variant="tonal" onPress={() => Linking.openSettings()} />
          )}
        </CardActions>
      </Card>
    );
  }

  return (
    <Card title={state.kind === 'done' ? `${plural(state.summary.found, 'song')} found` : undefined}>
      {state.kind === 'done' && <ScanSummaryText summary={state.summary} />}
      {state.kind === 'error' && <CardText tone="error">Scan failed: {state.message}</CardText>}
      <CardActions>
        <Button
          label="Rescan"
          icon="refresh"
          variant="tonal"
          onPress={onScan}
          disabled={disabled}
        />
        {state.kind === 'done' && state.summary.leftOut > 0 && onChooseFolders && (
          <Button label="Folders" icon="folder-outline" variant="secondary" onPress={onChooseFolders} disabled={disabled} />
        )}
      </CardActions>
    </Card>
  );
}

/** What a finished scan skipped, lost or left out; nothing when there's nothing to say. */
export function ScanSummaryText({ summary }: { summary: ScanSummary }) {
  const skipped = summary.skipped['too-short'] + summary.skipped.unavailable + summary.skipped['no-uri'];
  return (
    <>
      {skipped > 0 && (
        <CardText>
          Skipped {plural(skipped, 'short clip or unplayable file', 'short clips or unplayable files')}.
        </CardText>
      )}
      {summary.missing > 0 && (
        <CardText>
          {plural(summary.missing, 'song')} no longer on this phone — their tags are kept in case they
          come back.
        </CardText>
      )}
      {summary.leftOut > 0 && (
        <CardText>
          Left out {plural(summary.leftOut, 'file')} in unticked folders, like voice messages and
          recordings.
          {summary.hidden > 0 &&
            ` ${plural(summary.hidden, 'song')} from them ${summary.hidden === 1 ? 'is' : 'are'} hidden now; tags are kept.`}
        </CardText>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
