import { Stack, useFocusEffect, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AndroidHaptics, performAndroidHapticsAsync } from 'expo-haptics';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import { keepPot, listMixes, parseKeptPot, saveMixAs, type KeptPot, type Mix } from '@/db/mixes';
import { countSongs } from '@/db/songs';
import { getSetting, setSetting, SettingKey } from '@/db/settings';
import { buildDescendantMap, listAllTagsWithCounts, listTagPlays } from '@/db/tags';
import type { TagWithCounts } from '@/db/types';
import { openLibrary, openSettings } from '@/navigation';
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
import { queueForQuery, tunedOrder } from '@/player/sources';
import { describeQuery } from '@/query/describe';
import { dropInPot, tapExcluded, tapIngredient, tapTag, type PotItem, type PotSpot } from '@/query/pot';
import { albumRef, artistRef, isTagRef, readRef, type Ref } from '@/query/refs';
import { countMatching, findSongs } from '@/query/run';
import { isTuned } from '@/query/tuning';
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
import { IconButton } from '@/ui/IconButton';
import { plural } from '@/ui/format';
import { useLibraryQuery } from '@/ui/hooks/useLibraryQuery';
import { MusicPicker } from '@/ui/play/MusicPicker';
import { PictureTile, SeeAllTile } from '@/ui/play/PictureTile';
import { ingredientKey, Pot, POT_ROW, trayHeight, type Look, type ShuffleCount } from '@/ui/play/Pot';
import { DragGhost, PotDragContext, usePotDragRoot } from '@/ui/play/PotDrag';
import { Divider, DIVIDER_HEIGHT } from '@/ui/play/Divider';
import { MixShelf } from '@/ui/play/MixShelf';
import { OwnDetailsWindow, type DetailsHandle } from '@/ui/play/DetailsWindow';
import { SearchButton, SearchRow, SectionHead, Trail } from '@/ui/play/SectionHead';
import { TagGrid } from '@/ui/play/TagGrid';
import { useMiniPlayerVisibility } from '@/ui/player/MiniPlayerVisibility';
import { PromptDialog } from '@/ui/PromptDialog';
import { timing } from '@/ui/motion';
import { font, spacing } from '@/ui/theme';
import { makeStyles, useColors } from '@/ui/ThemeContext';

/** Covers in the pot's preview line, and how many of the most-played songs to find them among. */
const COVERS = 3;
const COVER_SAMPLE = 60;
/** How many artists and albums each picture row shows before "All". */
const ROW = 12;

/** The pot's rows of tiles: two to start, at least one, and the area below always keeps this much room. */
const POT_ROWS = 2;
const MIN_POT_ROWS = 1;
const MIN_BELOW = 200;

/** How long the tags take to rise over the mixes, like a keyboard, and to go back down. */
const RISE_MS = 260;
/** Going down after a flick: quicker, and fastest at the start, carrying the finger's momentum on. */
const FLICK_FALL_MS = 180;
/** How far the tags bob up inside their panel when the empty well is tapped while they're up. */
const NUDGE = 12;
/** Going in to a tag (or back out): its subtags slide in this far from the side they're coming from. */
const SLIDE = 48;
const SLIDE_MS = 200;

/**
 * Play tab, where the app opens: the pot at the top, never moving, and below
 * it your saved mixes (a mix is a saved pot: what you've made before, under
 * what you're making now). Tap the pot's empty well, or the divider, and the
 * area below swaps to your tags, artists and albums, which go into the pot by
 * tap or by drag, with a live count; the divider, Back or Shuffle swap back.
 * The divider also sets the pot's size, the same in both. "Edit" on a mix
 * opens it in the pot as a mode of its own: a teal header names it, with ×
 * to leave (discarding changes, after asking) and ✓ to save; either way the
 * pot gets back what it held before.
 */
