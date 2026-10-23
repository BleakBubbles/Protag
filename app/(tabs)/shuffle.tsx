import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { listAlbums, listArtists, type AlbumSummary, type ArtistSummary } from '@/db/albums';
import { notifyLibraryChanged } from '@/db/changes';
import { listMixes, parseDraft, saveMixAs, type Mix } from '@/db/mixes';
import { countSongs } from '@/db/songs';
import { getSetting, setSetting, SettingKey } from '@/db/settings';
import { buildDescendantMap, listAllTagsWithCounts, listTagPlays } from '@/db/tags';
import type { TagWithCounts } from '@/db/types';
import { openLibrary } from '@/navigation';
import { distinctAlbums } from '@/library/mixArt';
import { matchesQuery, searchKey } from '@/library/search';
import {
  nextMusicSort,
  nextTagSort,
  parseSorts,
  sortMusic,
  SORT_LABEL,
  sortTags,
  type ShuffleSorts,
} from '@/library/sorts';
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
import { EmptyState } from '@/ui/EmptyState';
import { Icon } from '@/ui/Icon';
import { plural } from '@/ui/format';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { MusicPicker } from '@/ui/play/MusicPicker';
import { PictureTile, SeeAllTile } from '@/ui/play/PictureTile';
import { ingredientKey, Pot, type Look, type ShuffleCount } from '@/ui/play/Pot';
import { DragGhost, PotDragContext, usePotDragRoot } from '@/ui/play/PotDrag';
import { PotCover } from '@/ui/play/PotCover';
import { PreviewSheet } from '@/ui/play/PreviewSheet';
import { SearchButton, SearchRow, SectionHead } from '@/ui/play/SectionHead';
import { TagGrid } from '@/ui/play/TagGrid';
import { useMiniPlayerVisibility } from '@/ui/player/MiniPlayerVisibility';
import { PromptDialog } from '@/ui/PromptDialog';
import { colors, font, iconSize, spacing, tagColor, touchTarget } from '@/ui/theme';

/** Covers in the pot's preview line, and how many of the most-played songs to find them among. */
const COVERS = 5;
const COVER_SAMPLE = 60;
/** How many artists and albums each picture row shows before "All". */
const ROW = 12;
/** Search results are one flat grid: no tag opens to show subtags. */
const NO_CHILDREN = new Map<number | null, TagWithCounts[]>();

/** How far the browser rises as it opens. */
const RISE = 48;
/** How far the tag list has to be pulled down, from its top, to fold the browser. */
const PULL = 72;

/**
 * Shuffle tab: build something to shuffle. The pot sits on top like a text field
 * over its keyboard; below it, the browser of tags, artists and albums slides up
 * when asked for (tap the pot, or Add), and they go into the pot by tap or by
 * drag, with a live count. Saved mixes live in their own tab; "Edit" there opens one here
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
    const [songs, tags, descendants, mixes, artists, albums, tagPlays, sorts] = await Promise.all([
      countSongs(db),
      listAllTagsWithCounts(db),
      buildDescendantMap(db),
      listMixes(db),
      listArtists(db),
      listAlbums(db),
      listTagPlays(db),
      getSetting(db, SettingKey.shuffleSorts),
    ]);
    // A tag with nothing under it can't be shuffled, so the builder leaves it out.
    return {
      songs,
      tags: tags.filter((t) => t.song_count > 0),
      descendants,
      mixes,
      music: { artists, albums },
      tagPlays,
      initialSorts: parseSorts(sorts),
    };
  }, []);

  if (!data) return <View style={styles.screen} />;

  if (data.songs === 0) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <EmptyState large icon="shuffle" title="Nothing to shuffle yet" body="Scan your music from the Library tab, then pick tags here to shuffle.">
          <Button label="Go to Library" variant="tonal" onPress={openLibrary} />
        </EmptyState>
      </View>
    );
  }

  return <Builder {...data} openRequest={openRequest} />;
}

/** Something to load into the pot, asked for by another screen. */
type OpenRequest = { mixId: number } | { draft: QueryDraft } | null;

/** Artists and albums, as ingredients. */
type Music = {
  artists: ArtistSummary[];
  albums: AlbumSummary[];
};

type BuilderProps = {
  tags: TagWithCounts[];
  descendants: Map<number, number[]>;
  mixes: Mix[];
  music: Music;
  /** Plays by tag id, for sorting by most played. */
  tagPlays: ReadonlyMap<number, number>;
  /** How each section was last sorted; changes here are kept. */
  initialSorts: ShuffleSorts;
  openRequest: OpenRequest;
};

