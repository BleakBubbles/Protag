import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';

import type { ScanState } from '../../library/useLibraryScan';
import { Button } from '../Button';
import { Card, CardActions, CardText } from '../Card';
import { formatCount, plural } from '../format';
import { colors, spacing } from '../theme';

export interface ScanCardProps {
  state: ScanState;
  hasSongs: boolean;
  disabled?: boolean;
  onScan: () => void;
  /** Shown after a scan that left files out, to see why or change it. */
  onChooseFolders?: () => void;
}

/** Scan status and the scan/rescan button. Used for onboarding and in Manage library. */
export function ScanCard({ state, hasSongs, disabled, onScan, onChooseFolders }: ScanCardProps) {
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
            <Button label="Allow access" onPress={onScan} />
          ) : (
            <Button label="Open settings" onPress={() => Linking.openSettings()} />
          )}
        </CardActions>
      </Card>
    );
  }

  const skipped =
    state.kind === 'done'
      ? state.summary.skipped['too-short'] +
        state.summary.skipped.unavailable +
        state.summary.skipped['no-uri']
      : 0;

  const title =
    state.kind === 'done'
      ? `${plural(state.summary.found, 'song')} found`
      : hasSongs
        ? undefined
        : 'Find your music';

  return (
    <Card title={title}>
      {!hasSongs && state.kind === 'idle' && (
        <CardText>ProTag reads the songs already on this phone.</CardText>
      )}
      {state.kind === 'done' && skipped > 0 && (
        <CardText>
          Skipped {plural(skipped, 'short clip or unplayable file', 'short clips or unplayable files')}.
        </CardText>
      )}
      {state.kind === 'done' && state.summary.missing > 0 && (
        <CardText>
          {plural(state.summary.missing, 'song')} no longer on this phone — their tags are kept in
          case they come back.
        </CardText>
      )}
      {state.kind === 'done' && state.summary.leftOut > 0 && (
        <CardText>
          Left out {plural(state.summary.leftOut, 'file')} in unticked folders, like voice messages
          and recordings.
          {state.summary.hidden > 0 &&
            ` ${plural(state.summary.hidden, 'song')} from them ${state.summary.hidden === 1 ? 'is' : 'are'} hidden now; tags are kept.`}
        </CardText>
      )}
      {state.kind === 'error' && <CardText tone="error">Scan failed: {state.message}</CardText>}
      <CardActions>
        {state.kind === 'done' && state.summary.leftOut > 0 && onChooseFolders && (
          <Button label="Choose folders" variant="secondary" onPress={onChooseFolders} disabled={disabled} />
        )}
        <Button
          label={hasSongs ? 'Rescan library' : 'Scan my music'}
          variant={hasSongs ? 'secondary' : 'primary'}
          onPress={onScan}
          disabled={disabled}
        />
      </CardActions>
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
