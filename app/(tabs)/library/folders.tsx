import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { notifyLibraryChanged } from '@/db/changes';
import { setFolderIncluded, syncFolders, type LibraryFolder } from '@/library/libraryFolders';
import { useLibraryScan } from '@/library/useLibraryScan';
import { EmptyState } from '@/ui/EmptyState';
import { InfoButton } from '@/ui/InfoButton';
import { plural } from '@/ui/format';
import { ScanCard } from '@/ui/library/ScanCard';
import { colors, font, iconSize, spacing } from '@/ui/theme';

const ROW_HEIGHT = 64;

const FOLDERS_INFO = {
  topic: 'Folders',
  paragraphs: [
    'ProTag reads music from the ticked folders.',
    'Folders that look like voice messages, recordings or phone sounds start unticked. Tap a folder to change it, then rescan.',
    'Songs in an unticked folder keep their tags, and come back if you tick it again.',
  ],
};

/**
 * Which of the phone's audio folders ProTag reads. Folders that look like
 * voice messages, recordings or phone sounds start unticked, with the reason
 * shown; everything else starts ticked. Changes apply on the next scan, so the
 * rescan button stays pinned below the list.
 */
export default function FoldersScreen() {
  const db = useSQLiteContext();
  const scan = useLibraryScan();
  const [folders, setFolders] = useState<LibraryFolder[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Again after each scan, which may have found folders that are new.
  const scanned = scan.state.kind === 'done';
  useEffect(() => {
    let live = true;
    syncFolders(db)
      .then((found) => live && setFolders(found))
      .catch((error) => {
        console.warn('[folders] could not list folders', error);
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [db, scanned]);

  const toggle = (id: string) => {
    const folder = folders?.find((f) => f.id === id);
    if (!folder) return;
    const include = !folder.choice.include;
    setFolders((list) =>
      list?.map((f) => (f.id === id ? { ...f, choice: { ...f.choice, include, by: 'user', reason: null } } : f)) ?? null
    );
    setFolderIncluded(db, id, include)
      .then(notifyLibraryChanged)
      .catch((error) => console.warn('[folders] could not save', error));
  };

  if (failed) {
    return (
      <View style={styles.screen}>
        <EmptyState icon="folder-outline" title="No folders to show" body="Scan your music first, then choose which folders to read." />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerRight: () => <InfoButton {...FOLDERS_INFO} /> }} />
      <FlatList
        data={folders ?? []}
        keyExtractor={(folder) => folder.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <FolderRow folder={item} onToggle={toggle} />}
      />
      <View style={styles.footer}>
        <ScanCard state={scan.state} hasSongs disabled={scan.busy} onScan={scan.run} />
      </View>
    </View>
  );
}

function FolderRow({ folder, onToggle }: { folder: LibraryFolder; onToggle: (id: string) => void }) {
  const { title, include, reason } = folder.choice;
  const files = plural(folder.count, 'file');
  return (
    <Pressable
      onPress={() => onToggle(folder.id)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: include }}
      accessibilityLabel={`${title}, ${files}${reason ? `, ${reason}` : ''}`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Ionicons name="folder-outline" size={iconSize.md} color={include ? colors.textDim : colors.textFaint} />
      <View style={styles.text}>
        <Text style={[styles.title, !include && styles.off]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {reason && !include ? `${reason} · ${files}` : files}
        </Text>
      </View>
      <Ionicons
        name={include ? 'checkmark-circle' : 'ellipse-outline'}
        size={iconSize.md}
        color={include ? colors.accentFg : colors.textFaint}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  list: {
    paddingVertical: spacing.sm,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  text: {
    flex: 1,
  },
  title: {
    ...font.listTitle,
    color: colors.text,
    includeFontPadding: false,
  },
  off: {
    color: colors.textDim,
  },
  subtitle: {
    ...font.caption,
    color: colors.textDim,
    includeFontPadding: false,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
