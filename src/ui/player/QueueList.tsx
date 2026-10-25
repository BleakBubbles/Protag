import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { getPlayableSongs, type PlayableSong } from '@/db/songs';
import { albumArtUri } from '@/library/assets';
import { usePlayerActions } from '@/player/PlayerProvider';
import type { QueueState } from '@/player/queue';
import { formatCount } from '@/ui/format';
import { IconButton } from '@/ui/IconButton';
import { colors, font, iconSize, spacing } from '@/ui/theme';
import { Artwork } from './Artwork';

const ROW = 56;
const HEADING = 36;
const THUMB = 40;
const FADE_MS = 150;

type Item = { kind: 'heading'; label: string } | { kind: 'song'; at: number; id: number };

/**
 * What's coming up, in the player where the artwork was: the songs the
 * listener queued first ("Queued"), then the rest of the order ("Next from
 * kpop"). Tap a song to play it now; × takes it out.
 */
export function QueueList({ queue }: { queue: QueueState }) {
  const db = useSQLiteContext();
  const { jumpTo, removeUpcoming } = usePlayerActions();

  // Each song's details, for the whole order at once: one query per new order, not per row.
  const [songs, setSongs] = useState<ReadonlyMap<number, PlayableSong>>(new Map());
  useEffect(() => {
    let live = true;
    getPlayableSongs(db, queue.order).then((rows) => live && setSongs(new Map(rows.map((s) => [s.id, s]))));
    return () => {
      live = false;
    };
  }, [db, queue.order]);

  const items = useMemo(() => {
    const out: Item[] = [];
    const first = queue.index + 1;
    const queuedEnd = Math.max(first, queue.queuedEnd);
    if (queuedEnd > first) out.push({ kind: 'heading', label: `Queued · ${formatCount(queuedEnd - first)}` });
    for (let at = first; at < queuedEnd; at++) out.push({ kind: 'song', at, id: queue.order[at] });
    const rest = queue.order.length - queuedEnd;
    if (rest > 0) {
      const from = queue.source ? `Next from ${queue.source.label}` : 'Next';
      out.push({ kind: 'heading', label: `${from} · ${formatCount(rest)}` });
    }
    for (let at = queuedEnd; at < queue.order.length; at++) out.push({ kind: 'song', at, id: queue.order[at] });
    return out;
  }, [queue]);

  // Rows and headings have fixed heights, so a long order scrolls without measuring each one.
  const offsets = useMemo(() => {
    const out = [0];
    for (const item of items) out.push(out[out.length - 1] + (item.kind === 'heading' ? HEADING : ROW));
    return out;
  }, [items]);

  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start();
  }, [fade]);

  return (
    <Animated.View style={[styles.box, { opacity: fade }]}>
      <FlatList
        data={items}
        keyExtractor={(item) => (item.kind === 'heading' ? item.label : `${item.at}:${item.id}`)}
        getItemLayout={(_, i) => ({ length: offsets[i + 1] - offsets[i], offset: offsets[i], index: i })}
        renderItem={({ item }) =>
          item.kind === 'heading' ? (
            <Text style={styles.heading} numberOfLines={1}>
              {item.label}
            </Text>
          ) : (
            <QueueRow song={songs.get(item.id)} onPlay={() => jumpTo(item.at)} onRemove={() => removeUpcoming(item.at)} />
          )
        }
        ListEmptyComponent={<Text style={styles.empty}>Nothing after this song</Text>}
      />
    </Animated.View>
  );
}

function QueueRow({ song, onPlay, onRemove }: { song?: PlayableSong; onPlay: () => void; onRemove: () => void }) {
  const title = song?.title ?? ' ';
  return (
    <Pressable
      onPress={onPlay}
      accessibilityRole="button"
      accessibilityLabel={`Play ${title} now`}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Artwork uri={albumArtUri(song?.album_id ?? null)} size={THUMB} />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {song?.artist ?? ' '}
        </Text>
      </View>
      <IconButton icon="close" label={`Remove ${title} from the queue`} size={iconSize.sm} color={colors.textDim} onPress={onRemove} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    alignSelf: 'stretch',
  },
  heading: {
    ...font.caption,
    height: HEADING,
    paddingTop: spacing.md,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  row: {
    height: ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  pressed: {
    backgroundColor: colors.surface,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...font.listTitle,
    color: colors.text,
    includeFontPadding: false,
  },
  artist: {
    ...font.caption,
    color: colors.textDim,
    includeFontPadding: false,
  },
  empty: {
    ...font.body,
    color: colors.textDim,
    textAlign: 'center',
    paddingTop: spacing.xl,
  },
});
