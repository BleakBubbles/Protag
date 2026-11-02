import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { notifyLibraryChanged } from '../../db/changes';
import { ensureTagPath, listTagsWithCounts, parseTagPath } from '../../db/tags';
import { usePlaylistImport } from '../../library/usePlaylistImport';
import { openInbox, openTag } from '../../navigation';
import { Fab, FAB_CLEARANCE } from '../../ui/Fab';
import { plural } from '../../ui/format';
import { useInbox } from '../../ui/hooks/useInbox';
import { useLibraryQuery } from '../../ui/hooks/useLibraryQuery';
import type { Selection } from '../../ui/hooks/useSelection';
import { Icon } from '../../ui/Icon';
import { ImportPrompt, ImportStatus } from '../../ui/library/ImportCards';
import { InboxCard } from '../../ui/library/InboxCard';
import { TagList } from '../../ui/library/TagList';
import { NewTagRow } from '../../ui/library/TagRow';
import { TagSelectionBar } from '../../ui/library/TagSelectionBar';
import { PromptDialog } from '../../ui/PromptDialog';
import { font, iconSize, spacing } from '../../ui/theme';
import { makeStyles, useColors } from '../../ui/ThemeContext';

export interface TagsViewProps {
  /** Selecting the tags, owned by the Library screen, which shows its header while selecting. */
  tagSelection: Selection;
  /** Reports the tags as listed, so their selection knows what "all" is. */
  onTags: (tagIds: readonly number[]) => void;
}

/**
 * The library's root directory: top-level tags as folders. Songs no tag holds
 * yet wait on a page of their own, which a card at the top leads to until
 * they're tagged or it's dismissed; dismissed, a quiet row at the end still does.
 */
export function TagsView({ tagSelection, onTags }: TagsViewProps) {
  const colors = useColors();
  const styles = useStyles();
  const db = useSQLiteContext();
  const { data } = useLibraryQuery((db) => listTagsWithCounts(db, null), []);
  const inbox = useInbox();
  const imports = usePlaylistImport();
  const [creating, setCreating] = useState(false);
  // New tag is a row after the tags, and the floating button stands in for it
  // whenever it isn't wholly in view (scrolled off the top, or not yet scrolled
  // to): one New tag on screen at a time.
  const [row, setRow] = useState<{ top: number; end: number } | null>(null);
  const [scrolled, setScrolled] = useState(0);
  const [viewHeight, setViewHeight] = useState(0);
  const rowOutOfView = row !== null && viewHeight > 0 && (row.top < scrolled || row.end > scrolled + viewHeight);
  const track = (e: NativeSyntheticEvent<NativeScrollEvent>) => setScrolled(e.nativeEvent.contentOffset.y);

  // Opens the new tag straight away: the next step is almost always adding songs
  // to it, and an empty tag's screen leads with exactly that.
  const createTag = async (input: string) => {
    const id = await ensureTagPath(db, parseTagPath(input));
    notifyLibraryChanged();
    openTag(id);
  };

  const tags = useMemo(() => data ?? [], [data]);
  useEffect(() => onTags(tags.map((t) => t.id)), [tags, onTags]);
  // Sliding across tags or dragging one by its handle: the list mustn't scroll under it.
  const [tagsBusy, setTagsBusy] = useState(false);

  return (
    <>
      <ScrollView
        style={styles.frame}
        scrollEnabled={!tagsBusy}
        onScroll={track}
        scrollEventThrottle={16}
        onLayout={(e) => setViewHeight(e.nativeEvent.layout.height)}
        contentContainerStyle={[styles.top, { paddingBottom: FAB_CLEARANCE }]}
      >
        <InboxCard />
        {/* Only takes room while there's something to report or offer. */}
        {(imports.state.kind !== 'idle' || (tags.length === 0 && imports.showPrompt)) && (
          <View style={styles.notices}>
            <ImportStatus state={imports.state} />
            {tags.length === 0 && imports.showPrompt && (
              <ImportPrompt onChoose={imports.run} onDismiss={imports.dismissPrompt} disabled={imports.busy} />
            )}
          </View>
        )}
        <TagList tags={tags} selection={tagSelection} onOpen={openTag} onBusy={setTagsBusy} />
        <NewTagRow
          onPress={() => setCreating(true)}
          disabled={tagSelection.selecting}
          onLayout={(e) => {
            const { y, height } = e.nativeEvent.layout;
            setRow({ top: y, end: y + height });
          }}
        />
        {/* With the reminder dismissed, the songs are still a tap away. */}
        {!inbox.shown && inbox.count > 0 && (
          <Pressable
            onPress={openInbox}
            disabled={tagSelection.selecting}
            accessibilityRole="button"
            style={({ pressed }) => [styles.looseRow, pressed && styles.pressed]}
          >
            <Text style={styles.looseLabel}>Not tagged yet · {plural(inbox.count, 'song')}</Text>
            <Icon name="chevron-forward" size={iconSize.sm} color={colors.textDim} />
          </Pressable>
        )}
      </ScrollView>
      {tagSelection.selecting ? (
        <TagSelectionBar selection={tagSelection} />
      ) : (
        <Fab label="New tag" icon="add" extended={false} shown={rowOutOfView} onPress={() => setCreating(true)} />
      )}
      <PromptDialog
        visible={creating}
        title="New tag"
        message="Use / to nest, like asian-pop/kpop."
        placeholder="Tag name"
        confirmLabel="Create"
        onSubmit={createTag}
        onClose={() => setCreating(false)}
      />
    </>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
  frame: {
    flex: 1,
  },
  // With the rows' own padding, the first tile starts as far below the tabs as the other tabs' search fields.
  top: {
    paddingTop: spacing.xs,
  },
  notices: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  looseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pressed: {
    opacity: 0.6,
  },
  looseLabel: {
    ...font.caption,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
}));
