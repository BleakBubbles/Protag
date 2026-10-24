import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
} from 'react-native';

import { listAlbums, listArtists, type AlbumSummary, type ArtistSummary } from '@/db/albums';
import { notifyLibraryChanged } from '@/db/changes';
import { listMixes, parseDraft, saveMixAs, type Mix } from '@/db/mixes';
import { countSongs } from '@/db/songs';
import { getSetting, setSetting, SettingKey } from '@/db/settings';
import { buildDescendantMap, listAllTagsWithCounts, listTagPlays } from '@/db/tags';
import type { TagWithCounts } from '@/db/types';
import { openLibrary } from '@/navigation';
import { distinctAlbums, loadMixArt } from '@/library/mixArt';
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
import { albumRef, artistRef, isTagRef, readRef, type Ref } from '@/query/refs';
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
import { plural } from '@/ui/format';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { MusicPicker } from '@/ui/play/MusicPicker';
import { PictureTile, SeeAllTile } from '@/ui/play/PictureTile';
import { ingredientKey, Pot, POT_ROW, trayHeight, type Look, type ShuffleCount } from '@/ui/play/Pot';
import { DragGhost, PotDragContext, usePotDragRoot } from '@/ui/play/PotDrag';
import { Divider, DIVIDER_HEIGHT } from '@/ui/play/Divider';
import { MixShelf } from '@/ui/play/MixShelf';
import { PreviewSheet } from '@/ui/play/PreviewSheet';
import { SearchButton, SearchRow, SectionHead } from '@/ui/play/SectionHead';
import { TagGrid } from '@/ui/play/TagGrid';
import { useMiniPlayerVisibility } from '@/ui/player/MiniPlayerVisibility';
import { PromptDialog } from '@/ui/PromptDialog';
import { colors, font, spacing, tagColor } from '@/ui/theme';

/** Covers in the pot's preview line, and how many of the most-played songs to find them among. */
const COVERS = 5;
const COVER_SAMPLE = 60;
/** How many artists and albums each picture row shows before "All". */
const ROW = 12;
/** Search results are one flat grid: no tag opens to show subtags. */
const NO_CHILDREN = new Map<number | null, TagWithCounts[]>();

/** The pot's rows of tiles: two to start, at least one, and the area below always keeps this much room. */
const POT_ROWS = 2;
const MIN_POT_ROWS = 1;
const MIN_BELOW = 200;

/** How long the tags take to rise over the mixes, like a keyboard, and to go back down. */
const RISE_MS = 260;
/** How far the tags lift when the empty well is tapped while they're up: "they're right here". */
const NUDGE = 12;

/**
 * Play tab, where the app opens: the pot at the top, never moving, and below
 * it your saved mixes (a mix is a saved pot: what you've made before, under
 * what you're making now). Tap the pot's empty well, or the divider, and the
 * area below swaps to your tags, artists and albums, which go into the pot by
 * tap or by drag, with a live count; the divider, Back or Shuffle swap back.
 * The divider also sets the pot's size, the same in both. "Edit" on a mix
 * loads it into the pot (here, or via the `edit` param, a mix id), and the
 * player's "Edit in Play" loads what's playing (the `draft` param, as JSON).
 */
