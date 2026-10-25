import { Stack } from 'expo-router';
import { useCallback, useMemo, type ReactNode } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { SongRow as Song, TagRow } from '../../db/types';
import { albumArtUri } from '../../library/assets';
import { openEditTags, openTag } from '../../navigation';
import { useNowPlaying, usePlayerActions } from '../../player/PlayerProvider';
import { ARTIST_MODES } from '../../player/queue';
import { Button } from '../../ui/Button';
import { CardActions } from '../../ui/Card';
import { useFixedRowLayout } from '../../ui/hooks/useFixedRowLayout';
import { useSongSelection } from '../../ui/hooks/useSongSelection';
import { SELECTION_BAR_HEIGHT, SelectionBar } from '../../ui/library/SelectionBar';
import { SONG_ROW_HEIGHT, SongRow } from '../../ui/library/SongRow';
import { Artwork } from '../../ui/player/Artwork';
import { useBackToPlayer } from '../../ui/player/BackToPlayer';
import { NoTags, TagButton } from '../../ui/TagButton';
import { TagChip } from '../../ui/TagChip';
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
  /** What the tag button does, for screen readers: "Tag songs in New Jeans", "Tag songs by NewJeans". */
  tagPrompt: string;
  /** Sections between the tags and the songs, like an artist's albums (use `CollectionSection`). */
  children?: ReactNode;
  /**
   * Whether it has an order to play straight through: an album's tracks do; an
   * artist's songs don't (ProTag doesn't know release years), so an artist
   * only shuffles, by song or album, and its buttons say so.
   */
  inOrder?: boolean;
}

/**
 * An album's or an artist's page: their picture and name, Play (in order) and
 * Shuffle (for an artist, which has no order: Shuffle and Shuffle albums),
 * then labelled sections, ending with the songs.
 *
 * "Song tags", first after the buttons, shows each tag used here and how many
 * songs have it: a summary of the album or artist seen through ProTag's eyes
 * (a tag opens its own page). Its label says where they come from: in ProTag
 * only songs carry tags, never the album or artist itself. It ends with a button that
 * tags every song at once: for someone who thinks in albums, tagging one song
 * at a time would be the friction that sends them away.
 */
export function SongCollection({
  picture,
  title,
  subtitle,
  meta,
  songs,
  tags,
  label,
  tagPrompt,
  children,
  inOrder = true,
}: SongCollectionProps) {
  const screen = useWindowDimensions();
  const { playQueue } = usePlayerActions();
  const backToPlayer = useBackToPlayer();
  const { song: current } = useNowPlaying();
  const { getItemLayout, onHeaderLayout } = useFixedRowLayout(SONG_ROW_HEIGHT);
  const ids = useMemo(() => songs.map((s) => s.id), [songs]);
  // Press and hold a song to start selecting; then Tag… tags them.
  const selection = useSongSelection(ids);
  const { selecting, selected, toggle } = selection;
  const size = Math.min(MAX_PICTURE, screen.width * 0.55);

  /** The tags on these songs, the most widely used first. */
  const makeup = useMemo(() => {
    const byTag = new Map<number, { tag: TagRow; count: number }>();
    for (const song of songs) {
      for (const tag of tags.get(song.id) ?? NO_TAGS) {
        const entry = byTag.get(tag.id);
        if (entry) entry.count++;
        else byTag.set(tag.id, { tag, count: 1 });
      }
    }
    return [...byTag.values()].sort((a, b) => b.count - a.count || a.tag.name.localeCompare(b.tag.name));
  }, [songs, tags]);

  const play = useCallback(
    (startId?: number, shuffle = !inOrder, byAlbum?: boolean) =>
      playQueue(ids, { startId, shuffle, byAlbum, label, modes: inOrder ? undefined : ARTIST_MODES }),
    [ids, label, playQueue, inOrder]
  );

  return (
    <>
      <Stack.Screen options={selecting ? selection.header : { title: '', ...backToPlayer }} />
      <FlatList
        style={styles.screen}
        data={songs}
        keyExtractor={(song) => String(song.id)}
        getItemLayout={getItemLayout}
        extraData={selection.selection}
        contentContainerStyle={selecting ? { paddingBottom: SELECTION_BAR_HEIGHT } : undefined}
        renderItem={({ item }) => (
          <SongRow
            id={item.id}
            title={item.title}
            artist={item.artist}
            artworkUri={albumArtUri(item.album_id)}
            tags={tags.get(item.id) ?? NO_TAGS}
            active={current?.id === item.id}
            selecting={selecting}
            selected={selection.selection?.has(item.id) ?? false}
            // In order from it (an album), or shuffled by song starting with it (an artist).
            onPress={selecting ? toggle : (id) => play(id, !inOrder, false)}
            onLongPress={toggle}
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
                {inOrder ? (
                  <Button label="Play" icon="play" onPress={() => play()} disabled={ids.length === 0} />
                ) : (
                  <Button label="Shuffle" icon="shuffle" onPress={() => play(undefined, true, false)} disabled={ids.length === 0} />
                )}
                {inOrder ? (
                  <Button label="Shuffle" icon="shuffle" variant="secondary" onPress={() => play(undefined, true)} disabled={ids.length === 0} />
                ) : (
                  <Button label="Shuffle albums" icon="disc" variant="secondary" onPress={() => play(undefined, true, true)} disabled={ids.length === 0} />
                )}
              </CardActions>
            </View>
            {ids.length > 0 && (
              <CollectionSection title="Song tags">
                {makeup.length === 0 ? (
                  <View style={styles.prompt}>
                    <NoTags onPress={() => openEditTags(ids)} label={tagPrompt} />
                  </View>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
                    {makeup.map(({ tag, count }) => (
                      <TagChip key={tag.id} name={tag.name} color={tag.color} count={count} onPress={() => openTag(tag.id)} />
                    ))}
                    <TagButton onPress={() => openEditTags(ids)} label={tagPrompt} />
                  </ScrollView>
                )}
              </CollectionSection>
            )}
            {children}
            {ids.length > 0 && <Text style={[styles.sectionTitle, styles.songsTitle]}>Songs</Text>}
          </View>
        }
      />
      {selecting && (
        <SelectionBar disabled={selected.length === 0} actions={[{ label: 'Tag…', icon: 'tags', onPress: selection.editTags }, ...selection.queueActions]} />
      )}
    </>
  );
}

/** A labelled part of an album or artist page ("Song tags", "Albums"), full width. */
export function CollectionSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
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
  section: {
    alignSelf: 'stretch',
    gap: spacing.sm,
  },
  sectionTitle: {
    ...font.label,
    color: colors.textDim,
    paddingHorizontal: spacing.lg,
  },
  // The song list follows straight on, so its heading lines up with the others.
  songsTitle: {
    alignSelf: 'stretch',
    marginBottom: -spacing.sm,
  },
  prompt: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
  },
  strip: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
});
