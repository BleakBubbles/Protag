import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { notifyLibraryChanged } from '../../db/changes';
import { ensureTagPath, listTagsWithCounts, parseTagPath } from '../../db/tags';
import { usePlaylistImport } from '../../library/usePlaylistImport';
import { openTag } from '../../navigation';
import { EmptyState } from '../../ui/EmptyState';
import { Fab, FAB_CLEARANCE, useFabFold } from '../../ui/Fab';
import { useFixedRowLayout } from '../../ui/hooks/useFixedRowLayout';
import { useLibraryQuery } from '../../ui/hooks/useLibraryQuery';
import { ImportPrompt, ImportStatus } from '../../ui/library/ImportCards';
import { TAG_ROW_HEIGHT, TagRow } from '../../ui/library/TagRow';
import { PromptDialog } from '../../ui/PromptDialog';
import { spacing } from '../../ui/theme';

/** Top-level tags as folders: the library's root directory. Tapping one opens it. */
export function TagsView() {
  const db = useSQLiteContext();
  const { data: tags } = useLibraryQuery((db) => listTagsWithCounts(db, null), []);
  const imports = usePlaylistImport();
  const [creating, setCreating] = useState(false);
  const { getItemLayout, onHeaderLayout } = useFixedRowLayout(TAG_ROW_HEIGHT);
  const fab = useFabFold();

  // Opens the new tag straight away: the next step is almost always adding songs
  // to it, and an empty tag's screen leads with exactly that.
  const createTag = async (input: string) => {
    const id = await ensureTagPath(db, parseTagPath(input));
    notifyLibraryChanged();
    openTag(id);
  };

  return (
    <>
      <FlatList
        data={tags ?? []}
        keyExtractor={(tag) => String(tag.id)}
        getItemLayout={getItemLayout}
        {...fab.scrollProps}
        contentContainerStyle={{ paddingBottom: FAB_CLEARANCE }}
        renderItem={({ item }) => (
          <TagRow
            name={item.name}
            color={item.color}
            songCount={item.song_count}
            childCount={item.child_count}
            onPress={() => openTag(item.id)}
          />
        )}
        ListHeaderComponent={
          // Only takes room while an import has something to report.
          <View style={imports.state.kind !== 'idle' && styles.header} onLayout={onHeaderLayout}>
            <ImportStatus state={imports.state} />
          </View>
        }
        ListEmptyComponent={
          tags === undefined ? null : (
            <View style={styles.empty}>
              {imports.showPrompt && (
                <ImportPrompt
                  onChoose={imports.run}
                  onDismiss={imports.dismissPrompt}
                  disabled={imports.busy}
                />
              )}
              <EmptyState
                icon="pricetags-outline"
                title="No tags yet"
                body="Tag songs from the Songs tab, or from the player while a song plays. Type parent/child to make a nested tag."
              />
            </View>
          )
        }
      />
      <Fab label="New tag" icon="add" extended={fab.extended} onPress={() => setCreating(true)} />
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

const styles = StyleSheet.create({
  header: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  empty: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
});
