import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { notifyLibraryChanged } from '../../db/changes';
import { ensureTagPath, listTagsWithCounts, parseTagPath } from '../../db/tags';
import { usePlaylistImport } from '../../library/usePlaylistImport';
import { openTag } from '../../navigation';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { useLibraryQuery } from '../../ui/hooks/useLibraryQuery';
import { ImportPrompt, ImportStatus } from '../../ui/library/ImportCards';
import { TAG_ROW_HEIGHT, TagRow } from '../../ui/library/TagRow';
import { PromptDialog } from '../../ui/PromptDialog';
import { spacing } from '../../ui/theme';

/** Top-level tags, directory style. Tapping one drills into it. */
export function TagsView() {
  const db = useSQLiteContext();
  const { data: tags } = useLibraryQuery((db) => listTagsWithCounts(db, null), []);
  const imports = usePlaylistImport();
  const [creating, setCreating] = useState(false);

  const createTag = async (input: string) => {
    await ensureTagPath(db, parseTagPath(input));
    notifyLibraryChanged();
  };

  return (
    <>
      <FlatList
        data={tags ?? []}
        keyExtractor={(tag) => String(tag.id)}
        getItemLayout={(_, index) => ({ length: TAG_ROW_HEIGHT, offset: TAG_ROW_HEIGHT * index, index })}
        renderItem={({ item }) => (
          <TagRow
            name={item.name}
            songCount={item.song_count}
            childCount={item.child_count}
            onPress={() => openTag(item.id)}
          />
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <ImportStatus state={imports.state} />
            <Button label="New tag" variant="secondary" onPress={() => setCreating(true)} />
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
