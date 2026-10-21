import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { listAlbums, listArtists, listTopAlbums, listTopArtists, type AlbumSummary, type ArtistSummary } from '@/db/albums';
import { notifyLibraryChanged } from '@/db/changes';
import { listMixes, parseDraft, saveMixAs, type Mix } from '@/db/mixes';
import { countSongs } from '@/db/songs';
import { buildDescendantMap, listAllTagsWithCounts } from '@/db/tags';
import type { TagWithCounts } from '@/db/types';
import { openLibrary } from '@/navigation';
import { distinctAlbums } from '@/library/mixArt';
import { usePlayerActions, usePlayQuery } from '@/player/PlayerProvider';
import { queueForQuery } from '@/player/sources';
import { describeQuery } from '@/query/describe';
import { dropInPot, tapExcluded, tapIngredient, tapTag, type PotItem, type PotSpot } from '@/query/pot';
import { albumRef, artistRef, readRef, type Ref } from '@/query/refs';
import { countMatching, findSongs } from '@/query/run';
import {
  buildQuery,
  EMPTY_DRAFT,
  isEmptyDraft,
  pruneDraft,
  sameDraft,
  tagChoice,
  type QueryDraft,
} from '@/query/types';
import { Button } from '@/ui/Button';
import { plural } from '@/ui/format';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { MusicPicker } from '@/ui/play/MusicPicker';
import { PictureTile, SeeAllTile } from '@/ui/play/PictureTile';
import { ingredientKey, Pot, type Look, type ShuffleCount } from '@/ui/play/Pot';
import { DragGhost, PotDragContext, usePotDragRoot } from '@/ui/play/PotDrag';
import { PreviewSheet } from '@/ui/play/PreviewSheet';
import { TagGrid } from '@/ui/play/TagGrid';
import { useMiniPlayerVisibility } from '@/ui/player/MiniPlayerVisibility';
import { PromptDialog } from '@/ui/PromptDialog';
import { colors, font, spacing, tagColor } from '@/ui/theme';

/** Covers in the pot's preview line, and how many of the most-played songs to find them among. */
const COVERS = 5;
const COVER_SAMPLE = 60;
/** How many artists and albums each picture row shows before "All". */
const ROW = 12;

/**
 * Shuffle tab: build something to shuffle. The pot sits on top like a text field
 * over its keyboard; the tag tiles below go into it by tap or by drag, with a
 * live count. Saved mixes live in their own tab; "Edit" there opens one here
 * (the `edit` param, a mix id), and the player's "Edit in Shuffle" opens what's
 * playing (the `draft` param, as JSON).
 */
export default function ShuffleScreen() {
  const { show } = useMiniPlayerVisibility();
  // Opening Shuffle is one way a hidden mini-player comes back.
  useFocusEffect(useCallback(() => show(), [show]));
  const { edit, draft } = useLocalSearchParams<{ edit?: string; draft?: string }>();
  const openRequest = useMemo<OpenRequest>(
    () => (edit ? { mixId: Number(edit) } : draft ? { draft: parseDraft(draft) } : null),
    [edit, draft]
  );

  const { data } = useLibraryQuery(async (db) => {
    const [songs, tags, descendants, mixes, artists, albums, topArtists, topAlbums] = await Promise.all([
      countSongs(db),
      listAllTagsWithCounts(db),
      buildDescendantMap(db),
      listMixes(db),
      listArtists(db),
      listAlbums(db),
      listTopArtists(db, ROW),
      listTopAlbums(db, ROW),
    ]);
    // A tag with nothing under it can't be shuffled, so the builder leaves it out.
    return {
      songs,
      tags: tags.filter((t) => t.song_count > 0),
      descendants,
      mixes,
      music: { artists, albums, topArtists, topAlbums },
    };
  }, []);

  if (!data) return <View style={styles.screen} />;

  if (data.songs === 0) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Ionicons name="musical-notes-outline" size={64} color={colors.textFaint} />
        <Text style={styles.title}>No music yet</Text>
        <Text style={styles.body}>Scan your music from the Library tab to get started.</Text>
        <Button label="Go to Library" onPress={openLibrary} />
      </View>
    );
  }

  return <Builder {...data} openRequest={openRequest} />;
}

/** Something to load into the pot, asked for by another screen. */
type OpenRequest = { mixId: number } | { draft: QueryDraft } | null;

/** Artists and albums, as ingredients: everyone (for names and the pickers), and the most played (for the rows). */
type Music = {
  artists: ArtistSummary[];
  albums: AlbumSummary[];
  topArtists: ArtistSummary[];
  topAlbums: AlbumSummary[];
};

type BuilderProps = {
  tags: TagWithCounts[];
  descendants: Map<number, number[]>;
  mixes: Mix[];
  music: Music;
  openRequest: OpenRequest;
};

