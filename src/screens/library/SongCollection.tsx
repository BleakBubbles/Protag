import { Stack } from 'expo-router';
import { useCallback, useMemo, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { SongRow as Song, TagRow } from '../../db/types';
import { albumArtUri } from '../../library/assets';
import { openEditTags, openSongTags } from '../../navigation';
import { useNowPlaying, usePlayerActions } from '../../player/PlayerProvider';
import { Button } from '../../ui/Button';
import { CardActions } from '../../ui/Card';
import { useFixedRowLayout } from '../../ui/hooks/useFixedRowLayout';
import { IconButton } from '../../ui/IconButton';
import { SONG_ROW_HEIGHT, SongRow } from '../../ui/library/SongRow';
import { Artwork } from '../../ui/player/Artwork';
import { colors, font, spacing } from '../../ui/theme';

const NO_TAGS: readonly TagRow[] = [];
const MAX_PICTURE = 220;

export interface SongCollectionProps {
  /** The picture at the top: an album's cover, or an artist's (round, a person). */
  picture: { albumId: string | null; round?: boolean };
  title: string;
  /** The line under the title; a link when it has `onPress` (an album's artist). */
  subtitle?: { label: string; onPress?: () => void };
  meta: string;
  songs: readonly Song[];
  tags: ReadonlyMap<number, readonly TagRow[]>;
  /** How the player names what's playing: "Playing · New Jeans". */
  label: string;
  /** Between the buttons and the songs, like an artist's albums. */
  children?: ReactNode;
}

/**
 * An album's or an artist's page: their picture and name, Play (in order) and
 * Shuffle, then the songs, with their tags like everywhere else. The tag button
 * up top tags them all at once: for someone who thinks in albums, tagging one
 * song at a time would be the friction that sends them away.
 */
export function SongCollection({ picture, title, subtitle, meta, songs, tags, label, children }: SongCollectionProps) {
  const screen = useWindowDimensions();
  const { playQueue } = usePlayerActions();
  const { song: current } = useNowPlaying();
  const { getItemLayout, onHeaderLayout } = useFixedRowLayout(SONG_ROW_HEIGHT);
  const ids = useMemo(() => songs.map((s) => s.id), [songs]);
  const size = Math.min(MAX_PICTURE, screen.width * 0.55);

  const play = useCallback(
    (startId?: number, shuffle = false) => playQueue(ids, { startId, shuffle, label }),
    [ids, label, playQueue]
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerRight: () =>
            ids.length > 0 ? (
              <IconButton icon="tag" label={`Edit tags for all ${ids.length} songs`} onPress={() => openEditTags(ids)} />
            ) : null,
        }}
      />
      <FlatList
        style={styles.screen}
        data={songs}
        keyExtractor={(song) => String(song.id)}
        getItemLayout={getItemLayout}
        renderItem={({ item }) => (
          <SongRow
            id={item.id}
            title={item.title}
            artist={item.artist}
            artworkUri={albumArtUri(item.album_id)}
            tags={tags.get(item.id) ?? NO_TAGS}
            active={current?.id === item.id}
            onPress={play}
            onEditTags={openSongTags}
          />
        )}
        ListHeaderComponent={
          <View style={styles.header} onLayout={onHeaderLayout}>
            <Artwork
              uri={picture.albumId ? albumArtUri(picture.albumId) : null}
              size={size}
              cornerRadius={picture.round ? size / 2 : undefined}
            />
            <View style={styles.names}>
              <Text style={styles.title} numberOfLines={2}>
                {title}
              </Text>
              {subtitle &&
                (subtitle.onPress ? (
                  <Pressable onPress={subtitle.onPress} accessibilityRole="link" hitSlop={8}>
                    <Text style={[styles.subtitle, styles.link]} numberOfLines={1}>
                      {subtitle.label}
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {subtitle.label}
                  </Text>
                ))}
              <Text style={styles.meta}>{meta}</Text>
            </View>
            <View style={styles.actions}>
              <CardActions>
                <Button label="Play" icon="play" onPress={() => play()} disabled={ids.length === 0} />
                <Button label="Shuffle" icon="shuffle" variant="secondary" onPress={() => play(undefined, true)} disabled={ids.length === 0} />
              </CardActions>
            </View>
            {children}
          </View>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.lg,
  },
  names: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.lg,
  },
  title: {
    ...font.title,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    ...font.body,
    color: colors.textDim,
  },
  link: {
    color: colors.accentFg,
  },
  meta: {
    ...font.caption,
    color: colors.textFaint,
  },
  actions: {
    alignSelf: 'stretch',
    paddingHorizontal: spacing.lg,
  },
});