export default function PlayScreen() {
  const { show } = useMiniPlayerVisibility();
  // Opening Play is one way a hidden mini-player comes back.
  useFocusEffect(useCallback(() => show(), [show]));
  const { edit, draft } = useLocalSearchParams<{ edit?: string; draft?: string }>();
  const openRequest = useMemo<OpenRequest>(
    () => (edit ? { mixId: Number(edit) } : draft ? { draft: parseDraft(draft) } : null),
    [edit, draft]
  );

  const { data } = useLibraryQuery(async (db) => {
    const [songs, allTags, descendants, mixes, artists, albums, tagPlays, sorts, potRows] = await Promise.all([
      countSongs(db),
      listAllTagsWithCounts(db),
      buildDescendantMap(db),
      listMixes(db),
      listArtists(db),
      listAlbums(db),
      listTagPlays(db),
      getSetting(db, SettingKey.shuffleSorts),
      getSetting(db, SettingKey.potRows),
    ]);
    const mixArt = await loadMixArt(db, mixes, new Set(allTags.map((t) => t.id)), descendants);
    // A tag with nothing under it can't be shuffled, so the builder leaves it out.
    return {
      songs,
      tags: allTags.filter((t) => t.song_count > 0),
      descendants,
      mixes,
      mixArt,
      music: { artists, albums },
      tagPlays,
      initialSorts: parseSorts(sorts),
      initialRows: Number(potRows) >= MIN_POT_ROWS ? Number(potRows) : POT_ROWS,
    };
  }, []);

  if (!data) return <View style={styles.screen} />;

  if (data.songs === 0) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <EmptyState large icon="play-circle-outline" title="Nothing to play yet" body="Scan your music from the Library tab, then mix and play it here.">
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
  /** Album ids for each mix's artwork. */
  mixArt: ReadonlyMap<number, readonly string[]>;
  music: Music;
  /** Plays by tag id, for sorting by most played. */
  tagPlays: ReadonlyMap<number, number>;
  /** How each section was last sorted; changes here are kept. */
  initialSorts: ShuffleSorts;
  /** The open pot's rows of tiles, as last set with its divider. */
  initialRows: number;
  openRequest: OpenRequest;
};

