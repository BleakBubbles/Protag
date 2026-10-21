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
import { Marquee } from '@/ui/Marquee';
import { PromptDialog } from '@/ui/PromptDialog';
import { colors, font, radius, spacing } from '@/ui/theme';

const PILL_HEIGHT = 32;
const PILL_PADDING = spacing.md;

export interface SourceLineProps {
  queue: QueueState;
  /** Closes the player, before going to the Shuffle tab. */
  onClose: () => void;
}

/**
 * "Shuffling · kpop × chill  3 of 114": what's playing, the label scrolling sideways
 * when it's too long to fit. Often you only know a combination is good once
 * you've heard it, so when the queue came from tags, the line sits in a soft
 * pill that can be tapped: save it as a mix, or open it in Shuffle to tweak it.
 */
export function SourceLine({ queue, onClose }: SourceLineProps) {
  const db = useSQLiteContext();
  const draft = queue.source?.draft;
  const { data: mixes } = useLibraryQuery((db) => listMixes(db), []);
  const [menu, setMenu] = useState(false);
  const [saving, setSaving] = useState(false);
  /** The room between the buttons either side. */
  const [room, setRoom] = useState(0);

  const label = queue.source?.label ?? 'Songs';
  // Only a tag combination can become a mix ("Shuffle all" is everything already).
  const tappable = !!draft && !isEmptyDraft(draft);
  const saved = tappable ? (mixes?.find((m) => sameDraft(m.draft, draft)) ?? null) : null;

  /** The position's own width, so the label scrolls in whatever room it leaves. */
  const [positionWidth, setPositionWidth] = useState(0);

  // The label scrolls when it's too long; the position, which changes every
  // track, stays put at the end, so a skip never restarts the scroll.
  const line = (
    <View style={styles.line}>
      <Marquee style={styles.source} maxWidth={room - PILL_PADDING * 2 - positionWidth - spacing.sm}>
        {queue.shuffled ? (queue.byAlbum ? 'Shuffling albums' : 'Shuffling') : 'Playing'} · {label}
      </Marquee>
      <Text style={styles.position} onLayout={(e) => setPositionWidth(Math.ceil(e.nativeEvent.layout.width))}>
        {formatCount(queue.index + 1)} of {formatCount(queue.order.length)}
      </Text>
    </View>
  );

  return (
    <View style={styles.slot} onLayout={(e) => setRoom(e.nativeEvent.layout.width)}>
      {tappable ? (
        <Pressable
          onPress={() => setMenu(true)}
          accessibilityRole="button"
          accessibilityHint={saved ? 'Opens options for this mix' : 'Opens options to save this as a mix'}
          style={({ pressed }) => [styles.pill, styles.filled, pressed && styles.pressed]}
        >
          {line}
        </Pressable>
      ) : (
        // Same box without the fill, so the text sits in the same place either way.
        <View style={styles.pill}>{line}</View>
      )}

      {tappable && (
        <>
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    flex: 1,
    alignItems: 'center',
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pill: {
    height: PILL_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: PILL_PADDING,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  filled: {
    backgroundColor: colors.surfaceAlt,
  },
  pressed: {
    opacity: 0.7,
  },
  source: {
    ...font.label,
    color: colors.textDim,
  },
  position: {
    ...font.numeric,
    color: colors.textFaint,
  },
});