export default function PlayScreen() {
  const styles = useStyles();
  const { show } = useMiniPlayerVisibility();
  // Opening Play is one way a hidden mini-player comes back.
  useFocusEffect(useCallback(() => show(), [show]));
  // Light icons over the band in either scheme, while this tab is what's showing.
  const focused = useIsFocused();
  const statusBar = focused && <StatusBar style="light" />;

  const { data } = useLibraryQuery(async (db) => {
    const [songs, allTags, descendants, mixes, artists, albums, tagPlays, sorts, potRows, pot, tagsAt] = await Promise.all([
      countSongs(db),
      listAllTagsWithCounts(db),
      buildDescendantMap(db),
      listMixes(db),
      listArtists(db),
      listAlbums(db),
      listTagPlays(db),
      getSetting(db, SettingKey.shuffleSorts),
      getSetting(db, SettingKey.potRows),
      getSetting(db, SettingKey.pot),
      getSetting(db, SettingKey.tagsAt),
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
      initialPot: parseKeptPot(pot),
      initialAt: tagsAt ? Number(tagsAt) : null,
    };
  }, []);

  if (!data) return <View style={styles.screen}>{statusBar}</View>;

  if (data.songs === 0) {
    return (
      <View style={[styles.screen, styles.centered]}>
        {statusBar}
        <EmptyState large icon="play-circle-outline" title="Nothing to play yet" body="Scan your music from the Library tab, then mix and play it here.">
          <Button label="Go to Library" variant="tonal" onPress={openLibrary} />
        </EmptyState>
      </View>
    );
  }

  return (
    <>
      {statusBar}
      <Builder {...data} />
    </>
  );
}

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
  /** The pot as it was left, last time. */
  initialPot: KeptPot;
  /** The tag the tags were last gone in to. */
  initialAt: number | null;
};

