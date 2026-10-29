import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';

import type { ScanState } from '../../library/useLibraryScan';
import { Button } from '../Button';
import { EmptyState } from '../EmptyState';
import { formatCount } from '../format';
import { LogoMark } from '../LogoMark';
import { font, spacing } from '../theme';
import { makeStyles, useColors } from '../ThemeContext';

export interface WelcomeProps {
  state: ScanState;
  disabled?: boolean;
  onScan: () => void;
  onChooseFolders: () => void;
}

/**
 * The Library tab before there's any music: the one place the app introduces
 * itself, on the page like every other empty state, with the way to find your
 * songs. Each step of the first scan says how it's going in the same spot.
 */
export function Welcome({ state, disabled, onScan, onChooseFolders }: WelcomeProps) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <EmptyState large art={<LogoMark width={48} />} title="Welcome to Protag" body={bodyFor(state)}>
      {state.kind === 'scanning' ? (
        <View style={styles.progress}>
          <ActivityIndicator color={colors.accentFg} />
          {state.progress && (
            <Text style={styles.progressText}>
              {formatCount(state.progress.scanned)} of {formatCount(state.progress.total)}
            </Text>
          )}
        </View>
      ) : state.kind === 'denied' ? (
        state.canAskAgain ? (
          <Button label="Allow access" variant="tonal" onPress={onScan} />
        ) : (
          <Button label="Open settings" icon="settings-outline" variant="tonal" onPress={() => Linking.openSettings()} />
        )
      ) : (
        <>
          <Button label={state.kind === 'idle' ? 'Scan my music' : 'Scan again'} icon="search" variant="tonal" onPress={onScan} disabled={disabled} />
          {state.kind === 'done' && state.summary.leftOut > 0 && (
            <Button label="Folders" icon="folder-outline" variant="secondary" onPress={onChooseFolders} disabled={disabled} />
          )}
        </>
      )}
    </EmptyState>
  );
}

function bodyFor(state: ScanState): string {
  switch (state.kind) {
    case 'idle':
      return 'Shuffle your music by mood, moment or anything you like. Start by finding the songs on this phone.';
    case 'scanning':
      return 'Reading your library…';
    case 'denied':
      return 'Protag needs access to your music. It only reads audio files, never photos, videos or anything else.';
    case 'error':
      return `The scan failed: ${state.message}`;
    case 'done':
      // With songs found, the library replaces this screen.
      return state.summary.leftOut > 0
        ? 'No songs found. Some folders were left out, like voice messages and recordings: check Folders if your music is in one.'
        : 'No songs found on this phone.';
  }
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
  },
  progressText: {
    ...font.label,
    color: colors.textDim,
  },
}));
