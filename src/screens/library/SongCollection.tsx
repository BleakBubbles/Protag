import { Stack } from 'expo-router';
import { useCallback, useMemo, type ReactNode } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { SongRow as Song, TagRow } from '../../db/types';
import { albumArtUri } from '../../library/assets';
import { openEditTags, openSongTags, openTag } from '../../navigation';
import { useNowPlaying, usePlayerActions } from '../../player/PlayerProvider';
import { Button } from '../../ui/Button';
import { CardActions } from '../../ui/Card';
import { useFixedRowLayout } from '../../ui/hooks/useFixedRowLayout';
import { SONG_ROW_HEIGHT, SongRow } from '../../ui/library/SongRow';
import { Artwork } from '../../ui/player/Artwork';
import { TagChip } from '../../ui/TagChip';
import { Icon } from '../../ui/Icon';
import { colors, font, iconSize, spacing, touchTarget } from '../../ui/theme';

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
  /** Beside the tag button while nothing's tagged: "Tag songs in New Jeans", "Tag songs by NewJeans". */
  tagPrompt: string;
  /** Sections between the tags and the songs, like an artist's albums (use `CollectionSection`). */
  children?: ReactNode;
}

/**
 * An album's or an artist's page: their picture and name, Play (in order) and
 * Shuffle, then labelled sections, ending with the songs.
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
}: SongCollectionProps) {
  const screen = useWindowDimensions();
  const { playQueue } = usePlayerActions();
  const { song: current } = useNowPlaying();
  const { getItemLayout, onHeaderLayout } = useFixedRowLayout(SONG_ROW_HEIGHT);
  const ids = useMemo(() => songs.map((s) => s.id), [songs]);
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
    (startId?: number, shuffle = false) => playQueue(ids, { startId, shuffle, label }),
    [ids, label, playQueue]
  );

  return (
    <>
      <Stack.Screen options={{ title: '' }} />
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
            {ids.length > 0 && (
              <CollectionSection title="Song tags">
                {makeup.length === 0 ? (
                  // Nothing tagged yet: the same button, with words beside it
                  // (not in it, so it stays small); the whole line is the target.
                  <Pressable
                    onPress={() => openEditTags(ids)}
                    accessibilityRole="button"
                    accessibilityLabel={tagPrompt}
                    style={({ pressed }) => [styles.prompt, pressed && styles.tagAllPressed]}
                  >
                    <View style={styles.tagAll}>
                      <Icon name="tag" size={iconSize.sm} color={colors.textDim} />
                    </View>
                    <Text style={styles.promptText} numberOfLines={1}>
                      {tagPrompt}
                    </Text>
                  </Pressable>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
                    {makeup.map(({ tag, count }) => (
                      <TagChip key={tag.id} name={tag.name} color={tag.color} count={count} onPress={() => openTag(tag.id)} />
                    ))}
                    <Pressable
                      onPress={() => openEditTags(ids)}
                      accessibilityRole="button"
                      accessibilityLabel="Tag all these songs"
                      style={({ pressed }) => [styles.tagAll, pressed && styles.tagAllPressed]}
                    >
                      <Icon name="tag" size={iconSize.sm} color={colors.textDim} />
                    </Pressable>
                  </ScrollView>
                )}
              </CollectionSection>
            )}
            {children}
            {ids.length > 0 && <Text style={[styles.sectionTitle, styles.songsTitle]}>Songs</Text>}
          </View>
        }
      />
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
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  promptText: {
    ...font.body,
    flexShrink: 1,
    color: colors.textDim,
  },
  strip: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  tagAll: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
    // Dressed like the tag chips beside it: one of the row, not a call to action.
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tagAllPressed: {
    opacity: 0.6,
  },
});