function Builder({ tags, descendants, mixes, mixArt, music, tagPlays, initialSorts, initialRows, openRequest }: BuilderProps) {
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

  // Whether the area below the pot shows your tags (building) or your mixes.
  // Both stay built, so each comes back where it was.
  const [browsing, setBrowsing] = useState(false);
  const [room, setRoom] = useState(0);
  /** The area under the divider: how far the tags travel to rise over the mixes. */
  const [below, setBelow] = useState(0);
  const reveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(reveal, {
      toValue: browsing ? 1 : 0,
      duration: RISE_MS,
      easing: browsing ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [browsing, reveal]);
  // Tapping the empty well with the tags already up: they lift and settle, back at the top.
  const nudge = useRef(new Animated.Value(0)).current;
  const tagList = useRef<ScrollViewInstance>(null);
  const pointAtTags = () => {
    tagList.current?.scrollTo({ y: 0, animated: true });
    performAndroidHapticsAsync(AndroidHaptics.Context_Click).catch(() => {});
    Animated.sequence([
      Animated.timing(nudge, { toValue: -NUDGE, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      // Eased back, not sprung: a spring would dip below its place and open a gap above.
      Animated.timing(nudge, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  };

  // The divider under the pot: how many rows of tiles the pot shows, kept
  // between visits and the same in both states. The most it can give the pot
  // leaves the area below `MIN_BELOW` of the screen.
  const [potRows, setPotRows] = useState(initialRows);
  /** The pot's height apart from its tray, which doesn't change with the rows. */
  const [potChrome, setPotChrome] = useState(0);
  const maxPotRows = Math.max(
    MIN_POT_ROWS,
    Math.floor((room - potChrome - DIVIDER_HEIGHT - MIN_BELOW - trayHeight(1) + POT_ROW) / POT_ROW)
  );
  const rows = room > 0 && potChrome > 0 ? Math.min(potRows, maxPotRows) : potRows;
  // The tray's height, which the divider drags directly (no re-render per
  // frame), and settles to `rows`' height; tracked for measuring the pot.
  const tray = useRef(new Animated.Value(trayHeight(rows))).current;
  /** How far the divider has pulled the tag list down past the pot's largest size. */
  const pull = useRef(new Animated.Value(0)).current;
  const trayNow = useRef(trayHeight(rows));
  useEffect(() => {
    const id = tray.addListener(({ value }) => {
      trayNow.current = value;
    });
    return () => tray.removeListener(id);
  }, [tray]);
  useEffect(() => tray.setValue(trayHeight(rows)), [rows, tray]);
  const fold = useCallback(() => {
    Keyboard.dismiss();
    setSearch('');
    setSearching(false);
    setBrowsing(false);
  }, []);
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
  // The mixes below: each described and coloured as in the pot, played under its own name.
  const mixDraft = (mix: Mix) => pruneDraft(mix.draft, tagIds);
  const playMix = (mix: Mix) => playQuery(buildQuery(mixDraft(mix)), { label: mix.name, draft: mixDraft(mix) });
  const editMix = (mix: Mix) => {
    setDraft(mix.draft);
    setEditingId(mix.id);
    setBrowsing(true);
  };
  const describeMix = (mix: Mix) => describeQuery(buildQuery(mixDraft(mix)), names);
  // A mix wears the colour of its first tag (artists and albums have none).
  const mixColor = (mix: Mix) => hues.get(mix.draft.ingredients.flat().find(isTagRef) ?? -1) ?? tagColor(null);
  // An unchanged mix plays under its own name.
  const playLabel = editingMix && sameDraft(current, editingMix.draft) ? editingMix.name : undefined;

  return (
    <PotDragContext.Provider value={drag}>
      <View ref={drag.rootRef} style={styles.screen} onLayout={(e) => setRoom(e.nativeEvent.layout.height)}>
        <View
          onLayout={(e) => {
            // Only the part that never changes is kept, so dragging the tray doesn't re-render.
            const chrome = Math.round(e.nativeEvent.layout.height - trayNow.current);
            setPotChrome((was) => (was === chrome ? was : chrome));
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
            rows={rows}
            tray={tray}
            onOpen={browsing ? undefined : () => setBrowsing(true)}
            onWellPress={pointAtTags}
          />
        </View>

        <Divider
          label={browsing ? 'Mixes' : 'Tags'}
          onTap={browsing ? fold : () => setBrowsing(true)}
          tray={tray}
          rows={rows}
          minRows={MIN_POT_ROWS}
          maxRows={maxPotRows}
          onSettle={(settled) => {
            setPotRows(settled);
            setSetting(db, SettingKey.potRows, String(settled));
          }}
          pull={browsing ? pull : undefined}
          onPullFold={browsing ? fold : undefined}
        />

        {/* Below the divider: your mixes, and over them, while building, your
            tags, risen from the bottom like a keyboard under its text field. */}
        <View style={[styles.screen, styles.clip]} onLayout={(e) => setBelow(e.nativeEvent.layout.height)}>
          <View
            pointerEvents={browsing ? 'none' : 'auto'}
            importantForAccessibility={browsing ? 'no-hide-descendants' : 'auto'}
            style={styles.below}
          >
            <MixShelf
              mixes={mixes}
              art={mixArt}
              describe={describeMix}
              colorOf={mixColor}
              onPlay={playMix}
              onEdit={editMix}
              scrollEnabled={still}
            />
          </View>

          <Animated.View
            pointerEvents={browsing ? 'auto' : 'none'}
            importantForAccessibility={browsing ? 'auto' : 'no-hide-descendants'}
            style={[
              styles.below,
              styles.keyboard,
              {
                // Fully hidden while down, not just out of sight: dragging the divider grows this
                // area at once, and the tags' resting place a moment later.
                opacity: reveal.interpolate({ inputRange: [0, 0.001, 1], outputRange: [0, 1, 1] }),
                transform: [
                  {
                    translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [Math.max(below, room, 1), 0] }),
                  },
                  // Pulled down past the pot's largest size, to fold; lifted by a nudge.
                  { translateY: pull },
                  { translateY: nudge },
                ],
              },
            ]}
          >
            <ScrollView
              ref={tagList}
              style={styles.screen}
              contentContainerStyle={styles.content}
              scrollEnabled={still}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
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
  // The fold handle above stands in for the top padding.
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.xl,
  },
  // The tags wait out of sight below it, so it mustn't let them show past its edge.
  clip: {
    overflow: 'hidden',
  },
  // The mixes and the tags, one over the other.
  below: {
    ...StyleSheet.absoluteFill,
  },
  // The tags cover the mixes as they rise, on the page's own colour; reaching
  // past both edges (clipped), so moving a little never shows the mixes beneath.
  keyboard: {
    top: -NUDGE,
    bottom: -NUDGE * 2,
    paddingTop: NUDGE,
    paddingBottom: NUDGE * 2,
    backgroundColor: colors.bg,
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