function Builder({ tags, descendants, mixes, music, openRequest }: BuilderProps) {
  const db = useSQLiteContext();
  const { width: screenWidth } = useWindowDimensions();
  const playQuery = usePlayQuery();
  const [draft, setDraft] = useState<QueryDraft>(EMPTY_DRAFT);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());
  /** The mix opened for editing, by id, so a rename elsewhere doesn't lose it. */
  const [editingId, setEditingId] = useState<number | null>(null);
  const editingMix = mixes.find((m) => m.id === editingId) ?? null;
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const { playQueue } = usePlayerActions();

  const [picking, setPicking] = useState<'artists' | 'albums' | null>(null);

  // Everything an ingredient can be, by ref: its name, a tag's colour, an artist's or album's picture.
  const tagIds = useMemo(() => new Set(tags.map((t) => t.id)), [tags]);
  const names = useMemo(() => {
    const map = new Map<Ref, string>(tags.map((t) => [t.id, t.name]));
    for (const a of music.artists) map.set(artistRef(a.name), a.name);
    for (const a of music.albums) map.set(albumRef(a.albumId), a.title);
    return map;
  }, [tags, music]);
  const hues = useMemo(() => new Map<Ref, string>(tags.map((t) => [t.id, tagColor(t.color)])), [tags]);
  const pictures = useMemo(() => {
    const map = new Map<Ref, string | null>();
    for (const a of music.artists) map.set(artistRef(a.name), a.coverAlbumId);
    for (const a of music.albums) map.set(albumRef(a.albumId), a.albumId);
    return map;
  }, [music]);
  const look = useCallback(
    (ref: Ref): Look => {
      const read = readRef(ref);
      return {
        // An artist is its own name; an album whose songs have all gone falls back to a word.
        name: names.get(ref) ?? (read.kind === 'artist' ? read.name : read.kind === 'album' ? 'Album' : ''),
        hue: hues.get(ref) ?? null,
        cover: pictures.get(ref) ?? null,
        round: read.kind === 'artist',
      };
    },
    [names, hues, pictures]
  );
  const children = useMemo(() => {
    const map = new Map<number | null, TagWithCounts[]>();
    for (const tag of tags) map.set(tag.parent_id, [...(map.get(tag.parent_id) ?? []), tag]);
    return map;
  }, [tags]);

  // Opening a mix, or what's playing: load it, then drop the request so it
  // isn't loaded again over later changes. What's playing may be a saved mix
  // already, and then saving updates that mix.
  useEffect(() => {
    if (openRequest === null) return;
    const mix =
      'mixId' in openRequest
        ? mixes.find((m) => m.id === openRequest.mixId)
        : mixes.find((m) => sameDraft(m.draft, openRequest.draft));
    setDraft('draft' in openRequest ? openRequest.draft : (mix?.draft ?? EMPTY_DRAFT));
    setEditingId(mix?.id ?? null);
    router.setParams({ edit: undefined, draft: undefined });
  }, [openRequest, mixes]);

  // Tags can be deleted (or emptied) while chosen here; quietly drop them.
  const current = useMemo(() => pruneDraft(draft, tagIds), [draft, tagIds]);
  const query = useMemo(() => buildQuery(current), [current]);

  // The Shuffle label changes once per tap, when the new count is in, rather
  // than first showing the new pot with the old number.
  const [counted, setCounted] = useState<ShuffleCount | null>(null);
  const [covers, setCovers] = useState<readonly string[]>([]);
  const [ingredientCounts, setIngredientCounts] = useState<ReadonlyMap<string, number>>(new Map());
  useEffect(() => {
    let live = true;
    const empty = isEmptyDraft(current);
    // The covers arrive with the count, so the preview line changes once too:
    // the most-played albums first, like a mix card's artwork.
    Promise.all([
      countMatching(db, query, descendants),
      empty ? [] : findSongs(db, query, { order: 'played', limit: COVER_SAMPLE, descendants }),
    ]).then(([count, sample]) => {
      if (!live) return;
      setCounted({ empty, count });
      setCovers(distinctAlbums(sample, COVERS));
    });
    // Each ingredient on its own (exclusions aside), so combining visibly narrows.
    // Keyed by its tags, so a count never shows on the wrong chip while they move.
    Promise.all(
      current.ingredients.map(
        async (tags) =>
          [
            ingredientKey(tags),
            await countMatching(db, buildQuery({ ...current, ingredients: [tags], exclude: [] }), descendants),
          ] as const
      )
    ).then((entries) => live && setIngredientCounts(new Map(entries)));
    return () => {
      live = false;
    };
  }, [db, query, current, descendants]);

  // An emptied pot is no longer the mix that was opened.
  const potEmpty = isEmptyDraft(current);
  useEffect(() => {
    if (potEmpty) setEditingId(null);
  }, [potEmpty]);

  const toggleExpanded = useCallback(
    (id: number) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    []
  );
  const choiceOf = useCallback((ref: Ref) => tagChoice(current, ref), [current]);
  // Pot changes apply to the pruned draft: it's what's on screen, so its indices are the ones tapped.
  const tap = useCallback((ref: Ref) => setDraft(tapTag(current, ref)), [current]);
  const drag = usePotDragRoot((item: PotItem, spot: PotSpot) => setDraft(dropInPot(current, item, spot)));
  const still = drag.active === null;
  // An unchanged mix plays under its own name.
  const playLabel = editingMix && sameDraft(current, editingMix.draft) ? editingMix.name : undefined;

  return (
    <PotDragContext.Provider value={drag}>
      <View ref={drag.rootRef} style={styles.screen}>
        <Pot
          draft={current}
          look={look}
          ingredientCounts={ingredientCounts}
          counted={counted}
          covers={covers}
          onPreview={() => setPreviewing(true)}
          editing={editingMix?.name ?? null}
          onSave={() => setSaving(true)}
          onShuffle={() => playQuery(query, { draft: current, label: playLabel })}
          onClear={() => setDraft(EMPTY_DRAFT)}
          onTapIngredient={(index) => setDraft(tapIngredient(current, index))}
          onTapExcluded={(ref) => setDraft(tapExcluded(current, ref))}
        />

        <ScrollView style={styles.screen} contentContainerStyle={styles.content} scrollEnabled={still}>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Your tags</Text>
            {tags.length === 0 ? (
              <Text style={styles.hint}>Tag some songs in the Library to mix them here.</Text>
            ) : (
              <TagGrid
                tags={children.get(null) ?? []}
                childrenOf={children}
                expanded={expanded}
                choiceOf={choiceOf}
                onTap={tap}
                onToggleExpanded={toggleExpanded}
                width={screenWidth - spacing.lg * 2}
              />
            )}
          </View>

          {/* Artists and albums: ingredients too, after the tags, as pictures. */}
          {music.topArtists.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Artists</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={still} style={styles.bleed} contentContainerStyle={styles.pictureRow}>
                {music.topArtists.map((a) => {
                  const ref = artistRef(a.name);
                  return (
                    <PictureTile key={ref} refId={ref} name={a.name} cover={a.coverAlbumId} round choice={choiceOf(ref)} onPress={() => tap(ref)} />
                  );
                })}
                <SeeAllTile label="All artists" round onPress={() => setPicking('artists')} />
              </ScrollView>
            </View>
          )}
          {music.topAlbums.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Albums</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={still} style={styles.bleed} contentContainerStyle={styles.pictureRow}>
                {music.topAlbums.map((a) => {
                  const ref = albumRef(a.albumId);
                  return (
                    <PictureTile key={ref} refId={ref} name={a.title} cover={a.albumId} round={false} choice={choiceOf(ref)} onPress={() => tap(ref)} />
                  );
                })}
                <SeeAllTile label="All albums" round={false} onPress={() => setPicking('albums')} />
              </ScrollView>
            </View>
          )}
        </ScrollView>

        <MusicPicker
          visible={picking !== null}
          title={picking === 'albums' ? 'Albums' : 'Artists'}
          items={
            picking === 'albums'
              ? music.albums.map((a) => ({ ref: albumRef(a.albumId), name: a.title, detail: a.artist ?? plural(a.songs, 'song'), cover: a.albumId, round: false }))
              : music.artists.map((a) => ({ ref: artistRef(a.name), name: a.name, detail: plural(a.songs, 'song'), cover: a.coverAlbumId, round: true }))
          }
          choiceOf={choiceOf}
          onTap={tap}
          onClose={() => setPicking(null)}
        />

        <PromptDialog
          visible={saving}
          title={editingMix ? 'Save mix' : 'New mix'}
          message={describeQuery(query, names)}
          initialValue={editingMix?.name ?? ''}
          placeholder="Night drive"
          confirmLabel="Save"
          onSubmit={async (name) => {
            setEditingId(await saveMixAs(db, name, current, editingMix?.id ?? null));
            notifyLibraryChanged();
          }}
          onClose={() => setSaving(false)}
        />
        <PreviewSheet
          visible={previewing}
          draft={current}
          description={describeQuery(query, names)}
          names={names}
          onClose={() => setPreviewing(false)}
          onPlay={async (songId) => {
            const request = await queueForQuery(db, query);
            playQueue(request.ids, { startId: songId, shuffle: true, label: playLabel ?? request.label, draft: current });
          }}
        />
        <DragGhost />
      </View>
    </PotDragContext.Provider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.xl,
  },
  // A picture row runs to the screen's edges, starting in line with the grid.
  bleed: {
    marginHorizontal: -spacing.lg,
  },
  // Room above and beside the pictures for their rings, which a scroll view would clip.
  pictureRow: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  section: {
    gap: spacing.md,
  },
  title: {
    ...font.title,
    color: colors.text,
  },
  body: {
    ...font.body,
    color: colors.textDim,
    textAlign: 'center',
  },
  sectionLabel: {
    ...font.caption,
    color: colors.textFaint,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  hint: {
    ...font.caption,
    color: colors.textFaint,
  },
});