function Builder({ tags, descendants, mixes, music, tagPlays, initialSorts, openRequest }: BuilderProps) {
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

  // The browser stays built while folded away, so it reopens where it was.
  const [browsing, setBrowsing] = useState(false);
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(reveal, {
      toValue: browsing ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [browsing, reveal]);
  const fold = useCallback(() => {
    Keyboard.dismiss();
    setSearch('');
    setSearching(false);
    setBrowsing(false);
  }, []);
  // Pulling the list down from its top folds the browser too, like pushing a
  // drawer shut. Only a clearly downward pull, and never mid-drag of a tile.
  const listTop = useRef(0);
  const pullFrom = useRef<{ x: number; y: number } | null>(null);
  const pullToFold = {
    onScroll: (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      listTop.current = e.nativeEvent.contentOffset.y;
    },
    scrollEventThrottle: 32,
    onTouchStart: (e: { nativeEvent: { pageX: number; pageY: number } }) => {
      pullFrom.current = listTop.current <= 0 ? { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY } : null;
    },
    onTouchMove: (e: { nativeEvent: { pageX: number; pageY: number } }) => {
      const from = pullFrom.current;
      if (!from || drag.active !== null) return;
      const dy = e.nativeEvent.pageY - from.y;
      const dx = Math.abs(e.nativeEvent.pageX - from.x);
      if (dy < 0 || dx > dy) pullFrom.current = null; // Scrolling, or sideways: not a pull.
      else if (dy > PULL) {
        pullFrom.current = null;
        fold();
      }
    },
  };
  // Back folds the browser before it leaves the tab.
  useFocusEffect(
    useCallback(() => {
      if (!browsing) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        fold();
        return true;
      });
      return () => sub.remove();
    }, [browsing, fold])
  );

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
  const [sorts, setSorts] = useState(initialSorts);
  const changeSorts = (next: ShuffleSorts) => {
    setSorts(next);
    setSetting(db, SettingKey.shuffleSorts, JSON.stringify(next));
  };
  const children = useMemo(() => {
    const map = new Map<number | null, TagWithCounts[]>();
    for (const tag of sortTags(tags, sorts.tags, tagPlays)) map.set(tag.parent_id, [...(map.get(tag.parent_id) ?? []), tag]);
    return map;
  }, [tags, sorts.tags, tagPlays]);

  // Search: one field for every section. While it has text, tags show as one
  // flat grid from every level, and the picture rows draw on everyone, not
  // just the first few; a section with nothing to show hides.
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const term = search.trim();
  const closeSearch = () => {
    setSearch('');
    setSearching(false);
  };
  const found = useMemo(() => {
    if (!term) return null;
    const hit = (...fields: (string | null)[]) => matchesQuery(searchKey(fields), term);
    return {
      tags: sortTags(tags.filter((t) => hit(t.name)), sorts.tags, tagPlays),
      artists: music.artists.filter((a) => hit(a.name)),
      albums: music.albums.filter((a) => hit(a.title, a.artist)),
    };
  }, [term, tags, music, sorts.tags, tagPlays]);
  const parentName = useCallback(
    (tag: TagWithCounts) => (tag.parent_id === null ? undefined : names.get(tag.parent_id)),
    [names]
  );
  const artists = found?.artists ?? music.artists;
  const albums = found?.albums ?? music.albums;
  const artistRow = useMemo(() => sortMusic(artists, sorts.artists, (a) => a.name).slice(0, ROW), [artists, sorts.artists]);
  const albumRow = useMemo(() => sortMusic(albums, sorts.albums, (a) => a.title).slice(0, ROW), [albums, sorts.albums]);
  const nothingFound = found !== null && found.tags.length + found.artists.length + found.albums.length === 0;

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
    // Opened to be changed, so what to change it with comes up too.
    setBrowsing(true);
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
  // The cover's dots: each tag in the mix once, in its colour (artists and albums have none).
  const coverHues = useMemo(
    () => [...new Set(current.ingredients.flat().flatMap((ref) => hues.get(ref) ?? []))],
    [current, hues]
  );
  // An unchanged mix plays under its own name.
  const playLabel = editingMix && sameDraft(current, editingMix.draft) ? editingMix.name : undefined;

  return (
    <PotDragContext.Provider value={drag}>
      <View ref={drag.rootRef} style={styles.screen}>
        {/* Open: the pot to build in, at the top, settling into place as the
            cover above lifts away into it. */}
        <Animated.View
          pointerEvents={browsing ? 'auto' : 'none'}
          importantForAccessibility={browsing ? 'auto' : 'no-hide-descendants'}
          style={{
            opacity: reveal,
            transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] }) }],
          }}
        >
          <Pot
            draft={current}
            look={look}
            ingredientCounts={ingredientCounts}
            counted={counted}
            covers={covers}
            onPreview={() => setPreviewing(true)}
            editing={editingMix?.name ?? null}
            onSave={() => setSaving(true)}
            onShuffle={() => {
              playQuery(query, { draft: current, label: playLabel });
              fold();
            }}
            onClear={() => setDraft(EMPTY_DRAFT)}
            onTapIngredient={(index) => setDraft(tapIngredient(current, index))}
            onTapExcluded={(ref) => setDraft(tapExcluded(current, ref))}
          />
        </Animated.View>

        <View style={styles.screen}>

          <Animated.View
            pointerEvents={browsing ? 'auto' : 'none'}
            importantForAccessibility={browsing ? 'auto' : 'no-hide-descendants'}
            style={[
              styles.browser,
              {
                opacity: reveal,
                transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] }) }],
              },
            ]}
          >
            {/* The whole bar folds it: nothing small to aim for. */}
            <Pressable
              onPress={fold}
              accessibilityRole="button"
              style={({ pressed }) => [styles.doneBar, pressed && styles.doneBarPressed]}
            >
              <Icon name="chevron-down" size={iconSize.sm} color={colors.textDim} />
              <Text style={styles.doneText}>Done adding</Text>
            </Pressable>
            <ScrollView
              style={styles.screen}
              contentContainerStyle={styles.content}
              scrollEnabled={still}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              {...pullToFold}
            >
              <View style={styles.section}>
                {searching ? (
                  <SearchRow value={search} onChangeText={setSearch} onClose={closeSearch} />
                ) : (
                  <SectionHead
                    tall
                    label="Your tags"
                    sort={SORT_LABEL[sorts.tags]}
                    onSort={() => changeSorts({ ...sorts, tags: nextTagSort(sorts.tags) })}
                  >
                    <SearchButton onPress={() => setSearching(true)} />
                  </SectionHead>
                )}
                {found ? (
                  found.tags.length > 0 ? (
                    <TagGrid
                      tags={found.tags}
                      childrenOf={NO_CHILDREN}
                      expanded={expanded}
                      choiceOf={choiceOf}
                      onTap={tap}
                      onToggleExpanded={toggleExpanded}
                      width={screenWidth - spacing.lg * 2}
                      parentOf={parentName}
                    />
                  ) : (
                    <Text style={styles.hint}>{nothingFound ? `Nothing matches “${term}”.` : 'No tags match.'}</Text>
                  )
                ) : tags.length === 0 ? (
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
              {artistRow.length > 0 && (
                <View style={styles.section}>
                  <SectionHead
                    label="Artists"
                    sort={SORT_LABEL[sorts.artists]}
                    onSort={() => changeSorts({ ...sorts, artists: nextMusicSort(sorts.artists) })}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={still} keyboardShouldPersistTaps="handled" style={styles.bleed} contentContainerStyle={styles.pictureRow}>
                    {artistRow.map((a) => {
                      const ref = artistRef(a.name);
                      return (
                        <PictureTile key={ref} refId={ref} name={a.name} cover={a.coverAlbumId} round choice={choiceOf(ref)} onPress={() => tap(ref)} />
                      );
                    })}
                    {artists.length > ROW && <SeeAllTile label="All artists" round onPress={() => setPicking('artists')} />}
                  </ScrollView>
                </View>
              )}
              {albumRow.length > 0 && (
                <View style={styles.section}>
                  <SectionHead
                    label="Albums"
                    sort={SORT_LABEL[sorts.albums]}
                    onSort={() => changeSorts({ ...sorts, albums: nextMusicSort(sorts.albums) })}
                  />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={still} keyboardShouldPersistTaps="handled" style={styles.bleed} contentContainerStyle={styles.pictureRow}>
                    {albumRow.map((a) => {
                      const ref = albumRef(a.albumId);
                      return (
                        <PictureTile key={ref} refId={ref} name={a.title} cover={a.albumId} round={false} choice={choiceOf(ref)} onPress={() => tap(ref)} />
                      );
                    })}
                    {albums.length > ROW && <SeeAllTile label="All albums" round={false} onPress={() => setPicking('albums')} />}
                  </ScrollView>
                </View>
              )}
            </ScrollView>
          </Animated.View>
        </View>

        {/* Folded: the mix as a cover in the middle of the screen. Opening, it
            rises and fades into the pot; folding plays that back. */}
        <Animated.View
          pointerEvents={browsing ? 'none' : 'box-none'}
          importantForAccessibility={browsing ? 'no-hide-descendants' : 'auto'}
          style={[
            styles.coverSlot,
            {
              opacity: reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
              transform: [
                { translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [0, -RISE * 2] }) },
                { scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }) },
              ],
            },
          ]}
        >
          <PotCover
            empty={potEmpty}
            title={describeQuery(query, names)}
            hues={coverHues}
            covers={covers}
            counted={counted}
            editing={editingMix?.name ?? null}
            onOpen={() => setBrowsing(true)}
            onSave={() => setSaving(true)}
            onShuffle={() => playQuery(query, { draft: current, label: playLabel })}
          />
        </Animated.View>

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
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.xl,
  },
  // Over everything, in the middle of the screen; empty space passes taps through.
  coverSlot: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    zIndex: 1,
  },
  browser: {
    ...StyleSheet.absoluteFill,
  },
  doneBar: {
    height: touchTarget + 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  doneBarPressed: {
    backgroundColor: colors.surface,
  },
  doneText: {
    ...font.label,
    color: colors.textDim,
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
  hint: {
    ...font.caption,
    color: colors.textFaint,
  },
});