function Builder({
  tags,
  descendants,
  mixes,
  mixArt,
  music,
  tagPlays,
  initialSorts,
  initialRows,
  initialPot,
  initialAt,
}: BuilderProps) {
  const colors = useColors();
  const styles = useStyles();
  const db = useSQLiteContext();
  const { width: screenWidth } = useWindowDimensions();
  const playQuery = usePlayQuery();
  const [draft, setDraft] = useState<QueryDraft>(initialPot.draft);
  /** The mix open for editing, by id, so a rename elsewhere doesn't lose it. */
  const [editingId, setEditingId] = useState<number | null>(initialPot.editing);
  const editingMix = mixes.find((m) => m.id === editingId) ?? null;
  /** What the pot held before the editing began, to put back when it's done. */
  const [before, setBefore] = useState<QueryDraft | null>(initialPot.before);
  const [saving, setSaving] = useState(false);
  /** The mix's Details, which keeps whether it's open to itself (see `OwnDetailsWindow`). */
  const details = useRef<DetailsHandle>(null);
  const { playQueue } = usePlayerActions();

  const [picking, setPicking] = useState<'artists' | 'albums' | null>(null);

  // Whether the area below the pot shows your tags (building) or your mixes.
  // Both stay built, so each comes back where it was.
  const [browsing, setBrowsing] = useState(false);
  const [room, setRoom] = useState(0);
  /** The area under the divider: how far the tags travel to rise over the mixes. */
  const [below, setBelow] = useState(0);
  const reveal = useRef(new Animated.Value(0)).current;
  /** Set by a flick to fold: the next close keeps the finger's speed rather than starting slow. */
  const flung = useRef(false);
  /** Set by a swipe up on the handle: how far the finger already took the tags, to rise on from there. */
  const risenBy = useRef(0);
  useEffect(() => {
    const fast = !browsing && flung.current;
    flung.current = false;
    if (browsing) {
      // From where the finger left them, as the same point on the rise; then no offset left over.
      const travel = Math.max(below - DIVIDER_HEIGHT, 1);
      if (risenBy.current < 0) reveal.setValue(Math.min(1, -risenBy.current / travel));
      risenBy.current = 0;
      pull.setValue(0);
    }
    timing(reveal, {
      toValue: browsing ? 1 : 0,
      duration: fast ? FLICK_FALL_MS : RISE_MS,
      easing: browsing || fast ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      // In JS, so the tags' offset changes in the same frame as their size: on the native
      // driver it can land a frame ahead, flashing them into view as the area resizes.
      useNativeDriver: false,
    }).start();
  }, [browsing, reveal]);
  // Tapping the empty well with the tags already up: they lift and settle, back at the top.
  const nudge = useRef(new Animated.Value(0)).current;
  const tagList = useRef<ScrollViewInstance>(null);
  const pointAtTags = () => {
    tagList.current?.scrollTo({ y: 0, animated: true });
    performAndroidHapticsAsync(AndroidHaptics.Context_Click).catch(() => {});
    Animated.sequence([
      timing(nudge, { toValue: -NUDGE, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      timing(nudge, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
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
  /** How far a swipe on the divider has taken the tags down. */
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

  // Everything an ingredient can be, by ref: its name, a tag's colour, an artist's or album's picture.
  const tagIds = useMemo(() => new Set(tags.map((t) => t.id)), [tags]);
  const names = useMemo(() => {
    const map = new Map<Ref, string>(tags.map((t) => [t.id, t.name]));
    for (const a of music.artists) map.set(artistRef(a.name), a.name);
    for (const a of music.albums) map.set(albumRef(a.albumId), a.title);
    return map;
  }, [tags, music]);
  const hues = useMemo(() => new Map<Ref, string>(tags.map((t) => [t.id, colors.tag(t.color)])), [tags, colors]);
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
  // Changed elsewhere too: arranging tags in the Library switches tags to "Your order".
  useEffect(() => setSorts(initialSorts), [initialSorts]);
  const changeSorts = (next: ShuffleSorts) => {
    setSorts(next);
    setSetting(db, SettingKey.shuffleSorts, JSON.stringify(next));
  };
  const children = useMemo(() => {
    const map = new Map<number | null, TagWithCounts[]>();
    for (const tag of sortTags(tags, sorts.tags, tagPlays)) map.set(tag.parent_id, [...(map.get(tag.parent_id) ?? []), tag]);
    return map;
  }, [tags, sorts.tags, tagPlays]);
  const subtagsOf = useCallback((id: number) => children.get(id)?.length ?? 0, [children]);
  const byId = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

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
  // The tags show one level at a time: the top, or the subtags of the tag
  // gone in to (`at`), kept between visits. A tag that's since gone (deleted,
  // emptied) puts you back at the top.
  const [at, setAt] = useState(initialAt);
  const place = at !== null && byId.has(at) ? at : null;
  const trail = useMemo(() => {
    const path: { id: number; name: string }[] = [];
    let tag = place === null ? undefined : byId.get(place);
    while (tag) {
      path.unshift({ id: tag.id, name: tag.name });
      tag = tag.parent_id === null ? undefined : byId.get(tag.parent_id);
    }
    return path;
  }, [place, byId]);
  // In from the right going deeper, from the left coming back out.
  const slide = useRef(new Animated.Value(0)).current;
  const goTo = useCallback(
    (id: number | null) => {
      // Anywhere but back out to a tag on the trail is further in.
      const deeper = id !== null && !trail.some((crumb) => crumb.id === id);
      setAt(id);
      setSetting(db, SettingKey.tagsAt, id === null ? '' : String(id)).catch(() => {});
      tagList.current?.scrollTo({ y: 0, animated: false });
      slide.setValue(deeper ? 1 : -1);
      timing(slide, { toValue: 0, duration: SLIDE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    },
    [db, trail, slide]
  );
  // Back goes out of a tag a level at a time, then folds the browser before it leaves the tab.
  useFocusEffect(
    useCallback(() => {
      if (!browsing) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (place !== null && !searching) goTo(byId.get(place)?.parent_id ?? null);
        else fold();
        return true;
      });
      return () => sub.remove();
    }, [browsing, fold, place, searching, goTo, byId])
  );
  const artists = found?.artists ?? music.artists;
  const albums = found?.albums ?? music.albums;
  const artistRow = useMemo(() => sortMusic(artists, sorts.artists, (a) => a.name).slice(0, ROW), [artists, sorts.artists]);
  const albumRow = useMemo(() => sortMusic(albums, sorts.albums, (a) => a.title).slice(0, ROW), [albums, sorts.albums]);
  const nothingFound = found !== null && found.tags.length + found.artists.length + found.albums.length === 0;

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

  const potEmpty = isEmptyDraft(current);

  // Kept as it changes, so it's still there after Android closes the app.
  useEffect(() => {
    setSetting(db, SettingKey.pot, keepPot({ draft: current, editing: editingId, before })).catch(() => {});
  }, [db, current, editingId, before]);

  // The pot just emptied with ×, to bring back: until something new goes in (or the app closes).
  const [cleared, setCleared] = useState<QueryDraft | null>(null);
  useEffect(() => {
    if (!potEmpty) setCleared(null);
  }, [potEmpty]);

  const choiceOf = useCallback((ref: Ref) => tagChoice(current, ref), [current]);
  // Pot changes apply to the pruned draft: it's what's on screen, so its indices are the ones tapped.
  const tap = useCallback((ref: Ref) => setDraft(tapTag(current, ref)), [current]);
  const drag = usePotDragRoot((item: PotItem, spot: PotSpot) => setDraft(dropInPot(current, item, spot)));
  const still = drag.active === null;
  // The mixes below: each described and coloured as in the pot, played under its own name.
  const mixDraft = (mix: Mix) => pruneDraft(mix.draft, tagIds);
  const playMix = (mix: Mix) => playQuery(buildQuery(mixDraft(mix)), { label: mix.name, draft: mixDraft(mix) });
  // Editing a mix: the pot's own contents wait aside (only the first time, if
  // one mix is opened over another) and come back when it's done.
  const editMix = (mix: Mix) => {
    if (!editingMix) setBefore(current);
    setDraft(mix.draft);
    setEditingId(mix.id);
    setBrowsing(true);
  };
  const finishEditing = () => {
    setDraft(before ?? EMPTY_DRAFT);
    setBefore(null);
    setEditingId(null);
    setBrowsing(false);
  };
  const changed = editingMix !== null && !sameDraft(current, editingMix.draft);
  const saveEditing = async () => {
    if (!editingMix) return;
    await saveMixAs(db, editingMix.name, current, editingMix.id);
    notifyLibraryChanged();
    finishEditing();
  };
  const leaveEditing = () => {
    if (!editingMix) return;
    if (!changed) return finishEditing();
    Alert.alert(`Discard changes to "${editingMix.name}"?`, 'The mix stays as it was.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: finishEditing },
    ]);
  };
  // A mix deleted while open: there's nothing left to save to, so the editing ends where it is.
  useEffect(() => {
    if (editingId !== null && !editingMix) {
      setEditingId(null);
      setBefore(null);
    }
  }, [editingId, editingMix]);
  // Back leaves the editing the way × does, once the tags are folded away.
  useFocusEffect(
    useCallback(() => {
      if (!editingMix || browsing) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        leaveEditing();
        return true;
      });
      return () => sub.remove();
    }, [editingMix, browsing, changed, before])
  );
  // Editing names the mix in the header (the band's, set by the layout), with its ways out.
  const header = editingMix
    ? {
        title: `Editing ${editingMix.name}`,
        headerLeft: () => <IconButton icon="close" label="Stop editing" color={colors.onPot} onPress={leaveEditing} />,
        headerRight: () => (
          <IconButton
            icon="checkmark"
            label={`Save ${editingMix.name}`}
            color={colors.onPot}
            disabled={!changed || potEmpty}
            onPress={saveEditing}
          />
        ),
      }
    : {
        title: 'Play',
        headerLeft: undefined,
        // The Settings gear, as the layout sets it; while editing, this corner is the mix's ✓.
        headerRight: () => <IconButton icon="cog" label="Settings" color={colors.onPot} onPress={openSettings} />,
      };
  const describeMix = (mix: Mix) => describeQuery(buildQuery(mixDraft(mix)), names);
  // Its ingredients as chips for its menu: names joined like the pot's (×), on the first tag's colour.
  const mixChips = (mix: Mix) =>
    mixDraft(mix).ingredients.map((refs) => ({
      label: refs.map((ref) => look(ref).name).join(' × '),
      color: refs.map((ref) => look(ref).hue).find((hue) => hue !== null) ?? null,
    }));
  // A mix wears the colour of its first tag (artists and albums have none).
  const mixColor = (mix: Mix) => hues.get(mix.draft.ingredients.flat().find(isTagRef) ?? -1) ?? colors.tag(null);
  // A pot that's a saved mix, unchanged, plays under the mix's name.
  const named = mixes.find((m) => sameDraft(m.draft, current)) ?? null;
  const playLabel = named?.name;

  return (
    <PotDragContext.Provider value={drag}>
      <View ref={drag.rootRef} style={styles.screen} onLayout={(e) => setRoom(e.nativeEvent.layout.height)}>
        <Stack.Screen options={header} />
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
            onDetails={(from) => details.current?.open(from)}
            name={editingMix ? null : (named?.name ?? null)}
            editing={editingMix !== null}
            onSave={() => setSaving(true)}
            onShuffle={() => {
              playQuery(query, { draft: current, label: playLabel });
              fold();
            }}
            onClear={() => {
              setCleared(current);
              setDraft(EMPTY_DRAFT);
            }}
            onRestore={
              cleared
                ? () => setDraft(cleared)
                : undefined
            }
            onTapIngredient={(index) => setDraft(tapIngredient(current, index))}
            onTapExcluded={(ref) => setDraft(tapExcluded(current, ref))}
            rows={rows}
            tray={tray}
            onOpen={browsing ? undefined : () => setBrowsing(true)}
            onWellPress={pointAtTags}
          />
        </View>

        {/* Below the pot: your mixes, and over them, while building, your tags,
            risen from the bottom like a keyboard under its text field. Put away,
            only the tags' handle shows, at the bottom: pull it up (or tap the pot). */}
        <View style={[styles.screen, styles.clip]} onLayout={(e) => setBelow(e.nativeEvent.layout.height)}>
          <View
            pointerEvents={browsing ? 'none' : 'auto'}
            importantForAccessibility={browsing ? 'no-hide-descendants' : 'auto'}
            style={[styles.below, styles.clearOfHandle]}
          >
            <MixShelf
              mixes={mixes}
              art={mixArt}
              describe={describeMix}
              colorOf={mixColor}
              onPlay={playMix}
              onEdit={editMix}
              scrollEnabled={still}
              chipsOf={mixChips}
            />
          </View>

          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.below,
              styles.keyboard,
              // At the height last measured, anchored to the edge they rest at: the bottom when
              // put away (just the handle showing), the top when up. In the frame where the area
              // has changed size and the measurement hasn't caught up (the mini-player swiped away
              // or back), that edge is still right, so they stay where they were.
              below > 0 && (browsing ? { bottom: undefined, height: below } : { top: undefined, height: below }),
              {
                // Down, all but the handle is below the bottom edge.
                transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [Math.max(below - DIVIDER_HEIGHT, 0), 0] }) }],
              },
            ]}
          >
            {/* Swiped down by the handle, to fold: on the native driver, with the finger. */}
            <Animated.View pointerEvents="box-none" style={[styles.screen, { transform: [{ translateY: pull }] }]}>
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
                resizable={browsing}
                pull={pull}
                onSwipeFold={
                  browsing
                    ? (fast) => {
                        flung.current = fast;
                        fold();
                      }
                    : undefined
                }
                onSwipeRise={(offset) => {
                  risenBy.current = offset;
                  setBrowsing(true);
                }}
                riseLimit={Math.max(below - DIVIDER_HEIGHT, 0)}
              />
              <View
                style={styles.screen}
                pointerEvents={browsing ? 'auto' : 'none'}
                importantForAccessibility={browsing ? 'auto' : 'no-hide-descendants'}
              >
                <ScrollView
                  ref={tagList}
                  style={styles.screen}
                  contentContainerStyle={styles.content}
                  scrollEnabled={still}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                >
                  {/* Bobs up and settles when the empty well is tapped: "your tags are right here". */}
                  <Animated.View style={[styles.sections, { transform: [{ translateY: nudge }] }]}>
                    <View style={styles.section}>
                      {searching ? (
                        <SearchRow value={search} onChangeText={setSearch} onClose={closeSearch} />
                      ) : (
                        <SectionHead
                          tall
                          label="Your tags"
                          title={trail.length > 0 ? <Trail root="Your tags" path={trail} onGo={goTo} /> : undefined}
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
                            subtagsOf={subtagsOf}
                            choiceOf={choiceOf}
                            onTap={tap}
                            onOpen={(id) => {
                              // A search result's subtags: going in leaves the search.
                              closeSearch();
                              goTo(id);
                            }}
                            width={screenWidth - spacing.lg * 2}
                            parentOf={parentName}
                          />
                        ) : (
                          <Text style={styles.hint}>{nothingFound ? `Nothing matches “${term}”.` : 'No tags match.'}</Text>
                        )
                      ) : tags.length === 0 ? (
                        <Text style={styles.hint}>Tag some songs in the Library to mix them here.</Text>
                      ) : (
                        <Animated.View
                          style={{
                            opacity: slide.interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0] }),
                            transform: [{ translateX: slide.interpolate({ inputRange: [-1, 1], outputRange: [-SLIDE, SLIDE] }) }],
                          }}
                        >
                          <TagGrid
                            tags={children.get(place) ?? []}
                            subtagsOf={subtagsOf}
                            choiceOf={choiceOf}
                            onTap={tap}
                            onOpen={goTo}
                            width={screenWidth - spacing.lg * 2}
                          />
                        </Animated.View>
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
                  </Animated.View>
                </ScrollView>
              </View>
            </Animated.View>
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
          title="New mix"
          message={describeQuery(query, names)}
          placeholder="Night drive"
          confirmLabel="Save"
          onSubmit={async (name) => {
            await saveMixAs(db, name, current, null);
            notifyLibraryChanged();
            // Saved as new while editing: the mix opened stays as it was, and the editing's done.
            if (editingMix) finishEditing();
          }}
          onClose={() => setSaving(false)}
        />
        <OwnDetailsWindow
          ref={details}
          draft={current}
          title={editingMix?.name ?? named?.name ?? describeQuery(query, names)}
          onTune={setDraft}
          onPlay={async (songId) => {
            const request = await queueForQuery(db, query);
            // A tuned mix weaves its order, led by the song tapped.
            const order = isTuned(current) ? await tunedOrder(db, current, { first: songId }) : undefined;
            playQueue(request.ids, { startId: songId, shuffle: true, label: playLabel ?? request.label, draft: current, order });
          }}
        />
        <DragGhost />
      </View>
    </PotDragContext.Provider>
  );
}

const useStyles = makeStyles((colors) => StyleSheet.create({
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
  },
  sections: {
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
  // The mixes end above the tags' handle, which rests at the bottom.
  clearOfHandle: {
    bottom: DIVIDER_HEIGHT,
  },
  // The tags cover the mixes as they rise, on the page's own colour.
  keyboard: {
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
    color: colors.textDim,
  },
}));
