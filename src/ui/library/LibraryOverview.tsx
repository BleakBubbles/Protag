import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';

import type { ScanState } from '../../library/useLibraryScan';
import { Button } from '../Button';
import { Card, CardActions, CardText } from '../Card';
import { formatCount, formatDaysAgo } from '../format';
import { font, radius, spacing } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';
import { ScanSummaryText } from './ScanCard';

const STATUS_HEIGHT = 20;

export interface LibraryCounts {
  songs: number;
  tags: number;
  /** Folders known, and how many of them are read; 0 known until the first scan with folders. */
  folders: number;
  reading: number;
  /** When the last full scan finished, if one has since this was recorded. */
  lastScanAt: number | null;
}

export interface LibraryOverviewProps {
  counts: LibraryCounts;
  state: ScanState;
  disabled?: boolean;
  onScan: () => void;
  onChooseFolders: () => void;
}

/**
 * The top of Settings: what Protag sees on this phone, when it last
 * looked, and the two ways to change that — rescan, or choose folders.
 */
export function LibraryOverview({ counts, state, disabled, onScan, onChooseFolders }: LibraryOverviewProps) {
  const colors = useColors();
  const styles = useStyles();
  const denied = state.kind === 'denied' ? state : null;
  // Before the first scan there's nothing to scan *again*.
  const scanned = counts.songs > 0 || counts.lastScanAt !== null;
  return (
    <Card
      title="On this phone"
      info={{
        topic: 'Your music',
        paragraphs: [
          'Protag plays the music already on this phone; it doesn’t copy or move any files.',
          'Songs added to the phone show up by themselves; rescan if one hasn’t. Songs that have gone keep their tags, in case they come back.',
          'Choose folders to leave out audio that isn’t music, like voice messages or recordings. Folders that look like that start out left out.',
        ],
      }}
    >
      <View style={styles.stats}>
        <Stat value={formatCount(counts.songs)} unit={counts.songs === 1 ? 'song' : 'songs'} />
        <Stat value={formatCount(counts.tags)} unit={counts.tags === 1 ? 'tag' : 'tags'} />
        {counts.folders > 0 ? (
          <Stat value={formatCount(counts.reading)} of={formatCount(counts.folders)} unit="folders" />
        ) : (
          <Stat value="All" unit="folders" />
        )}
      </View>

      {/* One line that's always there, so the buttons never jump as a scan starts and ends. */}
      <View style={styles.status}>
        {state.kind === 'scanning' && <ActivityIndicator size="small" color={colors.accentFg} />}
        <Text style={styles.statusText} numberOfLines={1}>
          {statusLine(state, counts.lastScanAt, scanned)}
        </Text>
      </View>

      {state.kind === 'done' && <ScanSummaryText summary={state.summary} />}
      {state.kind === 'error' && <CardText tone="error">Scan failed: {state.message}</CardText>}
      {denied && <CardText>Protag needs access to your music to scan it. It only reads audio files.</CardText>}

      <CardActions>
        {denied && !denied.canAskAgain ? (
          <Button label="Open settings" icon="settings-outline" variant="tonal" onPress={() => Linking.openSettings()} />
        ) : (
          <Button
            label={denied ? 'Allow access' : scanned ? 'Rescan' : 'Scan'}
            icon={scanned ? 'refresh' : 'search'}
            variant="tonal"
            onPress={onScan}
            disabled={disabled}
          />
        )}
        <Button label="Folders" icon="folder-outline" variant="secondary" onPress={onChooseFolders} disabled={disabled} />
      </CardActions>
    </Card>
  );
}

function statusLine(state: ScanState, lastScanAt: number | null, scanned: boolean): string {
  if (state.kind === 'scanning') {
    const { progress } = state;
    return progress
      ? `Reading your library… ${formatCount(progress.scanned)} of ${formatCount(progress.total)}`
      : 'Reading your library…';
  }
  if (lastScanAt !== null) return `Last scanned ${formatDaysAgo(lastScanAt)}`;
  return scanned ? 'Rescan to pick up songs added since' : 'Not scanned yet';
}

function Stat({ value, of, unit }: { value: string; of?: string; unit: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.value} numberOfLines={1}>
        {value}
        {of && <Text style={styles.of}> of {of}</Text>}
      </Text>
      <Text style={styles.unit}>{unit}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  stats: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  stat: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  value: {
    ...font.title,
    color: colors.text,
  },
  of: {
    ...font.label,
    color: colors.textDim,
  },
  unit: {
    ...font.label,
    color: colors.textDim,
  },
  status: {
    height: STATUS_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusText: {
    ...font.label,
    color: colors.textDim,
    flexShrink: 1,
  },
}));
