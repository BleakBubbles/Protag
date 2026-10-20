import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { notifyLibraryChanged } from '@/db/changes';
import { listMixes, saveMixAs } from '@/db/mixes';
import { openShuffle } from '@/navigation';
import type { QueueState } from '@/player/queue';
import { isEmptyDraft, sameDraft } from '@/query/types';
import { ActionSheet } from '@/ui/ActionSheet';
import { formatCount, plural } from '@/ui/format';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { Icon } from '@/ui/Icon';
import { PromptDialog } from '@/ui/PromptDialog';
import { colors, font, iconSize, spacing } from '@/ui/theme';

export interface SourceLineProps {
  queue: QueueState;
  /** Closes the player, before going to the Shuffle tab. */
  onClose: () => void;
}

/**
 * "Shuffling · kpop × chill  3 of 114": what's playing, and the place to keep
 * it. Often you only know a combination is good once you've heard it, so when
 * the queue came from tags, tapping this line offers to save it as a mix, or
 * to open it in Shuffle and tweak it. A bookmark after it says so: outlined
 * while unsaved, filled once it's a saved mix.
 */
export function SourceLine({ queue, onClose }: SourceLineProps) {
  const db = useSQLiteContext();
  const draft = queue.source?.draft;
  const { data: mixes } = useLibraryQuery((db) => listMixes(db), []);
  const [menu, setMenu] = useState(false);
  const [saving, setSaving] = useState(false);

  const label = queue.source?.label ?? 'Songs';
  const position = `${formatCount(queue.index + 1)} of ${formatCount(queue.order.length)}`;
  const text = (
    <Text style={styles.source} numberOfLines={1}>
      {queue.shuffled ? 'Shuffling' : 'Playing'} · {label}
      <Text style={styles.position}>
        {'  '}
        {position}
      </Text>
    </Text>
  );

  // Only a tag combination can become a mix ("Shuffle all" is everything already).
  if (!draft || isEmptyDraft(draft)) return <View style={styles.line}>{text}</View>;
  const saved = mixes?.find((m) => sameDraft(m.draft, draft)) ?? null;

  return (
    <>
      <Pressable
        onPress={() => setMenu(true)}
        accessibilityRole="button"
        accessibilityHint={saved ? 'Saved as a mix. Opens options' : 'Opens options to save it as a mix'}
        style={styles.line}
      >
        {text}
        <Icon name={saved ? 'bookmark' : 'bookmark-outline'} size={iconSize.sm - 4} color={colors.accentFg} />
      </Pressable>

      <ActionSheet
        visible={menu}
        title={`${saved?.name ?? label} · ${plural(queue.order.length, 'song')}`}
        actions={[
          ...(saved ? [] : [{ label: 'Save as mix', onPress: () => setSaving(true) }]),
          {
            label: 'Edit in Shuffle',
            onPress: () => {
              onClose();
              openShuffle(saved ? { mixId: saved.id } : { draft });
            },
          },
        ]}
        onClose={() => setMenu(false)}
      />
      <PromptDialog
        visible={saving}
        title="New mix"
        message={label}
        placeholder="Night drive"
        confirmLabel="Save"
        onSubmit={async (name) => {
          await saveMixAs(db, name, draft, null);
          notifyLibraryChanged();
        }}
        onClose={() => setSaving(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  line: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  source: {
    ...font.label,
    color: colors.textDim,
    flexShrink: 1,
    textAlign: 'center',
  },
  position: {
    ...font.numeric,
    color: colors.textFaint,
  },
});
