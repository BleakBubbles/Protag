import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { folderLabel } from '../../library/m3u';
import type { FolderImportSummary } from '../../library/playlistFolder';
import type { PlaylistImportResult } from '../../library/playlists';
import type { ImportState } from '../../library/usePlaylistImport';
import { openTag } from '../../navigation';
import { Button } from '../Button';
import { Card, CardActions, CardStatus, CardText } from '../Card';
import { formatCount, plural } from '../format';
import { colors, font, iconSize, radius, spacing, tagColor } from '../theme';

const TILE = 36;

const PLAYLISTS_INFO = {
  topic: 'Playlists',
  paragraphs: [
    'Other music apps can save playlists as .m3u files. Pick the folder they’re in, and each playlist becomes a tag holding its songs.',
    'Importing again is safe: it only adds songs that are new, and never duplicates or removes anything.',
    'Songs a playlist lists but this phone doesn’t have are shown under that playlist, so you can see what didn’t match.',
  ],
};

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
    <Card title="Bring your playlists" info={PLAYLISTS_INFO}>
      <CardText>Turn playlists from another music app into tags.</CardText>
      <CardActions>
        <Button label="Choose folder" icon="folder-open-outline" onPress={onChoose} disabled={disabled} />
        <Button label="Not now" variant="secondary" onPress={onDismiss} disabled={disabled} />
      </CardActions>
    </Card>
  );
}

/**
 * Manage library's playlist card: what importing does, where from last time,
 * the button, and — after an import — what came of each playlist, right here.
 */
export function PlaylistsCard({
  state,
  folder,
  disabled,
  onImport,
}: {
  state: ImportState;
  /** The folder imported from last time, if any; the picker opens there. */
  folder: string | null;
  disabled?: boolean;
  onImport: () => void;
}) {
  return (
    <Card
      title="Playlists"
      info={PLAYLISTS_INFO}
      action={
        <Button label="Import" icon="download-outline" variant="tonal" onPress={onImport} disabled={disabled} />
      }
    >
      <CardStatus>{folder ? `Last imported from ${folderLabel(folder)}` : 'Not imported yet'}</CardStatus>
      <ImportProgress state={state} />
    </Card>
  );
}

/** Progress and results of an import, as a card of its own (for the Tags view). Nothing when idle. */
export function ImportStatus({ state }: { state: ImportState }) {
  if (state.kind === 'idle') return null;
  return (
    <Card>
      <ImportProgress state={state} />
    </Card>
  );
}

function ImportProgress({ state }: { state: ImportState }) {
  if (state.kind === 'idle') return null;
  if (state.kind === 'importing') {
    return (
      <View style={styles.progress}>
        <ActivityIndicator color={colors.accentFg} />
        <CardText>Importing playlists…</CardText>
      </View>
    );
  }
  if (state.kind === 'error') return <CardText tone="error">Import failed: {state.message}</CardText>;
  return <ImportResults summary={state.summary} />;
}

function ImportResults({ summary }: { summary: FolderImportSummary }) {
  const { results, unreadable } = summary;
  return (
    <View style={styles.results}>
      <Text style={styles.heading}>
        {results.length === 0 ? 'No playlists in that folder' : `Imported ${plural(results.length, 'playlist')}`}
      </Text>
      {results.map((result) => (
        <ResultRow key={result.name} result={result} />
      ))}
      {unreadable > 0 && <CardText>{plural(unreadable, 'file')} couldn't be read.</CardText>}
    </View>
  );
}

/**
 * One playlist's outcome: its tag (tap to open it), how many songs it holds,
 * and the songs that weren't found, listed on request so a mismatch can be
 * looked into instead of just counted.
 */
function ResultRow({ result }: { result: PlaylistImportResult }) {
  const [showMissing, setShowMissing] = useState(false);
  const { tagId } = result;
  const hue = tagColor(result.color);
  const detail =
    tagId === null
      ? result.unmatched === 1
        ? 'Its one song isn’t on this phone'
        : `None of its ${formatCount(result.unmatched)} songs are on this phone`
      : [
          plural(result.matched, 'song'),
          result.createdTag ? 'new tag' : result.added > 0 ? `${formatCount(result.added)} added to your tag` : 'already up to date',
        ].join(' · ');

  return (
    <View>
      <Pressable
        onPress={tagId === null ? undefined : () => openTag(tagId)}
        disabled={tagId === null}
        accessibilityRole={tagId === null ? undefined : 'button'}
        accessibilityLabel={`${result.name}, ${detail}`}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={[styles.tile, { backgroundColor: tagId === null ? colors.surfaceAlt : `${hue}38` }]}>
          <Ionicons
            name={tagId === null ? 'folder-outline' : 'folder'}
            size={iconSize.sm}
            color={tagId === null ? colors.textFaint : hue}
          />
        </View>
        <View style={styles.text}>
          <Text style={[styles.name, tagId === null && styles.off]} numberOfLines={1}>
            {result.name}
          </Text>
          <Text style={styles.detail} numberOfLines={1}>
            {detail}
          </Text>
        </View>
        {tagId !== null && <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textFaint} />}
      </Pressable>

      {result.missing.length > 0 && (
        <>
          {/* The label stays put; only the arrow turns. */}
          <Pressable
            onPress={() => setShowMissing((open) => !open)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showMissing }}
            style={styles.missingToggle}
          >
            <Text style={styles.missingLabel}>{formatCount(result.missing.length)} not found on this phone</Text>
            <Ionicons name={showMissing ? 'chevron-up' : 'chevron-down'} size={iconSize.sm - 6} color={colors.textDim} />
          </Pressable>
          {showMissing && (
            <View style={styles.missingList}>
              {result.missing.map((label, i) => (
                <Text key={i} style={styles.missingItem} numberOfLines={1}>
                  {label}
                </Text>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  results: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  heading: {
    ...font.label,
    color: colors.textDim,
  },
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
  },
  pressed: {
    backgroundColor: colors.surfaceAlt,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
  name: {
    ...font.name,
    color: colors.text,
  },
  off: {
    color: colors.textDim,
  },
  detail: {
    ...font.caption,
    color: colors.textDim,
  },
  missingToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 32,
    marginLeft: TILE + spacing.md,
  },
  missingLabel: {
    ...font.label,
    color: colors.textDim,
  },
  missingList: {
    marginLeft: TILE + spacing.md,
    paddingBottom: spacing.sm,
    gap: 2,
  },
  missingItem: {
    ...font.caption,
    color: colors.textFaint,
  },
});
