# ProTag — working notes

Local, gitignored. This file replaces the old plan at `~/.claude/plans/...`, which no longer
exists.

## What ProTag is

A music player that replaces playlists with a **tree of tags**, where a child tag implies its
ancestors. Shuffling becomes a *query* ("everything under `asian-pop` that's also `driving`,
but not `sad`") rather than a fixed list. One act of tagging feeds an unbounded number of
future shuffles; a playlist only ever feeds itself.

**The product goal shapes the engineering.** The aim is that people try tagging, find it's
their preferred way to organize, and make ProTag a daily driver. That makes *friction in the
tagging loop* the main risk — not missing query power. Two failure modes to design against:

- **Cold start.** A new user with 2,000 songs and zero tags has an app that's strictly worse
  than what they already use until they've done hours of unpaid work.
- **Per-song cost.** At five taps per song, nobody tags 2,000 songs. At one tap, maybe.

Locked-in scope: Android first, full device audio scan, tag tree with inheritance, visual
query builder (text syntax deferred), tag export/import in the first build.

## Where things stand

Done and verified:

1. **Scaffold** — Expo SDK 57, expo-router, TypeScript strict. Two tabs that boot.
2. **Database** — `src/db/`. Migrations, songs + tags repositories, cycle prevention.
3. **Query engine** — `src/query/`. AST, SQL compiler, human-readable labels.
4. **Device baseline** — EAS dev build installed; app launches and the Library tab reads
   `0 songs / 0 tags`, so migrations run on real on-device SQLite.
5. **Metadata source swapped** to `expo-music-library` (see decisions).
6. **Task 4 done and verified on device** (2026-10-04). Scan found 147 items for 124 real
   songs — the extras are non-music audio, see refinements below. Playlist import of a Samsung
   Music export matched **98/98** real songs; the 33 "not found" were dead entries in the
   exported file. `content://` playback through `expo-audio` works, which unblocks task 5.
7. **Task 5 (basic player) done and verified on device** (2026-10-04): playback, background
   track advance while locked, lock-screen media bar, and album art in-app and on the lock
   screen all work. Two fixes came out of testing — see "Player behaviors worth knowing".
8. **Task 6 (tag screens) done and verified on device**, including the add-songs picker.
9. **Design pass started (2026-10-06 → 10-08):** Lora display type, warm dark palette, deep
   teal accent, Notion-style tag colours (schema v3), colour dot after the tag name in the
   tag header (opens a swatch sheet), ProTag logo as app icon + splash + empty library +
   empty tag state, tonal `Button` variant with icons and a `small` size, keyboard opens in
   text dialogs (needs a 100 ms delay on Android — tested). Icons and splash need an EAS
   rebuild to appear; everything else is JS.

```bash
npm test && npm run typecheck    # 86 tests, both tsconfig projects clean
npx expo-doctor                  # 21/21
npm run icons                    # rebuild icons from assets/brand/logo.svg
```

**Icons (2026-10-19, user approved):** the tag icon is Material Community Icons' rounder
`tag-outline` (the user found Ionicons' `pricetag` too angular); the Library tab uses
`tag-multiple-outline`, filled (`tag-multiple`) when selected; the Play tab also fills when
selected. Every icon goes through `src/ui/Icon.tsx`, whose `OWN` map holds the
non-Ionicons glyphs (`tag`, `tags`, `-filled`): swap a glyph there. Adds ~1 MB of font.

**Gotcha (2026-10-19): navigate from an effect only once.** Saving crashed on every save
with `IllegalStateException: ScreenStackFragment added into a non-stack container`
(react-native-screens). Cause: `useStagedSave` went back in an effect keyed on
`navigation`, which is replaced once the screen leaves its stack, so the effect re-ran and
went back a second time, popping the screen underneath mid-animation. Fixed with a one-shot
ref and `navigation.goBack()` (scoped to the screen) instead of `router.back()` (global).
A first guess (notify the library only after the editor closes) was wrong and reverted.

### Editing a mix is a mode — 2026-10-27, emulator only
Was: Edit loaded the mix into the pot, and the only sign was its name in the Details line; no
clear start or end. Now (user's call, from the "N selected" bar): Edit turns the Play header
teal, "Editing <mix>", × (discard, asking only if changed) and ✓ (save, dim until changed or
with the pot empty). The pot's button becomes "Save as new mix" (the fork case). Either way out
puts back what the pot held before (`KeptPot.before`, kept across launches); Back does what ×
does. Teal not black: the background's already near-black. Saving a new mix from a plain pot no
longer links the pot to it; a pot that equals a saved mix is just named after it.
"Edit in Play" left the player's Details (tuning is done there now; changing ingredients is
the Play tab's, from the mix's own Edit), and with it `openPlay` and Play's `edit`/`draft`
params.

### Mini-player and song tags row — 2026-10-26, emulator only
User's call: the mini-player's tag button gave way to previous (⏮ ▶ ⏭); tagging is in the full
player. There, the tag button now leads the song's tags and stays put while they scroll beside it,
so it's in reach however many tags a song has (it used to sit at the end of the scrolling row).

### ProTag's own playback engine — merged to master 2026-10-25; EAS preview build made
Built hands-free while the user was away on branch `engine`, then merged (fast-forward) with
play next / queue view / drag the same day. User's call: a base version now, real-world testing
in day-to-day use. **Watch for**: Bluetooth buttons and disconnect pause; Android Auto (now
playing, resume); calls / other apps' audio pausing and resuming; long screen-off sessions;
resuming from headphones after the app was killed; art on lock screen and car.
expo-audio is gone; `modules/protag-player` (local Expo module, Kotlin, Media3 1.9.1) replaces it
behind the same `AudioEngine` seam (engine.ts, now `useNativeEngine` in `src/player/nativeEngine.ts`).
- *Shape*: `Playback` (Playback.kt) owns the one ExoPlayer (audio focus, becoming-noisy pause,
  wake lock). `PlaybackService` (MediaLibraryService, exported) shows it to the notification, lock
  screen, headphones and Android Auto. The JS module calls the player directly on the main thread
  and connects a MediaController only to start/bind the service. JS still owns the order
  (queue.ts); every song in it carries title/artist/album/artwork as MediaItem metadata, so the
  lock screen and car show the right song with no `setNowPlaying` calls. Album art goes straight
  in as the MediaStore `content://` URI (Media3 loads it): `lockScreenArtwork.ts` and
  `artworkUrls.ts` (the file-copy workaround) are deleted.
- *What it fixes*: shuffle changes mid-song keep the song playing untouched (`reorder` swaps the
  songs around it in place — the old crossfade handoff is deleted); an unplayable/missing song is
  skipped instead of stopping the music (max 10 in a row); lock-screen previous restarts past 3 s
  like the in-app one; repeat-one going round counts as another play (`onMoved(_, repeated)`).
- *Playback outlives the app*: swipe the app away mid-song and it plays on; reopening it picks up
  the queue (label, shuffle state, position) via `restore()` + a JSON `memo` of the QueueState kept
  natively. **Media resumption**: the last order + place are saved (`files/protag-queue.json` +
  prefs, `SavedQueue`), so play on headphones / car / Android's media controls after the app was
  killed (or a restart) resumes it (`onPlaybackResumption`, `MediaButtonReceiver` in the manifest).
- *Verified on the emulator* (8 generated 40 s tones in /sdcard/Music/ProTagTest): play from a
  list; external next/prev/pause/play (`cmd media_session dispatch`); foreground service + media
  notification (3 actions); shuffle on/albums/off mid-song without a break; auto-advance with the
  screen off; end of queue stops at 0; repeat all wraps; repeat one loops; deleted file skipped;
  service stopped then play again; swipe-away keeps playing and reopening restores; process
  killed then external play resumes and the app shows it.
- *Phone*: installed a standalone release build as a **third app, "ProTag Engine"**
  (`com.protag.app.engine`, `APP_VARIANT=engine` in app.config.ts — temporary, debug-signed, R8
  on) so nothing of the user's was touched. Smoke-tested: scan (122 songs), play, pause, album art
  in the notification. Its library starts untagged: restore a backup into it to test with tags.
  Uninstall it when done. Not yet tried on the phone: Bluetooth, the car, calls (audio focus),
  long screen-off sessions, resumption.
- *Android Auto, first try (user, preview build, 2026-10-25)*: shows the playing song, play /
  pause work, tapping the song opens ProTag on the phone (the session activity) — but the
  buttons were ±10 s, not previous / next: offered SEEK_BACK/FORWARD, Auto prefers them. Fixed
  (`9942a9c`): `onConnect` drops those two commands for every outside controller (session
  actions now PREVIOUS/NEXT, no REWIND/FAST_FORWARD; checked on the emulator). Needs a new
  preview build to reach the phone.
- *Variants*: the `engine` variant ("ProTag Engine", `com.protag.app.engine`) stays in
  app.config.ts for trying native changes on the phone beside the real apps. ProTag Dev needs a
  new EAS development build before it can run this (new native code).
- *Play next / Add to queue* (2026-10-25, user asked; tested on emulator): on every song
  list's selection bar (hold a song) beside Tag…, for one or many songs, with an Android toast
  ("Song playing next" / "3 songs added to queue"); selection ends. Model (queue.ts
  `queueSongs`, `queuedEnd`): queued songs sit right after the current song — Play next ahead
  of anything queued before, Add to queue after it — always before the rest of the order (a
  long shuffle would never reach the end). They're extra, not in `original`, and stay next when
  shuffle changes (`setShuffleMode`). Nothing playing: they just play ("Picked songs"). Native
  `insert` adds them in place, the song playing plays on. Tapping a song always means "play
  this now": the new queue replaces everything, queued songs included (decided by the user
  2026-10-25, unlike Spotify, which keeps them; requeue them if wanted). 
- *Queue view* (2026-10-25, user asked; tested on emulator): the list button top right of the
  full player (the old tag button's slot) swaps the artwork for what's coming up, fading in;
  title, tags, seek and controls stay put (in place rather than a sheet or page, like Apple
  Music). "Queued · N" then "Next from <source> · N"; tap a row to play it now (`jumpTo`), ×
  takes it out (`removeUpcoming`: a source song leaves `original` too, so shuffle won't bring it
  back; native `remove`). Back hides it before closing the player; the list sits outside the
  drag-to-close area. **Drag to reorder** (same day, tested on emulator): a ≡ handle at each
  row's end (PanResponder; the whole row would fight the list's scroll). The song lifts as a
  floating copy (haptic tick), the others step aside (120 ms), and it drops into place. Songs
  move only within their own part — queued among queued, the rest among the rest
  (`moveUpcoming`; unshuffled, the move is kept in `original` too). Native `move`. TalkBack:
  the handle is adjustable (swipe up/down moves one place). **Auto-scroll** (same day): the
  lifted song within a row of the list's top or bottom scrolls it (frame loop, up to 14 px a
  frame, faster nearer the edge; ~8 rows a second at full speed), and its landing place
  follows. A release lands where the finger left (quick drags lift before their last moves
  are handled). If the list takes the touch over (only seen with synthetic input faster than
  a finger: the scroll view intercepts before JS grants the drag), nothing moves. Not done:
  showing the wrap-around under repeat all.
- *Next it makes possible*: crossfade, an Android Auto
  browse tree (mixes, tags) — the car has nothing to browse yet, only now playing + resume; that
  needs a decision on what the car should show and how a mix plays without JS.
- *Build gotchas found*: `expo prebuild --clean` fails with EBUSY if any process has `android/` as
  its working directory (an emulator started from there did); Metro wedges when `android/` is
  regenerated under it (restart it); uiautomator dumps fail while the seek bar animates.

### Play tab tags: drill in to subtags (TRIAL) — built 2026-10-25, untested on device

Replaces the chevron that opened subtags as an indented grid below the tile's row (tiles
narrowed every level, and opening shoved everything below). Now the tags show **one level at
a time**: a tile with subtags has a full-height strip on its right edge ("2 ›"); tapping it
slides the grid over to that tag's subtags (in from the right, back out from the left, 200 ms).
The section head becomes a trail, *Your tags › kpop › generations*; tap a crumb to go back out,
or Back (a level at a time, then folds). The level is kept between launches
(`shuffle.tagsAt`); a tag since deleted or emptied falls back to the top. Search stays flat;
opening a result's strip leaves the search and goes in. The tile body still taps/drags into
the pot. Prompted by the user's facet grouping (kpop › generations › gen 4, kpop › companies ›
SM): grouping tags with no songs of their own are fine, since counts and mixes include
subtags. Open idea, not built: a subtag tapped while its parent is in the pot could replace
the parent (narrow) instead of adding to it, which changes nothing today.

### Artists and albums, step 3 of 3 (album shuffle) — built 2026-10-21, untested on device

The player's shuffle button cycles off → songs → albums → off (like repeat). Albums mode:
albums in random order, each whole in track order; songs without an album shuffled in as
singles (`albumGroups` in sources.ts, `shuffleAlbums` / `setShuffleMode` in queue.ts, tested);
the current song's album leads, whole, so the song plays on. Disc badge on the shuffle icon;
source line says "Shuffling albums ·". User worried a 3-state button wouldn't make sense, so
both shuffle and repeat briefly say the mode they landed on ("Shuffle: albums") in a label
floating above the controls. The last shuffle mode picked carries to new queues (like repeat,
in memory only): pick albums once and every Shuffle starts by album.

### Artists and albums, step 2 of 3 (pot ingredients) — built 2026-10-21, untested on device

A pot ingredient is a `Ref` (`src/query/refs.ts`): a tag id (number, unchanged) or
`artist:<name>` / `album:<albumId>`. `TagQuery` gained `artist` / `album` leaves (compiled to
`s.artist = ?` / `s.album_id = ?`); drafts, `sameDraft`, `pruneDraft` (keeps artists/albums),
`parseDraft` (`isRef`), the pot rules and `describeQuery` (album titles via `names`, from
`listAlbumTitles`) all take refs. Backups: album ids are per-phone, so a backed-up mix carries
`albums: {id: {title, artist}}` and restore re-finds each by title + artist (unfound ones drop
out); tested. Shuffle tab: under "Your tags", rows of the 12 most-played artists (round) and
albums (square) as `PictureTile`s (same rings/badges/drag/TalkBack actions as tag tiles),
ending in a search tile that opens `MusicPicker` (searchable, stays open to pick several). In
the pot, artists/albums are neutral pills (`colors.raised`) with a small picture; tags keep
their colours. User wants a way to search/filter the whole tab eventually.

### Shuffle tab search + sort — built 2026-10-21, untested on device
Option A from the mockup: a 🔍 at the end of the "Your tags" label row turns that row into a
slim search field (same 32 px height, so nothing moves). While it has text: tags from every
level as one flat grid (subtags show "parent ›"), artist/album rows filter everyone (first 12,
"All" tile only if more), empty sections hide. Each section label shows its sort; tapping it
cycles. Tags: A–Z / Most played (inherited plays, `listTagPlays`). Artists + albums: Most played
/ A–Z / Recently added (`plays`, `added` on the summaries). User said "Most songs" isn't worth
it. Sorts persist in `settings` (`shuffle.sorts`, parsed by `library/sorts.ts`).

### Library tabs: underline tabs + swipe — built 2026-10-21, untested on device
User found the segmented control "uninspiring": it read as a group of buttons, not tabs that
control the content. Picked option D: `ui/PagerTabs.tsx` — labels on a full-width hairline, a
bar under the current one, pages in a horizontal paging ScrollView (no native lib, no rebuild).
Bar and label brightness follow the scroll (native driver). Pages mount on first visit, then
stay. Swiping is off while selecting songs in Tags. `SegmentedControl` removed (no other users).
Rejected: serif tab words as the header ("a bit over the top"), chips, picture tabs, folder tabs.

### Pot on the page background + fold-away browser (TRIAL) — 2026-10-21, untested on device
User wants the pot to feel familiar, not eye-catching: pot lost its grey card (page bg, hairline
under it, teal wash while hovered) — user liked it. That made the screen's first move less
obvious, so trialling a multi-step feel: the browser (tags/artists/albums, search) is folded away
until asked for. Empty pot's well reads "+ Add tags, artists or albums" and opens it; with a mix,
an "Add more" button sits below. Browser slides up (fade + 48px rise) under an "Add to the mix" /
Done row; pot stays visible, so taps, drags, keep-out and live counts are unchanged. Done, Back,
or Shuffle fold it; Edit (mix or now-playing) opens it. Stays built while folded. If the trial
fails, revert the "fold-away browser" commit. Gradient glow (tag colours in the tray) tried
2026-10-24 and rejected: user prefers the clean look without gradients.
User liked the fold-away pattern (keep it).

### Play tab: pot + mixes on one screen — built 2026-10-24, untested on device
User's idea: the old Shuffle had the pot at the top with no movement on tapping in; put mixes in
the space below. Now tabs are **Play · Library** (`app/(tabs)/(play)/index.tsx` at `/`,
`openPlay`; Mixes tab removed). The pot never moves or resizes between states; below the
`Divider` (src/ui/play/Divider.tsx, was FoldHandle) the area swaps by a 180ms crossfade between
`MixShelf` (saved mixes: tap shuffles, hold for Edit/Rename/Delete; Edit loads into the pot) and
the tag browser. Divider label says what a tap switches to ("Tags"/"Mixes"); drag resizes the pot
in both states (rows kept); pull-past-max folds only while building. Empty well at rest says
"+ Add tags, artists or albums" and opens the tags. Removed: PotCover, the container-transform
frame, the centred-cover placement. Static pot chosen over a shrinking/expanding one (user
weighed both; no movement on mode change, freedom via the divider).
Then (same day): the tags rise over the mixes from the bottom like a keyboard under its text
field (260ms, out/in cubic; area clipped). At rest the pot is the field: a tap anywhere in it
(tile or well) opens the tags instead of editing; drags still work. With tags up, tapping the
empty well nudges the tags inside their panel (bob 12px + ease back, Context_Click haptic, list
back to top); moving the whole panel showed the mixes behind it.
Divider gestures, one job each (user's call: resize-then-fold during a flick was too busy):
tap switches; swipe moves the keyboard (down while building: tags follow the finger, fold past
64px or on a flick with a 180ms ease-out that keeps momentum, else spring back; up at rest:
opens); hold 300ms then drag resizes (Long_Press haptic, brighter bar, snaps to rows). The
pull-past-max fold is gone. Swipe offset resets 400ms after a fold, out of sight.
Mix card hold: a dimmed-screen `PopupMenu` under its artwork with a header (thumbnail, name,
ingredient chips in tag colours; neutral for artists/albums), icons (Edit create-outline,
Rename text-outline, Delete trash-outline in red below a line), and a white ring on the card.
On-card overlay buttons were tried first and dropped. All PopupMenus now take icons.

### Also 2026-10-24 (untested on device unless noted)
Tabs fade on switch (`animation: 'fade'`); Mixes and Shuffle have their own stacks so headers
match Library's. Library views prebuild in the background; tapping a view tab jumps (no slide).
Back from a tag/album/artist opened in the player returns to the player until the page is
first left (`useBackToPlayer`); Library stack anchored on its index. Press and hold any song in
any Library list to select, then Tag…; the per-row tag button is gone. Tag editor has a
"Your first tag" empty state with Create a tag. Player shows dashed "No tags yet" for any
untagged song. Preview build of everything through the kept pot started 2026-10-25.

Later the same day (tested on device): one hold for everything (`src/ui/haptics.ts`: `HOLD_MS`
350, `feelHold()` Long_Press) on mix cards, song rows and the divider; popovers fade in over
120ms themselves (Modal's own fade felt sluggish); menus darker with medium labels and MDI icons
(Rename is Aa). The pot lost its grey tray: a 2px edge, dashed while empty and solid once it has
tags, faint at rest and lit to `textDim` while building (the empty well's words light with it);
teal edge + wash while something hovers over it. At rest a tap anywhere in a filled pot opens
the tags.

Pot kept between launches (2026-10-25): `shuffle.pot` setting holds `KeptPot` (draft + editing
mix id, `keepPot`/`parseKeptPot` in mixes.ts, tested), written on every change. × leaves a
restore button (MDI `restore`) in its corner until something goes in or the app closes. This
replaces the "recent pots" idea (user: would clutter the Play screen). Same day: the empty
pot's tip at rest is "Mix your tags into a shuffle" (the combining tip only while building);
the divider lost its Tags/Mixes caption (kept for TalkBack).

Moved songs keep their tags (2026-10-25): a scan reunites songs gone missing with rows it just
added (above `lastSongId` taken at scan start) via `SongMatcher`, one-to-one only; the old row
takes the new file and metadata, so its id, tags and plays stay (`relinkMoved` in ingest.ts,
tested). Covers moving files / SD card / re-copying, and makes Android's own Auto Backup of the
database (on by default: Expo's `allowBackup` is true) usable on a new phone. Not covered:
`album:<id>` ingredients in mixes and the kept pot point at the old phone's album ids.

### Pot/tags divider — 2026-10-24, untested on device
The handle atop the tag list (`FoldHandle`) is now a divider: drag resizes the open pot's tray a
row at a time (`POT_ROW`, `trayHeight(rows)` in Pot.tsx; Segment_Tick haptic per row), min 1
row, tags keep >= 200px; tap folds. Smooth follow, snaps to nearest row on release (spring speed 8).
Folding by drag only past the largest size: the list follows the finger down (`pull`); let go
>80px past or flick -> fold (Confirm haptic at the threshold), pot size restored to pre-drag.
Rows persist in settings (`shuffle.potRows`). TalkBack: adjustable with increment/decrement.

### Shuffle modes per queue — 2026-10-24, untested on device
Opinionated: `shuffleModesOf(source)` in queue.ts. Mixes (any queue with a `draft`) only
shuffle by song ("Only song shuffle is available for mixes" on tap). Artists: songs ⇄ albums
(`ARTIST_MODES`; page buttons Shuffle + Shuffle albums; tapping a song shuffles from it), since
"off" was albums A–Z. Albums and lists: off/songs/albums. Discography order (release years via
our own native module `modules/media-years`, scan fills `songs.year`, artist songs/albums by
year) was built then set aside in `git stash` ("Release years ... set aside 2026-10-24");
expo-music-library doesn't expose years. User decided 2026-10-25 it isn't worth the extra scan
work; left out of the preview build. The stash is still there if that changes.
Mid-song shuffle-style changes crossfade (`expoAudioEngine` handoff); native players avoid this
with Media3 shuffle orders, which expo-audio doesn't expose.

### Folded pot as a cover — built 2026-10-23, untested on device
Centred pot (tried first, `8d0ee31`) felt pointless: the folded pot was already the full pot,
so opening revealed nothing, and its + / Done were precision targets. Now folded = `PotCover`
(src/ui/play/PotCover.tsx): mix as a mix card in the screen's middle (ArtMosaic of `covers`,
title = describeQuery or the mix's name, tag-colour dots, song count, `FinishButtons`, "Tap to
change"); empty = big dashed well. Whole cover opens it. Opening: cover rises, shrinks to 0.9
and fades while the pot fades/settles in at the top and the browser rises (all on `reveal`,
220ms). Folding: full-width "Done adding" bar, pull the list down from its top (`PULL` 72px),
Back, or Shuffle. Recent pots (unsaved shuffles, max 3 quiet lines under the cover): dropped 2026-10-25 for a kept pot + restore.
Revised same day: cover is a card (surface, grab handle, presses in, swipe up opens; "Tap to
change" gone); folding is a `FoldHandle` (tap or drag down) in a 20px strip atop the tag list,
outside the ScrollView (a floating Done pill felt intrusive; a Done bar cost the tags room; pull-
to-fold on the list never fired, the ScrollView took the touch, so it was removed); opening is a container transform: a `frame` view (non-native
`grow`, top/left/right/height/radius/colour) stretches from the card's rect to the pot's while
the card's contents fade early and the pot's late (`reveal`, native), 280ms inOut. The cover is
centred in the tallest height seen (`fullRoom`) so the mini-player never moves it; it only
shifts up / shrinks its art (min 96) when it would otherwise run under the mini-player.

### Pot as a two-column tile grid — built 2026-10-22, untested on device
Inside of the pot felt cramped and formatless (pills, trays, rings, +/− all freeflowing). Now a
mini copy of the tag grid: half-width 40px tiles, two columns (user trusted me on columns; 3
rejected: names truncate, combos wouldn't fit). Combined = shares side by side, equal widths,
× standing in a gap of background (user asked for an emphasized ×). Two short names (≤12 chars,
pictures count 3) fit half width; longer or 3+ take the full row. Count at the end of the last
share. Kept out = same tile with red ring and − badge (as on TagTile); + and − symbols gone.
After a change, tiles slide (cascade, no holes) via `Glide` in Pot.tsx: each tile animates from
its last onLayout position (native driver). LayoutAnimation was tried first and did nothing on
the user's Android phone; removed. A tile added out of sight scrolls into view (`useShowNewTiles`).
Rejected for combos: text across a colour split, stacked bands, colour spine.

### Text-only bottom sheets replaced — built 2026-10-22, untested on device
User's real complaint: drawers that are just lines of text, sliding up from the bottom when the
thing tapped was elsewhere (often the top), with no connection to it. Built-out sheets (Shuffle
tab's MusicPicker and PreviewSheet) are good: quick, no page change. Kept those (a brief detour
turned them into pages; reverted). ActionSheet deleted: `Popover` (from the (i) bubble: anchored,
roomier side, `useAnchor`) backs InfoButton, `PopupMenu` (mix card long-press, tag ⋯, player
source pill) and `ColorPopover` (tag colour dot, was ColorSheet). Move to… is `ChoiceDialog`
(centred, scrolling). Backup card: Save / Share / Restore buttons, no menu.

### Artists and albums, step 1 of 3 (browse + play) — built 2026-10-21, untested on device

User's concern: ProTag is song-centric, but many listeners think in artists and albums.
Agreed plan (user will watch that it doesn't erode ProTag's tag-led charm): (1) browse + play,
(2) artists/albums as pot ingredients, (3) album shuffle. Step 1: Library segments Tags ·
Songs · Artists · Albums (still opens on Tags); `src/db/albums.ts` (tested) groups by
MediaStore album id (album shown under its most common artist: Android gives no album artist)
and by exact artist string (cover = their biggest album). Album page (cover, artist link,
Play in order / Shuffle, tracklist in track order) and artist page (round picture, albums
row, songs) share `SongCollection`; its header tag button tags every song at once. The full
player's artist · album line opens a sheet (or goes straight there if only one exists).

### Player: song tags row — built 2026-10-21, untested on device

Under the title/artist: the playing song's tag chips (tap → that tag's page, closing the
player) ending in the round `TagButton` (shared with album/artist pages); "(🏷) Tag this song"
when untagged. Constant 44 px height; the artwork gives way. The top-bar tag button is gone
(user, 2026-10-21) and its slot is an empty spacer keeping the source pill centred — free for
something later. Untagged songs show `NoTags` (dashed "No tags yet" + button). User's concern
(2026-10-21): someone who never tags sees that on every song. Idea for later: when most of the
library is untagged, show just the round button there. Artist and album under the title are separate links (nested text spans in
the marquee), no sheet.

### Pot preview — built 2026-10-21, untested on device

User asked to see the songs behind a tag or query, not just a count, without clutter. Two
layers: the pot's top line (24 → 32 px), once something's in it and nothing's lifted, shows up
to 5 album covers (most-played first, distinct albums, via `distinctAlbums`; fetched with the
count so it changes once) + "[mix name ·] N songs · Preview ›". Tips now show only while the
pot is empty. Tapping opens `PreviewSheet`: every matching song (virtualised, by artist),
filter chips per ingredient (All · kpop × chill · lofi; exclusions still apply), tap a song to
shuffle the whole pot starting with it.

### SDK 58 + lock-screen next/previous + haptics — merged to master 2026-10-21, tested on device

Task 5b. Built on a branch (the installed dev build was SDK 57), tested on device with a new
development build, merged 2026-10-21. Folder choices (also tested) came along with it.

- *Upgrade*: Expo 58.0.16, React Native 0.88, React 19.3. Strict TS API fixes (refs use
  `ViewInstance` / `TextInputInstance`; list empties are `undefined`, not `null`; icon colour
  cast once in `Icon.tsx`). `useStagedSave` uses `usePreventRemove` from `expo-router` and its
  `repeat()`. expo-doctor clean, prebuild clean, typecheck/tests/bundle pass.
- *Engine*: expo-audio **playlists** (only playlists get next/previous on Android's media
  session), one per play order, holding the **whole** order and never edited. Why (found on
  device 2026-10-21): expo-audio's notification works from a snapshot of the playlist taken at
  `setActiveForLockScreen`; moves reach it but added/removed songs don't, and skipping onto a
  song the snapshot lacks crashes media3 (`IllegalStateException: Invalid PlayerInfo update,
  old index: 1 (count=2), new index = 2`). The first design (a previous/current/next window
  topped up after each skip) hit exactly that. So: new queue or shuffle toggle → new playlist,
  registered afresh (`setOrder`); skips, jumps and repeat are moves within it (`skipTo`,
  `loop` = none/all/single). Moves the phone makes itself come back as `onMoved(index)`;
  ProTag's own moves are recognised by their expected indexes. URIs for a whole queue come
  from one query (`getSongUris`, json_each). Shuffle toggle now has a brief gap while the
  new playlist picks up the song where it was.
- *Haptics*: `expo-haptics`, Android `Drag_Start` when a pot tag lifts (PotDrag `begin`);
  follows the phone's touch-feedback setting.
- *Known differences*: lock-screen previous always goes back a song (the in-app button still
  restarts past 3 s); a repeat-one loop doesn't count as another play; at the very first song
  played, lock-screen previous does nothing.
- *Risks to watch*: expo-music-library 1.3.2 declares RN < 0.87 (installs via
  `legacy-peer-deps`; plugin applies; native compile unproven). R8 is now on for **release**
  builds (`android.enableMinifyInReleaseBuilds`), so a production build may need keep rules;
  dev builds are unaffected.

**Device test list:** library scan works; play a mix; next/previous on the lock screen,
notification and headphones; let a song end while locked (next starts, gaplessly); toggle
shuffle mid-song (keeps playing, then skips go to the new order); repeat one/all at the
queue's end; jump to a song in the queue; "Discard changes?" in Tags… and Add songs, both
ways; long-press a pot tag (a tick as it lifts); the queue reaching its end stops.

### The pot — built 2026-10-20, untested on device

Answer to the AND vs OR thread (2026-10-09). The user asked for something built on instinct
(their seed: "dragging tags together like a cooking game"); prototyped in chat, liked. The
mix bar became the **pot** (`src/ui/play/Pot.tsx`), always on screen, fixed height:
- **Tap a tile** = in/out of the pot (no more tap cycle). Each tag in the pot is an
  **ingredient**; any ingredient plays ("either", count goes up — a basket).
- **Hold (100 ms, settled 2026-10-20; 250 felt slow) and drag** a tile or ingredient **onto another ingredient** = combine,
  shown "kpop × chill" with its own count: songs need both. Tap a combination to split it;
  tap a single one to send it back; drag one outside the pot to take it out.
- **Excluding**: the user won't use it much, so no permanent area. A **Keep out** zone slides
  over Save/Shuffle *only while dragging*; drop a tag there. Excluded chips sit in the pot,
  crossed out; tiles keep the excluded look. A combination can't be kept out.
- Empty pot's button = "Shuffle all · N" (the separate button is gone).
- Draft model is now `{ ingredients: number[][], exclude, includeDescendants }` (OR of
  ANDs); old mixes convert on read (`parseDraft`: all → one ingredient, any → one each).
  Pure rules in `src/query/pot.ts` (tested). Descriptions use × and + ("kpop × chill + lofi,
  not sad"). Drag is RN's responder system (`src/ui/play/PotDrag.tsx`), no new native deps;
  scrolling is switched off while something is lifted. Screen readers (2026-10-21): every drop is also a named action in TalkBack's actions menu
  (tile: Keep its songs out; pot chip: Combine with <each other ingredient>, Keep its songs
  out for a lone tag; kept-out chip: Add to the mix), calling the same `dropInPot` through
  `usePotDrop()`, and announcing the result. Untested with TalkBack on device.
- To judge on device: hold time vs scrolling, whether combining is discovered (hint line
  teaches it), ghost position above the finger. Haptics on lift would help (`expo-haptics`
  needs a rebuild).

**Pot on top (2026-10-20, user's idea):** the pot is an input field and the tags its
keyboard, so it's now **pinned at the top**, fixed height, with the tag grid scrolling below.
Pot rows: hint line + × → chips (two rows, wrapping, more scroll) → **two finishing buttons,
56 px: "Save as mix" (tonal) + "Shuffle" over its song count (filled, wider, thumb side)**.
The user's reasoning (2026-10-20): saving is a "submit" with finality, so it's on Shuffle's
level, not a side icon. Empty: a dashed well. Editing a mix shows "Editing “name”" in the
hint line; emptying the pot ends the edit.

**Save from the player (2026-10-20):** you often only know a combination is good after
hearing it. The queue's source now carries its `draft`; the full player's "Shuffling · …"
line (`SourceLine.tsx`) is tappable when it came from tags, shown as a soft pill (a
bookmark icon was tried and dropped: it clashed with the tag button). Its label (not the "3 of 114") scrolls sideways
when too long (`src/ui/Marquee.tsx`; still under reduced motion). A saved combination is
recognised via `sameDraft`. Tap → sheet: Save as mix
(unsaved only) / Edit in Shuffle (closes the player, loads it in the pot; a saved one opens
as that mix). The mini-player is unchanged (no clutter next to the tag button). Name clashes
use one rule everywhere: `saveMixAs` (another mix's name is refused). Tag-page shuffles pass
a one-tag draft, so they can be saved too.

The Play tab is now called **Shuffle** (`app/(tabs)/shuffle/index.tsx`, own stack since 2026-10-24; `openShuffle`).

**Mixes got their own tab, first (2026-10-20).** Tried mixes inside the empty pot; the user
rejected it ("is this where I find my mixes, or where I build?" — separation of concerns).
Tabs are now **Mixes · Play · Library**, and the app opens on Mixes (`app/(tabs)/(mixes)/index.tsx`, own stack since 2026-10-24;
the builder moved to `play.tsx`). Mixes: two-column grid of big artwork cards + a dashed
"New mix" card; tap = shuffle; long-press = Edit (opens Play with the mix in the pot, via
`openPlay(id)` → the `edit` param) / Rename / Delete. Empty: "Your mixes live here" + Make a
mix. Play only builds and saves; editing tracks the mix by id. Both Mixes and Play bring a
hidden mini-player back on focus.

Mix-card album mosaics: kept (user verdict 2026-10-22: good for mixes; may want more customisation later).

**Multi-select on tag pages — built 2026-10-10 (`e18f48d`), tested on device.** Long-press
a song to start selecting (replaces the old single-song long-press sheet); taps toggle; only
× or back exits (2026-10-19: emptying the selection, by hand or "deselect all", stays in
selection mode; the header reads "Select songs" and the bar dims). Header has a select-all
circle. A `SelectionBar` replaces the FAB with **Tags… / Remove** ("delete" = remove from this
tag; ProTag never deletes files). Remove acts on the whole subtree so songs leave the page
(`removeSongsFromTag`). **Tags…** (2026-10-19, replaced Add to… / Move to…) opens
`app/edit-tags.tsx`: every tag with a **tri-state checkbox** — checked (all selected songs
have it), minus (some do, with "2 of 3"), empty (none). A partial tag cycles all → none →
as-it-was; others toggle. **Only touched tags change**, which is what makes it safe when
the songs don't share their tags (the user's worry). Direct tags only. Tags the songs have
are listed first (fixed for the visit). Typing a missing name offers "Create …"; new tags are
staged and created on Save. Logic in `src/library/bulkTags.ts` (pure, tested), applied by
`applyBulkTagEdit` in one transaction. Moving = uncheck this tag, check another. If the
editor saves, the tag page's selection ends (it watches the library version); if it's
discarded, the selection stays. **Since 2026-10-19 it's also the single-song editor**
(`openSongTags(id)` = `openEditTags([id])`; `app/song/[id]/tags.tsx` deleted): one song →
the header is the song's title, the hint reads "Tap a tag to add it, again to remove it",
and the list order is the song's tags → its genre tag (if it exists) → recent tags → the
rest; a missing genre shows "Create "<genre>" · from this song's genre". Enter ticks the
exact match, else the only match, else creates. The user isn't fully sold on a separate
screen and the "Tags for N songs" title, but accepted it for now (it needs the space). Selected rows tint; the check shows over the artwork (2026-10-15: rows are one touch area, tag button removed on tag pages, kept in the Songs view).

**Tags as folders — built 2026-10-15, untested on device.** The user's original vision: the
Library works like a file directory, tags = folders, songs = files. Tag rows are folder rows
(folder icon on the tag colour, same 48 px tile as song artwork, 72 px rows). Tag page:
breadcrumb → "2 subtags · 98 songs" + a round shuffle button → folder rows flush → thin
divider → songs. No section labels; "Add subtag" left the page body. The FAB is **+ Add**
→ a flyout `FabMenu` (Material FAB menu: pills above the button, tap away / × / back
to close; user preferred it over a drawer) with "Add songs / New subtag". Empty tags
offer Add songs + a quieter New subtag (tentative — user will judge). Library Tags view = root
folder with a **+ New tag** FAB; Tags/Songs switch stays (Songs = "all files"). Words stay
"tag/subtag"; only icons say folder. Fold-on-scroll is shared as `useFabFold()` in Fab.tsx.
**Loose files — built 2026-10-19:** the Tags view lists songs with no tags under the folders,
after a divider, captioned "NOT TAGGED YET · N", newest first (`{ type: 'untagged' }` query,
`recent` order) — a to-do list that shrinks as songs get tagged. Tap plays through that list
("Not tagged yet"); long-press selects, with a **Tags…**-only bar (nothing to remove). With no
tags at all, the view is just every song (plus the playlist-import prompt). Selection logic
is shared with tag pages as `useSongSelection` (`src/ui/hooks/`); on the Library screen it
lives in `library/index.tsx`, which owns the header (set in full in every state) and clears
the selection when switching to the Songs view.

### Next session — start here (agreed 2026-10-08)

**All four items below are built (2026-10-08) but not yet tested on the phone** — the user
will test them in one go. Commits `ad82db8`..`6179fd1`. Things to check: the FAB folds and
unfolds smoothly and its label isn't clipped; long-press on a song row in a tag opens the
remove sheet; the picker's two filter chips; tag songs newest-tagged first. "Recently added"
in the picker only means something after a **rescan**, which fills each song's real
MediaStore date-added (before that, every song shares the first scan's time). The small
`Button size="small"` is now unused, kept for later.

Framing the user set: **a tag with no subtags is a playlist, only better.** Adding songs from
inside a tag is a *main* way to tag (one tag → many songs, the cold-start fix), so it must be
reachable everywhere on the tag page. In this order:

1. **Extended FAB "+ Add songs"** on the tag page, bottom-right. Shrinks to just the plus while
   scrolling down, expands on scroll up / at rest. Replaces the small tonal pill beside the
   SONGS heading; hidden when the tag is empty (the empty state has the CTA). Pad the list
   bottom so the last row isn't covered. Must sit above a future mini-player if that's chosen.
2. **Remove from tag on the tag page** (swipe or long-press a row) — playlist parity; today it
   needs the song's tag editor.
3. **"Not tagged yet" filter in the add-songs picker** (plus recently added sort).
4. **"Recently added" as the tag page's default sort**, from `song_tags.added_at` — the
   playlist feel without manual ordering (deliberately not adding manual order).

**Mini-player restructure — built 2026-10-08 (`5022d06`); the 2026-10-17 sheet and swipe rework
(`773a442`, `91c5537`) tested on device by the user: working.** Decided
with the user: tabs are **Play** (start something; quick-start now, query builder later, on
the same page) and **Library** ("Tag" was considered and rejected as too clever). The full
player is no longer a route (changed 2026-10-17): `src/ui/player/PlayerSheet.tsx` is a sheet
over the tabs that grows out of the mini-player and follows the finger both ways, driven by one
`progress` value; it closes with the chevron, back, or a drag down on its top half. It lives in
the tabs layout so root modals still cover it, and the player only mounts while open or moving. Library has its own stack
(`app/(tabs)/library/`: index, `tag/[id]`, `manage`), so tag pages keep the tab bar and
mini-player. The mini-player renders in the `tabBar` slot above `BottomTabBar` (both from
`expo-router/tabs`), so screens end above it with no per-screen padding. Mini-player: art,
title/artist, then play/pause, next, tag on the right, 2 px progress line; tap opens
the player. **Swipe down, left or right hides it; swipe up opens the full player** (user's idea — Spotify can't); music keeps playing. It
comes back on opening the Play tab or starting new playback (`queue.original` identity
changes), not on skips. First hide shows a one-time note (`SettingKey.miniPlayerHint`).
Modals (tag editor, add-songs) cover it. Typed routes regenerate only when the dev server
runs — after moving routes, start it once or tsc flags the new paths.

Then (backup, the mini-player and the query builder are built too). Open idea: "shuffle this
tag with…" from a tag page, handing off to the Play tab's builder. Later polish:
multi-select tagging in the Songs view, ripple feedback, sheet/list motion matching the stack
slide the user likes, haptics.

## Roadmap

**4. Library scan — done, verified on device.** Not urgent, but worth doing before other
people use it:

- **Done 2026-10-20, tested on device 2026-10-21: folder choices.** Manage library → Folders
  (`app/(tabs)/library/folders.tsx`); the scan result links there when files were left out.
  The scan still reads everything with `getAssetsAsync` and *subtracts* the files of unticked
  folders (`leftOutOfScan` in `libraryFolders.ts`), so files Android lists in no folder are
  never lost. Defaults are guessed once per folder by the pure `guessFolder` (`folders.ts`,
  tested): whole-name matches only (WhatsApp Audio, Recordings, Call, Ringtones…; never
  words inside a name, which would catch album folders), else ≥80 % of a 40-file sample at
  speech bitrate (<40 kbps) or AMR/3GPP. Choices are JSON in `settings`
  (`library.folders`); flipping one marks it the user's, never re-guessed. Songs from
  unticked folders are flagged missing but counted as `hidden`, not "no longer on this
  phone", and return when ticked. To check on device: how long the first scan's folder
  sampling takes on a big library (one query per new folder), and whether WhatsApp's
  weekly voice-note folders are caught.
- **Non-music audio gets counted as songs.** Cause: `expo-music-library`'s query applies no
  `IS_MUSIC` filter, so voice notes, call recordings, and podcasts over 30 s come through.
  Fix: per-folder exclusion (`getFoldersAsync` / `getFolderAssetsAsync`, which work via
  Android's folder buckets on every version) with **smart defaults** — a folder starts unticked
  when its signals say "not music":
  - *Folder name* (strongest): WhatsApp, Telegram, Recordings, Call, Voice, Podcasts,
    Ringtones, Notifications, Alarms.
  - *Format + bitrate* (strong, cheap): `mimeType` and `fileSize / duration` are both exposed.
    Voice is `.opus`/`.amr`/`.3gp` at ~12–32 kbps; music is 128–320 kbps, FLAC far higher.
    Podcasts (64–128 kbps) are the fuzzy case.
  - *Tags* (decent, with a trap): voice audio rarely has artist/album — but **untagged music
    is common**, especially songs downloaded straight to a phone. Never exclude on missing tags
    alone; it would silently hide real songs.
  Rule: **defaults, never silent filters.** A hidden song is worse than a visible voice note —
  you can see and remove the voice note, but you'd never notice the missing song. Preferred
  over patching `IS_MUSIC` into the library's Kotlin: that's a fork plus a rebuild, and
  `IS_MUSIC` is itself mostly Android guessing from folder names.
- **Done 2026-10-21: "not found" entries in playlist import results.** Each playlist's result
  is a row in the Playlists card (tag tile in its colour → opens the tag; "24 songs · new tag"),
  with an expandable "N not found on this phone" list of `entryLabel`s ("Artist – Title" or the
  file name).

Layout: `src/library/` — `assets.ts` (MediaStore → row mapping), `ingest.ts` (page writes,
missing-flagging), `m3u.ts`, `match.ts`, `playlists.ts` (all pure or DB-only, unit-tested) and
`scan.ts`, `saf.ts`, `playlistFolder.ts` (thin native layers). Original design notes:

- *Discovery + metadata in one query*: `getAssetsAsync` from `expo-music-library`, paginated by
  cursor, upserted via `upsertScannedSong` / `flagMissingAfterScan` (already written and
  tested). Title, artist, album, track, duration (**seconds** — convert to ms), and genre ID all
  arrive together. No per-file reads, no background enrichment phase.
- *Artwork*: store nothing. `artworkUri` is a `content://media/external/audio/albumart/<id>`
  URI that `<Image>` renders directly. Pass `artwork: 'none'` during the bulk scan to skip the
  per-asset existence check, and derive the URI from `albumId` when displaying.
- *Genre*: `getGenresAsync()` once, build an id → name map. Offer genres as **suggested** tags
  for an untagged library — never auto-applied. Android 11+ only; older phones get none.
- *Playlist import*: SAF folder prompt (`expo-file-system/legacy` `StorageAccessFramework`),
  find `.m3u`/`.m3u8`, parse, one tag per playlist. Default-on with an opt-out, never a neutral
  fork — during onboarding every choice is friction at the moment you're proving value.
- *Shared matcher* (`src/library/match.ts`): filename, then normalized artist+title. Used by
  playlist import **and** the task 8 backup import; build it once. There are no file paths on
  Android 10+, so path matching isn't available as a first tier.
- *Playback*: the `content://` URI plays through `expo-audio` — **confirmed on device**.

**5. Player — done, verified on device.** The checklist it was verified against:

1. Player tab → **Shuffle everything** → plays; artwork, seek bar, and "Shuffling · Everything"
   show. Drag the seek bar.
2. Stop, then tap the **kpop** chip → "Shuffling · kpop · 1 of 98".
3. Next, previous (restarts if >3 s in), shuffle toggle (current song keeps playing), repeat
   cycle off → all → one.
4. Switch to the Library tab → music keeps playing.
5. Lock the phone → keeps playing; lock screen shows title/artist and play/pause/seek.
   **Let a song end while locked → the next one must start.** The queue advances in JS, so
   this is the real test of background playback. Also note whether lock-screen *artwork*
   appears — it's a `content://` URI, which may not be supported there.

Structure: `src/player/queue.ts` (pure transitions, 15 tests), `engine.ts` (the adapter
interface), `expoAudioEngine.ts` (the only file importing expo-audio), `PlayerProvider.tsx`,
`sources.ts` (query → queue). Display pieces in `src/ui/player/`.

**5b. SDK 58 upgrade + playlist engine — done, merged 2026-10-21, verified on device** (see
"SDK 58 + lock-screen next/previous" above). Gives lock-screen next/previous. Steps and risks are under
open question 4. Also verified on device 2026-10-04: the player fits the screen without
scrolling (artwork fills the space the fixed-height controls leave, via `ArtworkSlot`).

**6. Tag screens — done, in daily use** (user happy with the Library tab, 2026-10-20). On the phone (no rebuild needed):

1. Library tab → **Tags** → the imported kpop tag with its song count. Tap it → its songs;
   **Shuffle** plays them.
2. **Songs** → every song with tag chips. Search (try a Chinese title, an accented artist).
   Tap a song → plays the list from there.
3. Tag icon on a song row → editor. Tap a **Recent** chip; type `driving` + Enter (creates);
   type `asian-pop/kpop` + Enter (nested). Remove a chip. Close → the row's chips updated.
4. On a tag's screen: ⋯ → Rename, Move to… (its own subtags must not be offered), Delete (the
   dialog states how many songs/subtags are affected; songs stay).
5. Player → tag icon top-right → same editor for the playing song.
6. Library header ⚙ → Manage library: rescan and playlist import live there now.
7. (Added 2026-10-06) New tag → it opens → **Add songs** → tap a few, check the "Suggested ·
   same artists" section, search, untap one → Done → the tag shows them.

Layout: route files in `app/` (`(tabs)/library.tsx`, `tag/[id].tsx`, `song/[id]/tags.tsx`,
`library-manage.tsx`); screen-level pieces in `src/screens/library/`; presentational
components in `src/ui/` and `src/ui/library/`.

**7. Query builder — superseded by the pot (Shuffle tab, 2026-10-20); kept for history.**
On the Play tab (`app/(tabs)/index.tsx`). Decided with the user: **tap cycles** include →
exclude → off (`cycleTag`), every state visible on the `QueryChip` (tinted + check / dashed +
minus + strikethrough / plain), with a hint line under the chips; **top-level tags with a ›
that expands subtags inline** (a full-width block, left border in the tag colour); **saved
mixes in v1**. Layout: "Your mixes" cards (tap = shuffle under the mix's name, long-press =
Edit / Rename / Delete) → full-width Shuffle button with the live count ("Shuffle everything
· N" when empty, "No songs match" disables it) → summary line (`describeQuery`) with Save /
Clear → "Match all / any" only once 2+ tags are included → the chips. Picking a parent
includes its subtags (`includeDescendants` is always on; no UI for it). Tags with 0 songs are
hidden. Mixes live in `saved_queries` as the **draft** JSON (not the compiled query) so they
reopen in the builder; drafts are pruned of deleted tags when shown or played. Saving to the
name of the mix you opened updates it; any other existing name is refused. Mixes are in the
backup (optional `mixes` field, still format 1; a same-named mix already on the phone wins).
The Play tab's "Nothing playing" title is gone — the mini-player says what's playing.
**Revised 2026-10-09 (`07656a0`): tag tiles + mix bar**, the first step of the "vibe" direction
(picture/colour-led, big targets, little reading). Tags are a 2-column grid of colour tiles
(`src/ui/play/TagTile.tsx`, `TagGrid.tsx`): off = soft wash of the tag colour, included = full
colour + check badge, excluded = dim trace of its own colour (user worried all-red would hide
*which* tag) + red outline, minus badge, struck name; the song count stays in every state (text never changes on a tap). Subtags open as a grid
below the parent's *row* so the neighbouring tile never moves. Picks go into a floating
**mix bar** (`MixBar.tsx`, fixed height, over the bottom; the page always reserves its room):
summary + count, an "All of these / Any of these" pill once 2+ included, clear ×, and **Save
as mix** next to **Shuffle**. "Shuffle everything" is a constant secondary button above the
tiles. Tapping a tile selects (doesn't play); mix cards play — accepted trade-off. The Play
page layout as a whole is still in flux.

**8. Backup — built 2026-10-08; Back up / Restore reworked 2026-10-21; the round trip
(save to a folder, then restore it) is not yet confirmed on device.** `src/library/backup.ts` (format,
export, parse, plan, apply; 6 tests), `backupFile.ts` (share sheet + document picker),
`useBackup.ts`, and a Backup card in Manage library with "Last exported N days ago".
- JSON, `format: 1`, versioned; a newer format is refused with "update the app". Tags carry
  file-local ids for parent links, plus `color` and `createdAt`; songs (only tagged ones,
  missing files included) carry filename/title/artist/album/duration and their direct tags
  with `addedAt`, so "newest-tagged first" survives a restore.
- Import is **merge only** (decided: replace is destructive and merging into an empty library
  *is* a restore). Tags match by name + place in the tree, case-insensitive; existing tags
  keep their colour, new ones take the backup's. Songs match with the shared `SongMatcher`,
  against missing rows too. Idempotent: re-importing changes nothing, so a backup can be
  re-imported after more songs land on the phone. Summary dialog before anything is written;
  everything applies in one transaction.
- **Back up** (renamed from Export, 2026-10-21) offers two ways: *Save to a folder on this
  phone* (SAF folder picker → `StorageAccessFramework.createFileAsync`, opens at the last
  folder, `backup.folderUri`) and *Send to an app* (share sheet). Added because the share sheet
  only lists apps: on the user's phone there was no way to save the file locally. Android
  doesn't report whether a shared file was saved, so "last backed up" there means the sheet
  was completed. **Restore** (renamed from Import) is unchanged: merge only.
- Mixes are in the file (`mixes`, restored by name, existing names kept). Not done: no
  automatic/periodic backup.

### ProTag's own playback engine — built 2026-10-25 (branch `engine`), see the top of the log.

### Sequencing note

The foundation already supports "simple by default". Flat tags are just `parent_id NULL`, and
`QueryDraft` separates include/exclude/mode, so a stripped-down UI is a strict subset. The
power can live in the model without being pushed into anyone's first five minutes.

## Open questions

1. **Does tag-from-the-player outrank the Library tab?** The best moment to tag is while a song
   plays — the opinion is perishable, and leaving the player to act on it loses it. That argues
   for a one-tap tag affordance on the player, which inverts the current ordering.
2. **AI auto-tagging.** Post-skeleton. Framing decides whether it helps: **suggest, never
   auto-apply** (a wrong tag costs more to remove than a missing one costs to add). The weak
   version is generic genre — and MediaStore now supplies genre for free, which shrinks the
   case for AI there further. The strong version learns the user's own taxonomy, which needs
   existing tags first. Reserve AI for mood/context tags no database has.
3. **Visual direction.** *Typography decided (user, 2026-10-06): Lora only at 17 px and up
   — screen titles, headings, the now-playing title — and the system sans for everything
   else, including song titles and tag names in lists (medium weight).* The user liked
   Lora Bold at 22 px but found it fussy at 15 px in lists: below ~17 px its serifs and stroke
   contrast read as noise, worse light-on-dark and when stacked. Medium, not semibold:
   Android's system font has no true SemiBold, so '600' rounds unpredictably. The sans is
   Android's own because Lora has no CJK glyphs: Chinese falls back to Noto Sans CJK, drawn
   to match Roboto. Custom fonts set each weight as its own family with `fontWeight: 'normal'`
   (theme.ts `face()`) — any other weight makes Android draw a synthetic bold. Import font
   weights from per-weight subpaths (`@expo-google-fonts/lora/600SemiBold`); the package root
   pulls in all eight files (~1.1 MB). *Color decided: warm dark* — neutrals with a very
   faint brown tint (the user asked for it subtler than the first mockup). Deep teal accent
   (`#22695F`, white text on it); teal text/icons on the dark bg use the lighter `accentFg`.
   Tag colours are Notion-style: 12 named colours stored per tag (`tags.color`, schema v3),
   new tags cycle through them, changeable from the tag's ⋯ menu. Names not hex, so the
   palette can be retuned or given light-theme values. *Tag export/import (task 8) must
   carry `color`.* Considered: subtags inheriting their parent's colour (shows families at a
   glance, but a big tree would go mostly one colour) — not done, user chose cycling. A middle ground between the
   beige/blue-green bookstore idea and a blank canvas that leaves album art the loudest thing.
   Deep teal (`#1F5E58`) is too dark on dark; it's for a *later light theme*, designed as its
   own palette (closest to the original bookstore idea), not an inversion. Light mode needs a
   `useTheme()` hook and styles as functions of the theme in ~30 files, plus unpinning
   `userInterfaceStyle` — deferred until layouts settle. Layout is still open.
4. **Next/previous from the lock screen, notification, headphones, and car — done on SDK 58
   (merged 2026-10-21, see "SDK 58 + lock-screen next/previous" above).** (User, 2026-10-04: lock screen shows ±10 s, would prefer prev/next.)
   expo-audio 57's Android media session removes all four track-navigation commands. User does
   not want to patch.

   **Decided (user, 2026-10-04): wait for SDK 58, then move the engine to expo-audio's
   playlist API.** No patching, no third-party player. Scheduled as roadmap task 5b. Expo PR
   #46020 (Expo team, merged to `main` 2026-06-26) adds `showNextTrack` / `showPreviousTrack`
   lock-screen options wired to *playlist* navigation. It missed SDK 57. Verified in the
   published `expo-audio@58.0.5` (`next` tag): the options are in the types, the playlist has
   its own `setActiveForLockScreen`, and the Android media session now *adds* the navigation
   commands. SDK 58 beta opened 2026-09-15; stable follows React Native 0.88 (due 2026-10-12).

   Two things the upgrade involves — **more than the one-line swap originally hoped for**:
   - *Engine moves from a single player to a playlist.* Next/previous are wired to playlist
     navigation, so the native playlist must hold the queue and advance it; the provider then
     syncs its index from the playlist instead of driving every change. Contained to
     `engine.ts`, `expoAudioEngine.ts`, and provider wiring — `queue.ts`'s shuffle/repeat
     logic and the UI stay. Upsides: gapless playback, and advancing no longer needs JS
     running while the phone is locked. Check whether a single player honours
     `showNextTrack` before committing to the bigger change.
   - *`expo-music-library` caps React Native below 0.87* (peer range), and SDK 58 is RN 0.88.
     `.npmrc`'s `legacy-peer-deps` won't block install, so build it and test the scan; the
     maintainer shipped 1.3.2 four weeks after SDK 57, so an official release may follow.

   **Status check 2026-10-13:** SDK 58 is still **beta** (`expo@next` = 58.0.8, actively
   patched; `latest` = 57.0.28). React Native 0.88 *slipped*: still `0.88.0-rc.5`
   (`latest` = 0.87.1), and Expo releases SDK 58 "shortly after" RN 0.88 ships. So stable is
   likely weeks out, not days. `expo-music-library` unchanged since 1.3.2 (2026-07-27), repo
   quiet but CI keeps SDK compat fixtures, no SDK 58 issue filed. Breaking changes that touch
   ProTag: (1) the **custom `tabBar` with `BottomTabBar` from `expo-router/tabs`** in
   `app/(tabs)/_layout.tsx` — Expo Router's navigation core was reworked and JS Tabs moved to
   the "standard-navigation integration"; the mini-player lives in that slot, so this is the
   riskiest bit; (2) RN 0.87 Strict TypeScript API: ref types change (`useRef<TextInput>` in
   `PromptDialog.tsx`); opt-out via tsconfig `customConditions` until after RN 0.88. Nothing
   else found (no InteractionManager, deep imports, Modal `animated`, ImageBackground).

   **`react-native-track-player` was evaluated and rejected** (2026-10-04):
   - *v4* (`react-native-track-player`, Apache-2.0): last release 4.1.2, Aug 2025; maintainer,
     June 2026: "We're not actively maintaining V4." Fails to compile on newer React Native
     (`MusicService.kt: 'onBind' overrides nothing`, issue #2455); fixes require patching it.
   - *v5* (`@rntp/player`, very active): **not open source.** Free only for "a private
     individual solely for personal, non-professional purposes"; otherwise €99/month or
     €999/year per app, and even licensees may not redistribute it without written
     permission — which conflicts with publishing ProTag for other people.

5. **Shuffle options — parked design thread (raised by the user 2026-10-26, not to be rushed).**
   Beyond shuffle *modes*, tags allow shuffle *options* for a union: tags in a set order or in
   turns (like album shuffle, by tag), per-tag weights (a 10-song tag and a 100-song tag heard
   evenly), small tags looping while big ones don't. User wants these *discovered* by keen users,
   never pushed at average ones, and — the pot's lesson — expects many design iterations: getting
   it to work is easy, getting it to look and feel good is not. Thinking so far (mine, unvalidated):
   - One model: each included ingredient is a *stream*; an option is a rule for weaving streams.
     Blend (today, default) · Balanced (equal shares; small streams loop or drop out) · Weighted
     (ratios; balanced = all 1) · In turns (blocks of n; n = whole tag = sequence in pot order).
   - More: songs in several ingredients played once or favoured; spread across a tag's subtags
     (gen 4 / gen 5 evenly); fresh first (play counts exist); warm-up tag first. Artist spacing
     should be a quiet default for everyone, not an option.
   - Options belong to the *recipe*: the pot's draft as well as saved mixes (saving carries
     them), so query-builder users aren't left out. Only meaningful with 2+ included ingredients.
   - Rule to keep: a non-default option must show (mix card, player source line), or a shuffle
     that feels different reads as a bug.
   - Reopens the "mixes only shuffle by song" decision as an advanced layer (button unchanged).
   - Engineering is the easy part: `ShuffleStrategy` in queue.ts is pluggable, the native engine
     takes a whole pre-built order; needs which ingredient each song came from.
   - Open: what it looks like. Ideally not numbers and sliders — maybe a gesture or visual in the
     pot, the way combining tiles is. Prototype before building.
   - **Prototyped 2026-10-26** (throwaway, `prototypes/`, published as artifacts "Shuffle Options
     Prototype" and "Mix View Prototype"). Round 1 compared hold-a-tag (A), shuffle styles on the
     button (B), a mixing-desk bar (C). User liked A's separation of concerns (each tag owns its
     weight, the shuffle only combines — scales better than B/C managing everything at once) and
     B/C's visual overview; proposed growing the pot's Preview into a bigger view. Round 2: the
     mix view, three layouts; **user picked D (tag rows)** — E (accordion) better suited to a
     computer, F (lanes) too much to take in at a glance.
   - **Decided so far (user):** each tag owns **share** (− / + halving or doubling its natural,
     size-based share; shows the resulting %) and **↻ Repeats**. Shares are of the *whole*
     shuffle, so a tag raised above ×1 has Repeats **locked on**, with no explanation ("just how
     it is"; users will work it out). Lowering never touches Repeats. Top of the view: the next
     40 songs as a strip, then a thin line of each tag's share (not a whole-queue overview).
     **"In a row" (runs) dropped** — breaks the idea of a shuffle; with it goes "in turns".
   - **Built 2026-10-26 on branch `shuffle-options`, tested on the emulator** (3-tag pot: kpop 18,
     lofi 4, chill 6). User's decisions that day: the pot's "Preview" became **Details** (still a
     quiet line; "· tuned" in teal when tuned — the mark); tapping it opens the window with a
     snappy **expand** from the line (no slide); the **player's source pill opens the same
     window** (its old menu, Save as mix / Edit in Play, became header buttons). One-tag mixes get
     the window too, without tuning rows.
     - *Model*: `QueryDraft.tuning?: { refs, share, repeats }[]` (query/tuning.ts), by the
       ingredient's refs so it saves with mixes, the kept pot and backups (ref mapping carries
       it; an ingredient that changes plays plain). Share ×¼…×8 of the natural (size) share
       (Repeats was a locked toggle at first; now automatic, see below). A song in several ingredients counts for the
       smallest (`ingredientSongs`).
     - *Weave* (player/weave.ts): each ingredient is next due a share's width after its last
       song, plus a random nudge; the most overdue plays. Shares hold over short stretches (a
       first, purely random-pick version let a 25% tag get 4 to 15 of 32). Ends when every
       non-repeating ingredient has played out. Untuned mixes keep the plain Fisher–Yates
       shuffle, and Details shows a plain sample for them.
     - *Playing*: `usePlayQuery` weaves tuned drafts; tapping a song in Details leads the weave
       with it; `retune` (player) rebuilds the order around the playing song, keeping queued
       songs next (`retuneQueue`), engine `reorder` so nothing stops. A saved mix retuned while
       playing offers "Save tuning to <mix>" in the header.
     - *Polish after merging (user, same day)*: three sections set apart like the Library's
       (summary · TAGS · SONGS, hairline + caption); each tag on one line; tuning *shown* not
       told (changed ×n and ↻ in teal, a ↺ reset in the TAGS heading, live only when tuned);
       ↻ a bare toggle like the player's, apart from the − / + stepper; and a true floating
       window (inset, all corners rounded, no handle), since it opens from the top of the screen.
       Then the **Up next strip went** (user asked what it was for): with an even weave it only
       restated the share line; from the pot it was a sample, not what would play; the player's
       queue view already shows what's next. The share line (8 px) is the summary's picture now.
     - **Repeats became automatic** (user, 2026-10-26, after asking why repeating didn't change
       a share): a share is a rate, repeats only how long a tag stays, and with the even weave
       the toggle only mattered in a hidden case (a lowered tag outlasting the others, leaving a
       tail of only it). Rule now: *every tag keeps its share for the whole shuffle, which runs
       until every song has played; a tag that runs out first goes round again.* Tags run out
       in order of their multipliers, so every tag above the lowest repeats (`repeatsIn`); a
       quiet, non-interactive ↻ marks them. Tuning is `{ refs, share }`; an old `repeats` flag
       is ignored when read. Untuned mixes (and a retune back to plain) shuffle plainly.
     - *Tag weights row* (section renamed from TAGS to say what the − / + do): the name, then a
       status line "6 songs · ×2 ↻" (weight teal when tuned, ↻ only when it repeats); the
       stepper is just − % +. Tried ↻ under the %, beside it, in place of the swatch, and in
       its own slot; the status line won because the mark sits with its cause and reads as
       something to observe, not press.
       The share line moved out of the summary to sit under the heading, right over the rows.
       Tried pinning "×2 ↻" to the line's right end so weights align; reverted: the weight reads
       better right after the count, and the slight misalignment is accepted.
     - *Songs, grouped*: the filter chips read as shuffle controls (chips mean ingredients
       elsewhere), so they're gone; the list is grouped under each ingredient (swatch, name,
       count) in the rows' order, a song under the one it counts for. Nothing to press but
       the songs, which still shuffle from that song.
     - *Window* (ui/play/DetailsWindow.tsx in ui/ExpandWindow.tsx, replacing PreviewSheet): Up next
       (40 blocks, two rows; the real queue from the player, a seeded sample from the pot), thin
       share line, a fixed line ("A plain shuffle" / "Tuned · Back to a plain shuffle", always
       there so tuning never moves the rows), a card per ingredient (− % ×n +, Repeats), then
       the song list with its filter chips.
     - Not done: no tuned mark on mix cards or in the player's pill text; Android Auto/lock
       screen unaffected (they just play the order).

## Playlist and metadata sources

| Source | Verdict |
| --- | --- |
| MediaStore audio columns | **Primary.** Via `expo-music-library`. Title, artist, album, track, duration, genre ID, album art — already parsed by Android's media scanner. |
| `.m3u` / `.m3u8` files | **Best for playlists.** Not audio, so MediaStore can't see them — needs SAF (`StorageAccessFramework`, `requestDirectoryPermissionsAsync`, `readDirectoryAsync`, all in SDK 57). |
| Folder structure | `getFoldersAsync` exists, but noisy — most people organize `Artist/Album`, which makes useless tags. Suggest, never apply. |
| Genre | **Available** via MediaStore `GENRE_ID` on Android 11+. Resolve names with `getGenresAsync`. |
| `MediaStore.Audio.Playlists` | **Dead.** Deprecated; under scoped storage an app generally only sees playlists it created. |

## Decisions made during the build

**Metadata comes from MediaStore, via `expo-music-library` 1.3.2.** Android's media scanner
already parses every file's tags; the old plan re-parsed file bytes in JS only because
`expo-media-library` (built for photos) doesn't expose the audio columns. Evaluated before
adopting: releases Feb and Jul 2026 with native compile gates on SDK 55–57; peer ranges cover
our exact versions; `id` is MediaStore's `_ID`, so it maps onto `media_id`; one paginated
cursor query per page with DRM filtering; all 14 JS-exposed functions are read-only (an
inherited `deleteAssets` exists in Kotlin but has no callers and no JS binding). It replaced
`expo-media-library`, `@missingcore/audio-metadata` (unmaintained since July 2024, no genre),
and the Metro shim that library needed.
Known gaps: no year or album artist (MediaStore has year; the library doesn't query it), genre
only on Android 11+, album-level art only, no file paths on Android 10+. Main risk is a single
maintainer at ~85 downloads/week — mitigated by MIT licensing and a small enough surface to
fork or vendor, and by the library it replaced carrying the same risk while already abandoned.
Peer range caps React Native below 0.87, so it will need a release before an Expo SDK that
moves to RN 0.87.

**Library data stays fresh by notification, not by wiring.** Every write to songs/tags calls
`notifyLibraryChanged()` (`src/db/changes.ts`); every view loads through `useLibraryQuery`,
which reloads on focus and on any notification. So tagging from the player updates the Library
tab underneath without either knowing about the other. Deliberately coarse — reloading a view
is cheaper than tracking which rows changed at this library size. **Any new write path must
call `notifyLibraryChanged()`**, or views go stale.

**Tag screen behaviors worth knowing.**
- The editor's text box: Enter adds the exact path match, else the only match, else creates
  what was typed. `a/b` creates nested tags (`ensureTagPath`, case-insensitive reuse). The
  catch: a literal slash can't be typed into a tag name (e.g. "AC/DC" becomes AC → DC);
  playlist import is unaffected since it doesn't parse paths.
- Suggestions with an empty box: recently applied tags (`song_tags.added_at`), and the song's
  MediaStore genre — a suggestion only, applied by tapping. If no top-level tag has the genre's
  name, the chip is drawn dashed with a `+` (`TagChip isNew`) under "New tag from this song's
  genre", because tapping creates it. (User was surprised by it creating a tag before this was
  marked, 2026-10-06 — **any suggestion that creates something must say so.**)
- **Adding songs from inside a tag** (`app/add-songs/[tagId].tsx`): one tap toggles a song in or
  out, no selection mode. **Changed 2026-10-18 at the user's request: taps only *stage*
  changes; a "Save" button (header, top right) applies them all in one transaction
  (`updateSongsOfTag`), and leaving with unsaved changes asks "Discard changes?"** (originally
  each tap wrote immediately, with no save step.) The status line under the search box is
  always one line: a hint, then "N songs to add · M songs to remove". Toggles the tag
  *directly*; songs under it only via a subtag show "in via <subtag>". On top, without a
  search: other songs by artists already in the tag, strongest-represented first
  (`suggestSongsForTag`). Save and the discard guard are shared with the multi-song tag editor
  as `useStagedSave` + `SaveButton` (`src/ui/`). The guard uses `usePreventRemove` from
  `expo-router/react-navigation` (SDK 57 shape: the callback gets `data.action`, re-run with
  `navigation.dispatch` once the guard is lifted). **SDK 58 migration (task 5b):** Expo says
  imports from that path may have moved, and `usePreventRemove` becomes a first-class
  `expo-router` export whose callback gets `repeat()` — switch to it then.
  Entry points, chosen to add no menu items: an empty tag's primary button is "Add songs"
  (instead of a disabled Shuffle); a tag with songs has "+ Add songs" on its Songs heading; and
  creating a tag from the Tags view opens it immediately.
- Tapping a song plays the list as shown (filtered or not) from that song, keeping the
  player's current shuffle mode.
- Delete reports its impact (`getTagDeletionImpact`); songs are never deleted. Move offers
  only valid parents (`buildTagIndex(...).validParents`, which excludes the tag's own subtree).
- Song rows (80 px), tag rows (60), and picker rows (64) are fixed height so lists can compute
  positions instead of measuring. **Always use `useFixedRowLayout`** for `getItemLayout`: React
  Native measures drawn rows from the top of the content *including the list header*, so
  offsets must include the header too — hand-written `rowHeight * index` is off by the header
  height, which can make long lists jump or flash blank when flung. Navigation goes through
  `src/navigation.ts` so paths live in one place.
- `src/screens/` exists because every file in `app/` becomes a route; screen-sized components
  that aren't routes live there.

**The player is built to be rearranged.** The design isn't final, so:
- *Logic never touches UI.* Queue rules are pure functions (`queue.ts`); the provider decides
  when to call them; screens only compose display components from `src/ui/player/` that take
  props and theme tokens.
- *Audio sits behind an adapter* (`engine.ts`), so the engine can be swapped — see open
  question 4.
- *Three contexts, not one*: actions (stable), now-playing (changes on skip), status (ticks
  twice a second). A widget subscribes only to what it shows, so a skip button never
  re-renders on a progress tick. Use `usePlayerActions` / `useNowPlaying` /
  `usePlaybackStatus`; `usePlayQuery` is the one-call "shuffle this query".
- *Theme tokens are type-checked* with `satisfies Record<string, TextStyle>`, and every text
  style takes its family from `typeface` — a serif is one value plus loading the font.
- The seek bar is hand-built on `PanResponder` rather than a slider package: no native module,
  no rebuild, fully restylable.

**Player behaviors worth knowing.** Repeat is a preference that carries across new queues.
Repeat-one only applies when a song ends on its own — pressing next still skips. Previous
restarts the song if more than 3 s in. Toggling shuffle never interrupts the current song. A
play is only counted once 30 s (or half a short song) has been heard, so skips don't inflate
the play counts smarter shuffles will weight by. Not yet done: persisting the queue across app
restarts, and auto-skipping a song that fails to load (it shows the error instead).

Fixed during device testing:
- **Lock-screen artwork must never be a `content://` URI.** expo-audio parses `artworkUrl`
  with `java.net.URL`, which rejects that scheme — and that rejected the *whole* lock-screen
  registration, which is also what keeps background playback alive. Now: register with text
  only, then add artwork from a `file://` copy cached once per album
  (`lockScreenArtwork.ts`). Its lock-screen calls look synchronous but return promises that
  can reject, so they're all guarded.
- **Track info is a fixed-height block**, and every font token sets an explicit `lineHeight`.
  Otherwise the controls shifted between songs: titles wrap to 1 or 2 lines, and Android sizes
  CJK text (rendered in a fallback font) taller than Latin at the same font size.

**Migrations are atomic.** Each entry in `MIGRATIONS` runs in one transaction with its
`user_version` bump. Without that, a crash mid-migration leaves a half-applied schema at the
old version, and every later launch fails re-running it ("duplicate column"). Never edit a
shipped entry — append. A test sabotages v2 halfway and checks the rollback restores dropped
columns.

**Scan rules worth knowing.** MediaStore placeholders (`Unknown Title`, `Unknown Artist`,
`<unknown>`) are stored as null, never as values — otherwise the matcher pairs unrelated songs
by "Unknown Artist". Clips under 30 s are skipped. A scan that sees *zero* songs doesn't flag
anything missing, since revoked permission or unmounted storage look identical to an empty
library.

**Playlist import rules.** Each playlist becomes a *root* tag. An existing root tag with the
same name (case-insensitive) is reused, so re-importing is idempotent. A playlist with no
matches creates no tag. The matcher never guesses: a shared filename with no metadata to
break the tie stays unmatched. The folder picker always opens (at the last-used folder), so
choosing a different folder is always possible.

**Tests run on Node, not Jest.** `node --experimental-strip-types` plus `node:sqlite` and
`node:test` means zero test dependencies. `tests/helpers/db.ts` adapts Node's synchronous
SQLite to the async slice of `expo-sqlite` the repositories use, so tests exercise the *real*
migrations and *real* repository code — no mocks, no schema copy that could drift. Everything
in `src/db` imports `expo-sqlite` as `import type` only, which is what makes this possible;
keep it that way.

**`tsconfig.test.json` is separate** because Node's type stripping requires explicit `.ts`
import extensions and the Metro build forbids them. `npm run typecheck` runs both projects.

**`tests/helpers/resolve-ts.mjs` is a Node resolve hook**, loaded via `--import` in `npm test`.
Node runs tests as ES modules, which can't resolve the app's extensionless imports or the
`@/` alias. This went unnoticed until task 4 because every earlier cross-file import was
type-only and got erased; `assets.ts` importing `titleFromFilename` was the first runtime one.
The hook keeps app code idiomatic, and as a bonus makes `@/`-importing modules like
`src/query/run.ts` testable too.

**No `babel.config.js` or `metro.config.js`.** SDK 57 applies `babel-preset-expo` internally,
and the default Metro config is sufficient now the shim is gone. The expo-router docs still say
to add a Babel config; doing so breaks the build unless you also install the preset.

**`.npmrc` sets `legacy-peer-deps=true`.** `expo-router` pulls web-only deps (`vaul` to
`@radix-ui/*`) whose `react-dom` peer wants React ^19.2.8 while Expo pins 19.2.3. Nothing in an
Android build uses them, but `npm ci` refuses to resolve — this is what made the first EAS
build fail during "Install dependencies". The lockfile was resolved under this setting.

**Permissions.** Generated manifest after the swap: `READ_MEDIA_AUDIO`, plus
`READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` both capped at `maxSdkVersion=32` — so on
Android 13+ the only storage permission is `READ_MEDIA_AUDIO`. The write permission comes from
`expo-file-system`, which stays (SAF, backup files). `recordAudioAndroid` is off, so no
microphone. `POST_NOTIFICATIONS` is listed by hand — the audio plugin only adds it for
background *recording*, but without it the media notification won't show on Android 13+.
`android.permissions` in `app.json` is additive; removing anything a plugin adds needs
`android.blockedPermissions`.

**Do not "upgrade" pinned versions.** RN 0.86.2 (latest 0.87.0) and React 19.2.3 (latest
19.2.8) are pinned by SDK 57, and `expo-music-library` caps RN below 0.87. TypeScript is 6.0.3
while 7.x exists; Expo's template pins 6.

## Running on a device

**Local tooling (set up 2026-10-25, working):** no Android Studio (its installer never
completed); command-line only. Microsoft OpenJDK 17 (`JAVA_HOME` = `C:\Program
Files\Microsoft\jdk-17.0.20.101-hotspot`), SDK at `C:\Users\fifth\Android\Sdk` (`ANDROID_HOME`;
platform-tools, emulator, cmdline-tools on the user PATH): platforms 36 + 37.0, build-tools
37.0.0, NDK 27.1.12297006, CMake 3.22.1 + 3.30.5. Emulator AVD `ProTag_API36` (Android 36,
Google APIs x86_64, WHPX acceleration, boots in ~1 min). Local builds:
`APP_VARIANT=development npx expo run:android --device emulator-5554` — first build ~14 min,
then ~1 min. Then `npx expo start --dev-client --scheme protag-dev`, `adb reverse tcp:8081
tcp:8081`, and open `protag-dev://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081`.
`adb exec-out screencap -p` for screenshots.
- **Gotcha: Windows 260-char paths.** The RN C++ build failed with "Filename longer than 260
  characters" from ninja 1.10.2 (bundled with both CMakes) although `LongPathsEnabled` is on.
  Fixed by replacing `ninja.exe` in both `cmake\<v>\bin` with ninja 1.13.2 from the official
  GitHub release (old ones kept as `ninja.exe.bak`). A newly installed CMake needs the same.
- **Signing:** local builds use the debug key, EAS builds their own, so a local ProTag Dev
  won't install over an EAS one: uninstall first (restore a backup after). ProTag (release)
  is a separate package and unaffected.
- The emulator has no music: push test files to `/sdcard/Music` and rescan.
- **Gotcha: the Claude desktop app is an MSIX package**, so Windows silently redirects
  everything it (and every command Claude runs, sandboxed or not) writes under `AppData` to
  `AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\`, invisible to other programs.
  The SDK first went to `%LOCALAPPDATA%\Android\Sdk` and only Claude could see it; moved to
  `C:\Users\fifth\Android\Sdk` (outside AppData). Never install tools under AppData from here.
- The Claude app's terminals only see a PATH change after the app restarts.
- Phone: Galaxy S24 (SM-S921W), Android 16, paired 2026-10-25 over wireless debugging (`adb
  connect <ip:port>`; the port changes each time it's switched on, and the phone's IP has
  been 192.168.0.235). If the shown port refuses connections, toggle Wireless debugging off
  and on. adb may list the phone twice (ip:port and an mDNS name): pass `-s`. Package
  listings warn about "user 150" (Secure Folder): harmless. Android Auto: the user tests it day to day; not automated.

**Two apps (2026-10-22):** `app.config.ts` makes the development build its own app, "ProTag
Dev" (`com.protag.app.dev`, scheme `protag-dev`) when `APP_VARIANT=development`, which the EAS
development profile sets. Release builds ("preview" via `npm run build:preview`, production)
are "ProTag" (`com.protag.app`). The first preview install replaces the old dev client (same
package and key) and keeps its library and tags; ProTag Dev starts empty (restore a backup).
`npm start` passes `--scheme protag-dev`: the QR's default `exp+protag://` link can open the
real ProTag (which then runs its own built-in version and never asks Metro for a bundle).

**Release check (preview build), 2026-10-22: all passed on the user's phone.**
1. Installs over the old dev build as "ProTag" with the right icon; library, tags, mixes intact.
2. Cold start feels quick; Songs list and Shuffle tab scroll smoothly with the full library.
3. Shuffle a mix, lock the phone: lock screen and notification show the song; next/previous and
   play/pause work there and from headphones. Leave it playing 10+ minutes, screen off.
4. Swipe the app away from recents while playing: playback and notification behave sensibly;
   reopening works.
5. Pot: tap, drag (haptics), combine, keep out, preview, tile glide; full player marquee.
6. Rescan, playlist import, backup Save and Share; later Restore that file into ProTag Dev.

EAS builds (below) still work and are how the real ProTag gets built; local builds (above)
are for fast native work like the playback engine.

The package is `eas-cli`, not `eas` (`npx eas ...` fails with "could not determine executable").

```bash
npm run build
```

(= `npx eas-cli@latest build --profile development --platform android`)

Keystore already generated and stored on EAS, so it won't re-prompt. Day to day:

```bash
npx expo start --dev-client
```

Connect from **inside** the ProTag dev-client app, not by scanning the QR with a camera — with
a custom runtime the dev server can't resolve the redirect. Rebuild only when native config
changes; JS and TS reload over Wi-Fi. Add `--tunnel` if the phone and PC aren't on the same
network, and check Windows Firewall isn't blocking port 8081.

## Tag weights in whole steps (2026-10-27)

Shares now step ¼ ⅓ ½ 1 2 3 4 5 6 7 8 (was doublings ¼…8). The user found exact ratios hard to reach with powers of 2; whole numbers and their mirrors make any simple ratio (3:2, 1:3) reachable. Old saved shares are all still on the scale.

## Play next dropped (2026-10-27)

Selection menu offers only Add to queue. Queued songs already play before the rest of the order, so Play next only differed in order among queued songs; the user found it redundant. `queueSongs` lost its `where` param.

## Header titles raised (2026-10-27)

Lora sits low in its line, so header titles read ~3px low beside the ×/back icons. Every stack header now renders its title via `HeaderTitle` (src/ui/stackOptions.tsx), raised 1.5dp; the tag page shares `headerTitleText`. Measured on the emulator: title centre now level with the icons.

## Pages from the player open over it (2026-10-27)

Tag/album/artist pages opened from the full player used to slide the player sheet down, open in the Library tab, and slide it back up on Back; the user found the vertical motion unnatural. Now they open in the root stack (`app/from-player/...`, re-exporting the Library screens), above the tabs and player: they slide in like any page and Back reveals the player as it was. Links on those pages stay there (`useFromPlayer`). Trade-off accepted by the user: tab bar and mini player are covered while there. `useBackToPlayer` removed.

## Queue button icon
The full player's queue button uses playlist-music-outline (MDI, as `queue` in Icon.tsx) instead of Ionicons' solid `list`, which looked out of place. Add to queue keeps playlist-plus.

## New tag row with a stand-in button
Tags tab: New tag is a row after the tags (NewTagRow in TagRow.tsx, a dashed empty slot), so with one tag the action sits beside it instead of far off in the corner. The floating + (Fab `shown`) stands in whenever the row is not wholly in view, above or below, so exactly one New tag is on screen. While selecting, the row dims in place rather than vanishing, to keep the layout still.

## Add menu items without the verb
The tag page's Add menu says Songs / Subtag: "Add songs" and "New subtag" repeated the button. The empty tag's standalone "Add songs" button keeps its verb.

## Details title lost its last word
A mix name like "kpop Driving" showed as "kpop" in Details on any opening after the first: Android reused a cached measurement of the shrink-to-fit title that came out a hair narrow, so the last word wrapped onto a hidden line. Not the line limit or the grow animation (both tested). Fix: the title fills its column, and the mix actions (Save as mix / Save tuning) are inline in its text, nudged down 6 to centre on the letters. Repro: fresh launch, open Details three times (scratchpad twice.sh).

## Release checklist (started 2026-10-27)

Plan: features frozen apart from themes → release candidate (preview build) → daily-drive it while a
closed test runs → production. Rules below were checked 2026-10-27 against secondhand sources;
re-check Google's own pages when setting up the account.

1. **Themes** — the user wants them in 1.0 (decided 2026-10-27). Scope/approach: see "Themes" when decided.
2. **Field-test the native engine** (merged): Bluetooth, the car (Android Auto prev/next fix needs a
   new build), a phone call mid-song (audio focus), long screen-off sessions, resuming after the app
   is killed. Anything odd is a blocker. Needs a fresh preview build of master; ProTag Dev also needs
   a new EAS development build (new native code).
3. **Tags survive upgrades**: install the current release, tag, then install the RC over it; check
   tags, colours, mixes, weights. Consider nudging new users toward backup export.
4. **Play Console account** (personal, $25). Accounts made after 2023-11-13 must run a **closed
   test with 12+ testers opted in for 14 continuous days** before applying for production access
   (internal testing doesn't count; organisation accounts with a D-U-N-S number are exempt). Longest
   step on the calendar: recruit testers early. The closed test doubles as the field test.
5. **App content forms**: privacy policy URL (short: nothing leaves the phone), data safety form
   (no data collected/shared), **foreground service declaration** for media playback (App content
   page; required when targeting Android 14+), content rating questionnaire, target audience.
6. **Target API**: currently 36 (RN 0.88); Play's yearly deadline is 31 Aug, so fine for a 2026
   release. Re-check in Play Console.
7. **Store listing**: confirm "ProTag" is free, short + full description, screenshots, feature
   graphic (1024×500), icon 512×512.
8. **Production build**: `eas build --profile production` (R8 is on for release builds; the preview
   build already passed with it). versionCode via EAS; versionName 1.0.0.
9. **Crash reporting**: none planned for 1.0 (local-first); rely on closed testers. Revisit.
10. **Post-1.0**: AI tag suggestions, tag search in Library.

## Themes, step 1: colours from a theme (2026-10-27)
Decided (user): dark + light for 1.0, following the phone by default (Settings: System / Dark / Light), switching live. `theme.ts` now has `palettes.dark` / `palettes.light` (light is a copy of dark until designed); tag colours are part of a palette (`colors.tag(name)` replaces `tagColor`). `ThemeContext.tsx`: `ThemeProvider` (reads `app.theme` from settings, renders nothing until read; the splash covers it), `useColors()`, `makeStyles((colors) => StyleSheet.create(...))` built once per palette, `useThemeChoice()`. Header options are `useStackScreenOptions()`. Converted with scripts (scratchpad themify.py / hooks.py) then by hand; dark checked unchanged on the emulator. Things that cache colours must keep tag colour *names* (DetailsWindow) or list `colors` as a dependency. Do not run prettier without `--single-quote --print-width 120` (no repo config; defaults switch to double quotes).

## Themes, step 2: light palette + Appearance setting (2026-10-27)
First light palette in theme.ts (warm paper #F6F2EA, ink text, deep teal #1F5E58 accent, tag colours a touch deeper); new `onTag` role for text on tag fills (was `bg`, which only worked dark). Appearance card (System / Dark / Light) at the bottom of Manage library; live switching checked on the emulator. **System does not follow the phone yet**: app.json pins `userInterfaceStyle: "dark"`, so Android always reports dark; unpinning it needs a native rebuild (fold into the pending ProTag Dev EAS build). Still to check in light: splash screen and Android nav bar colour, scrims, the pot with tag tiles, Details, popovers/menus, dialogs (system Alert dialogs stay system-styled).
- Light retune (user, 2026-10-27): ink softened to #35302A (near-black was harsh, esp. filled icons); tag colours brighter/more saturated (were dull in the pot); tonal buttons bolder (accentTint at 24%). Selected tag tiles took `bg` for their text too: now `onTag`.
- Native side done (2026-10-27): app.json `userInterfaceStyle: "automatic"` (was pinned "dark") and the splash follows the phone (paper #F6F2EA light, #151413 dark, same teal mark). Checked on the emulator with a local build: both splashes, and System following the phone live. The splash follows only the *phone* (it shows before JS), so a Light pick on a dark phone gets a dark splash first. App icon unchanged (beige; Android 13+ themed icons use the monochrome layer). Needs the next EAS build to reach the phone.

## Settings open over the tabs (2026-10-27)
Manage library and Folders moved from the Library tab stack to the root stack (`app/settings/index.tsx`, `app/settings/folders.tsx`; `/settings`, `/settings/folders`). User: the Library tab remembering where you were is right for browsing but not for settings, a detour. Over the tabs there is no tab bar to leave by, so Back returns to where you were. Checked on the emulator. Library still remembers its place otherwise (in memory; a cold start resets it).

## Tags handle at the bottom (2026-10-27)
User idea: only the tag list has a handle. The divider is now the top of the tags sheet: put away, the sheet rests with only its handle showing at the bottom of the Play page (above the mini-player), the mixes taking the page down to it; building, it sits under the pot as before. Up: tap the pot, tap the handle, or swipe it (follows the finger; past SWIPE or flicked it rises on from where the finger left it via `risenBy`, else springs back). Resizing the pot (hold-drag) only while building (`resizable`); at rest the pot keeps that size. Watch: handle sits right above the mini-player (both take an upward swipe); checked on the emulator that a swipe from the handle raises the tags, not the player.

## The pot: teal band, dark recess (2026-10-28)
User wanted the pot less generic. Explored (mockups in scratchpad: pot-identity-options.html, pot-green-options.html): a share strip (tried, then dropped by the user as not adding to the pot idea), Shuffle as the pot base, a sunken well by colour alone. Landed on: the Play tab header + pot section as one teal band (`potBand`), the pot a dark-teal recess cut into it (`potRecess`, edge `potEdge` lights while building), Shuffle its own cream button under it (`potButton` / `onPotButton`), Save as mix the bookmark beside the clear button. Pot roles have the **same values in both schemes**: the pot is an object with its own colours, so it still reads as a pot in light. Play sets a light status bar while focused; the player sheet sets the scheme one while open. Settings: gear also on the Play band (hidden while editing a mix, where that corner is the check); "Manage library" renamed "Settings" (`openSettings`).
- Search field (2026-10-28): filled pill (`surface`, `radius.pill`), no outline at rest; a 1.5px `accentFg` outline while focused (always present, colour only). Fixed height so the clear button cannot grow it.
- Play header band set in the Play stack layout (2026-10-28), not the screen: teal from the first frame (no flash while loading) and on the no-music empty state; the screen only overrides title and corners (editing). The light status bar is set by the outer PlayScreen for every state.
- Recess and Shuffle follow the scheme (user, 2026-10-28): a white button in dark and a dark hole in light were too jarring. Dark: recess and Shuffle dark teal (#0B1F1C), pale text. Light: both paper (#F6F2EA), Shuffle text teal, lit edge pale teal. Band stays teal in both. New role `onRecess` for content in the recess (join ×, hovered ring, landing wash).
- Play band rounded at the bottom (24px) so it sits like a shelf (user liked). A teal-tinted page under it (`playBg`) was tried and reverted (user, 2026-10-28). Shuffle keeps the recess colours (user chose clean over standing out).
- Notification small icon (2026-10-28): `protag_notification_icon` (vector from logo.svg, cropped to the mark, 1.5dp room) set via `DefaultMediaNotificationProvider.setSmallIcon` in PlaybackService. Native: needs a rebuild (EAS for the phone). Seen in the media player in the shade on the emulator (API 36); stock Android does not put media sessions in the status bar, some phones (e.g. Samsung) do.

## Crash on saving tags from a Library selection (release only) — 2026-10-28
Symptom: select songs (e.g. Not tagged yet) → Tag… → Save: change saved, app closed, every time on the phone (preview build); fine in dev. Saving from the player did not crash. Release log: `IllegalStateException: The specified child already has a parent` in `ScreenStackHeaderConfigViewManager.onAfterUpdateTransaction` (react-native-screens). Cause: saving notifies the library; the Library ends its selection and swaps its header (selection header → Library header) while the tag editor is closing over it; a header update landing during that animation crashes. Ruled out on a local release build (ProTag Engine, `scratchpad/rate.sh`): only adding/removing header slots (an always-present empty left slot cut it to 2/6, not 0), the custom HeaderTitle (still 4/8 without it); no reliable "editor gone" event (the editor unmounts before its closing transitionEnd, and the covered (tabs) screen gets none for a modal). Fix: `useStagedSave` waits two frames after `apply()` before leaving, so the header update lands before the close starts: 0/10. No unit-test seam (native timing in release); repro is the release loop. Note: android/ is currently prebuilt for the engine variant; prebuild for development before a local ProTag Dev build.

## Drag to select songs — 2026-10-28
Press and hold a song, then slide (Google Photos style): every row passed over goes the way the held one did (selected, or unselected if it already was); sliding back restores rows to how they were before the drag; holding near the top edge, or near the selection bar at the bottom, scrolls the list. `src/ui/hooks/useDragSelect.ts`, used by all four song lists (Tags tab's loose songs, Songs, tag pages, album/artist pages). The row under the finger is arithmetic (fixed row height + header height from `useFixedRowLayout`), so no measuring. Touches are watched with `onTouchMove`/`onTouchEnd` on a View wrapping the list (they reach every ancestor), so the held row keeps its press; the list's `scrollEnabled` is off during a drag so the native ScrollView can't take the gesture. Tried on the emulator (dev build) with `scratchpad/drag.sh` (adb `input motionevent` hold-then-slide): range, unselect, edge scroll, scrolled list, Tags tab header. Not yet tried in a release build or on the phone.

## Sleep timer and equalizer — 2026-10-28
- Sleep timer: moon in the full player's top row (filled + accent while set); menu of 15/30/45 min, 1 hour, End of song, and Turn off timer while set; its header says "Pausing in N min" / "Pausing after this song". Runs natively (`Sleep.kt`, beside the player) so it still fires with the app swiped away; the last 10 s fade the player's volume, then pause and restore volume. End of song uses ExoPlayer's `pauseAtEndOfMediaItems` (cleared once it pauses; Play then carries on with the next song). JS reads/sets it via `src/player/sleepTimer.ts` (`onSleep` event + `getSleep`). Tried on the emulator: end of song pauses at the end and Play continues; a timer (temporarily 15 s) paused on time and cleared. The fade itself wasn't heard (emulator).
- Equalizer: Settings → Sound → Equalizer opens the phone's own (`ACTION_DISPLAY_AUDIO_EFFECT_CONTROL_PANEL` with the player's audio session; the session is announced with `ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION` when the player is made). Manifest `<queries>` lets Android 11+ see whether one exists; without one the button is disabled with a line saying so. Emulator: opens Android's MusicFX. On Samsung expect SoundAlive.
- Native: needs a new build. android/ is now prebuilt for the **development** variant.

## Subtag chips carry their place — 2026-10-28
User's view: a subtag means something only inside its parent (kpop › gen 4, gen 5), so a chip reading just "gen 4" loses that. Chose (after discussing showing every ancestor as its own chip, and a context-free rule) `src/library/songChips.ts` `chipsFor`: the top of the chain always shows, the tag itself always shows, subtags in between only if some song is tagged with them directly (organising-only middles are skipped, the user's rule, applied to subtags only since top-level tags are always meaningful); a tag another of the song's tags sits under is dropped; on a tag's page that tag and what's above it are a given ("gen 4" on kpop's page, nothing on gen 4's own). The prefix shows fainter in the chip. Used by every song list (`listSongChips`) and the player (`getSongChips`). Unit-tested in tests/songchips.test.ts. Seen on the emulator: Songs tab "kpop › gen 4", kpop page "gen 4" (plain kpop songs no chip), player "kpop › gen 4". Storage unchanged: only directly applied tags are stored, ancestors implied. Known: a middle subtag's chip text can change when some unrelated song gets tagged with it directly (rare, deeper trees only).

## Pin mixes — 2026-10-28
Hold a mix → Pin / Unpin (first in its menu). Pinned mixes lead the shelf, most recently pinned first; the rest keep their order (oldest first). A small filled pin before the name says why it's there. Stored as a setting (`mixes.pinned`, JSON ids, newest first), not a column: no migration, and a deleted mix's id just never matches. Not in backups (minor). Ordering unit-tested (tests/mixes.test.ts); pin/unpin and the mark seen on the emulator (only one mix there, so the ordering itself only in the test).

## Select tags like songs; arrange them — 2026-10-28
Hold a tag (Library Tags tab, or subtags on a tag's page) to select it; tap or slide (useDragSelect, now for any `Selection`) to pick more. While selecting, each tag row shows a ≡ handle (drag to reorder among siblings; TalkBack adjusts by one) and a check over its folder. Bar (`TagSelectionBar`): Add songs (one tag only), Move to… (several at once; places they're all in already are greyed; failures listed), Delete (one confirmation, `getTagsDeletionImpact` counts subtags/songs once). Tags and songs are never selected together: the other kind dims (SongRow/TagRow `disabled`). The generic part of selection moved to `useSelection` (header, Back, select all); `useSongSelection` builds on it.
Order: `tags.sort_order`, numbered from 1 by `setTagOrder`; 0 = never arranged (A–Z). A tag created in or moved into arranged siblings goes last; into un-arranged ones it stays A–Z. Arranging switches the Play tab's tag sort from A–Z to the new "Your order" (third in the label's cycle); the Play tab now follows its stored sort on reload. Not done: auto-scroll while dragging a tag by its handle (long tag lists need two drags); arranging on the Play tab itself (hold there picks a tag up for the pot).
Seen on the emulator: hold → "1 tag selected", handles, songs dimmed; handle drag lofi to top; slide over three; Move to… under kpop and back; subtags on kpop's page; the reverse exclusion; Play tab "Your order". Delete not tried there (same deleteTag as the tag page). Unit tests: ordering rules (tags.test), multi-delete impact, "Your order" sort.
- *Fix, same day (user: "the tag being swapped slides underneath")*: the dragged row was moved by switching its own transform from its step-aside animation to the finger's; on Android that switch didn't take, so it stayed put while its neighbour slid under it (the drop itself was right). Now, like the player's queue, a floating copy follows the finger and the row underneath goes invisible (keeping the touch on its handle). Seen on the emulator mid-drag and after the drop.
- *Fix, same day (user: brief flash and a jump when dropping just past the swap point)*: the floating copy vanished wherever the finger left it, and the reorder (React layout) and the rows' step-aside offsets (native animation) reset in different frames. Now rows stand absolutely by place (`Placed`, sliding when their place changes), the dropped tag glides into its place first, and only then does the order change, when every row already stands where the new order puts it. Checked with a screen recording (scratchpad drop.mp4 → frames): the glide shows, no jump; ~15 fps can't rule out a single-frame flash, so the phone is the real check.

## Contrast fixes (design review, apple-design skill) — 2026-10-29
Review found text below WCAG AA 4.5:1. Fixed: `textFaint` is now for non-text only (chevrons, quiet icons, checkbox outlines, disabled items; they need 3:1 and get 3.2–3.8); its 27 text uses (counts, section heads, captions, "2 of 28", placeholders, status lines, inactive tab labels, chip counts) moved to `textDim`; chip prefixes too, set apart by a lighter weight. Light `potHint` → #665F55. `accentFg` nudged so tonal-button labels pass on their tint: dark #3AA593, light #0F5C54. Selected rows use a new `selectedTint` (light #17695F28, lighter than `accentTint`) so the artist line reads on them; tonal buttons keep their stronger tint (user asked for bolder ones). Now, lowest pair 4.52:1 (light artist line on a selected row); all listed in the commit's session. Not yet looked at on a screen (emulator closed): next build.
Still open from the review: row heights at the largest font scale (fixed 80/72/56 px, chips 20 px; check on the phone at max font size), reduce motion (only Marquee honours it), "Tag…" vs "Tags…" for the same editor, raw Media3 error text in the player, 44 vs Material's 48 dp targets, teal used widely.

## Reduced motion — 2026-10-29
`src/ui/motion.ts`: tracks Android's "Remove animations" (AccessibilityInfo reduce motion) once for the app; `timing`/`spring` are drop-ins for Animated's that finish at once when it's on; `useReduceMotion` for render-time choices (Marquee now uses it). Rule: what the app moves by itself snaps; what follows a finger still follows it (HIG: tracking gestures is fine), and its settle after release snaps; pure fades stay (they're the stand-in for movement). Switched: pot tile glide and the "more" pill, the tags sheet rise/flick and nudge, the tags browser slide, divider springs, mini-player spring/slide-out, FAB extend/appear, FAB menu, tag-list glide and slots, queue shifts. Two big transitions fade instead of snapping: the player sheet (fades in where it opens, out where it is; a released drag just settles) and ExpandWindow/details (fades at full size instead of growing from the anchor). Android itself handles screen pushes, modals and the bottom sheet. Checked on the emulator with the animation scales at 0 by screen recording: player open/close fade in place, details window fades at full size. New animations: use motion.ts's helpers.

## Review leftovers: one label, plain playback errors — 2026-10-29
- The tag page's selection bar said "Tags…" while every other song list said "Tag…" for the same editor; now "Tag…" everywhere.
- Playback errors: the native status now also sends `errorCode` (Media3's errorCodeName, stable); `src/player/playbackErrors.ts` turns it into words for the listener (file missing → rescan in Settings; no permission; damaged/unsupported format; audio output; otherwise "couldn't be played, press play or skip"), and the raw message and code go to the log. The player shows just that sentence. Unit-tested; Kotlin compiled; not seen with a real broken file. Needs a native build for the specific messages (an older build falls back to the general one).

## Largest font size — 2026-10-29
User's phone at max font: tag rows pushed the count out, song rows couldn't fit title/artist/chips, Library tab labels sat a few px high. Emulator at font_scale 2.0 also showed the "Library" title's descender cut, the player's queue rows losing the artist line, and the player's title/artist block clipped. Causes: fixed row heights (kept for smooth long lists), compact chips at a fixed 20 px, and tab labels with no line limit wrapping in a quarter-width cell at fixed height (centred two lines push the first up).
Fix: `useScaledHeight(base, text)` (src/ui/hooks): a fixed height that grows with `fontScale` by its text lines; used for song rows (80, 48 + the chips line), tag rows (72, 34), queue rows (56, 34) and the player's title block; lists' getItemLayout, drag-select and TagList slots use the same values. Compact chips have minHeight, not height. Navigation text (header titles, Library tab labels) is capped at `navTextScale` 1.3 and one line (HIG typography: people don't expect tab titles to grow). Seen at 2.0 and 1.0 on the emulator. Not checked at large sizes: the add-songs picker rows, details window rows, music picker rows (also fixed heights).

## Tag list flashing when the mini-player is swiped away — 2026-10-29
User (preview build): swiping the mini-player away showed the Play tab's tag list for a moment. Cause: the tags sheet was laid over the whole area under the pot (top 0, bottom 0) and pushed down by `below - DIVIDER_HEIGHT`, with `below` measured by onLayout. When the mini-player goes, the area grows at once but `below` only updates a frame later, so the sheet sat one mini-player's height too high for that frame. Fix: anchor the sheet to the area's bottom at the last measured height; pushed down by its own height less the handle, it rests right whatever the measurement says. Screen recordings couldn't isolate the single frame (frames are written only when something else changes), so this rests on the reasoning; resting and raised positions checked on the emulator. Open while the area changes size, the sheet could show a one-frame gap at its top (not seen; rarer).
- *Fix, 2026-10-29 (user saw "generation › gen 4", generation organising-only)*: on a tag's page the chain left after the page's tag kept its first element unconditionally (`i === 0`), so an organising subtag right under the page's tag always showed. Now the rule is literally "top-level tags always show" (`parent_id === null`), so it holds on pages too. Regression test added (fails on the old code).

## Welcome on first launch — 2026-10-29
User asked for a welcome with slides on the core ideas. Chose (user): full-screen pages, starter tags after the first scan, build straight away. Grounded in HIG onboarding.md: brief, skippable, shown once, replayable ("How ProTag works", Settings › Help), the permission request inside it (ProTag can't work without the music), and pictures made from the app's own pieces.
`src/ui/welcome/`: `WelcomeProvider` (root layout, over the navigator) shows it when `app.welcomed` is unset and there are no songs; with songs already (an update) it's marked seen silently. `WelcomeFlow`: four slides (Tags, not playlists · Tags can hold tags · Mix them into a shuffle · Your music, your tags), dots, Skip, Back goes back a slide; the last slide's Find my music runs the scan in place (progress, denied → Allow/Open settings, none found → Done); found songs → "Start with a few tags" (chill, workout, driving, focus, party, sleep, sad, happy; none preselected) → creates them and opens the Library, where "Not tagged yet" is the next step. Replay ends with Done. Its own StatusBar (the Play tab's light one was underneath). Art in `WelcomeArt.tsx` (Appear uses motion.ts, so reduced motion holds).
Tested on the emulator: replay from Settings (4 slides), true first launch after `pm clear` (welcome by itself → permission in context → scan 28 → starter tags → Library with chill/driving), relaunch doesn't show it again. Emulator dev DB backed up and restored around it (scratchpad devdb_backup).
- *Welcome, round 2 (user)*: Next/Skip/Done have icons (Button gained `iconAfter`, for Next's arrow). Slide 1 is the real `SongRow` (left-aligned, as in the Library), its chips arriving one at a time. Slide 3's pot drops the "each adds songs / both at once / kept out" captions for "show, don't tell": tiles shaped like the real pot's (40 px, half/full width, fused × for joined, ring + minus badge for kept out) arrive one per step, and the band's title is the mix's name from the app's own `describeQuery` ("chill + rain + kpop × driving, not sad"), growing as they land. Slide 4 is a big music folder instead of the logo. `useSteps` paces the stories (all at once with reduced motion). Starter tags unchanged (user liked them).
- *Welcome, round 3 (user)*: slide 2's example is broader than kpop: workout (open) › running (open, showing Eye of the Tiger with its "workout › running" chip) and lifting; TagRow gained `open` (arrow points down). Copy is the user's: "Tags are also folders, so you can nest them. A song in a subtag counts as part of its parent tag too." The pot's joined pair is pop × driving. Slide 4's folder has no note and some depth: built from Views (back + tab, two papers, front cover tipped open on a bottom hinge, the whole turned with perspective), teal like the band; not strictly isometric (true isometric art would want SVG, i.e. react-native-svg, a native dependency). Checked in both themes.

## 2026-10-29 Welcome wording
Slide 1: "Tag songs with whatever fits them: a mood, a moment, a genre. Each song can have any number of tags." Slide 2 uses the user's "which means you can nest them". Slide 3: "Add tags to the pot to hear their songs mixed together. Drop one tag on another for only songs with both, or keep a tag out entirely." (Avoided "merge": reads like either/or; "keep out" matches the pot's own words.)

## 2026-10-29 Welcome pot ends saved as a mix
MiniPot gets a fifth step: the full pot is saved, title becomes "Rainy commute" with a filled bookmark. Not checked on screen (adb hung; stale adb server from 10-28, kill denied). Phone ProTag Dev is a pre-10-28 native build: getSleep missing, errorCode undefined; every song failed with "Source error" there too, cause unknown (permission revoked? stale DB?).

## 2026-10-29 Sleep timer moves into the queue
Top-row moon removed (user wanted close · source · queue symmetry back; a bottom utility row was rejected for shrinking the artwork). SleepRow (was SleepButton) sits above the queue list: "Sleep timer · Off / 23 min left / End of song", same menu; ticks every 15 s. Queue button wears a small moon badge while a timer is set. Not checked on screen (adb still hung).

## 2026-10-29 Sleep timer opens in place
User picked design A (inline choices) with C's waning moon as the icon. SleepRow: header toggles open; chips 15/30/45 min, 1 hour, End of song, Off (when on); picking closes it. While a timer runs: a moon (accent disc with a surface-coloured disc sliding over it) wanes and a 3px bar drains. Total length kept in a module variable (native only knows remaining); after an app restart it falls back to the shortest choice holding what's left.

## 2026-10-29 Sleep timer as a scrub bar
User found the chips/waning moon underwhelming; asked for a bar to drag or tap, snapping, with End of song at the end. SleepRow is now always shown in the queue: stops Off · 15 · 30 · 45 · 1 h · ♪ (end of song), evenly spaced; drag snaps live with a Clock_Tick haptic (feelStep), set on release; tap jumps. Off→1 h is a time line, so a running timer's thumb slides back towards Off as it counts down; this replaced the waning moon and drain bar and the setForMs guess. Bug found on the emulator: drags starting at Off failed because the bar's touch area began at the Off stop's centre; it now reaches the card edges (INSET padding).

- 2026-10-29: Sleep bar's end-of-song mark is the Ionicons note (15) centred under its stop, not a ♪ glyph right-aligned in caption text.
- 2026-10-29: Sleep timer folds to one line by default (moon, status, chevron); tapping opens the bar in place, fading down. Starts closed each time the queue opens; stays open after setting so you see the result.
- 2026-10-29: Sleep timer folds itself 600 ms after a drag or tap sets it (screen-reader steps leave it open).
- 2026-10-29: Sleep timer slides open and shut (height 0 to the bar's measured height, 220 ms ease-out, with a fade), the queue moving with it. The bar is laid out absolutely inside the clip: in the flow it measured 0 while the clip was 0 tall.
- 2026-10-29: Renamed ProTag to Protag everywhere a person reads it (app names, in-app text, the notification title, comments). Kept: app IDs com.protag.app*, the backup marker app: "ProTag" (old backups must still import), code names like ProTagPlayer, the repo folder. Shows on the phone from the next build.
- 2026-10-29: Library keeps up by itself. Native LibraryWatch: a ContentObserver on MediaStore audio (2 s settle, event onLibraryChanged) and libraryStamp() = version:count:max id:max date_modified, one cursor pass. JS libraryWatch.ts: scanNow() single-flights every scan and stores the stamp taken before it; useLibraryWatch() (root layout) checks on launch, on return to the foreground and on the event, and scans only when the stamp moved, never before the first scan or without permission. Old builds without libraryStamp skip it. Tested on the emulator: a copied-in song appeared and a deleted one went missing within seconds, no taps. Settings info text updated.
- 2026-10-29: Sleep bar flicked back to the old stop for a frame on release: the bar fell back to the timer state, which only updated on the native onSleep event. useSleepTimer now sets its state at once; the event confirms.
- 2026-10-29: Play tags panel flashed up (folded) or shifted (open) when the mini-player came back. Cause: reveal ran on the native driver, so a new outputRange (from the re-measured area) could land a frame before the matching height commit. Fix: reveal on the JS driver (offset and size change in one commit), anchored to the edge it rests at (bottom folded, top open) so a lagging measurement still places it right; the swipe-to-fold pull moved to an inner view to stay native. Tried first: translateY percentages, but native transforms read numbers only. Emulator never showed the flash; open and folded respawns and swipe-to-fold checked by screen recording.
- 2026-10-29: Swiping the mini-player away left an empty gap for a quarter second: its slot stayed reserved through the 150 ms slide and only closed on hide. Now the slot closes (height 0) as soon as the swipe commits and the card finishes its slide absolutely positioned over the page, behind the tab bar going down. Not a dev-build issue.
- 2026-10-29: Open question for the next preview build: a few frames of re-layout remain when the mini-player is swiped away (pages end where it begins, so they resize and draw the uncovered strip). If noticeable in release, move to an overlay layout: pages run to the tab bar, mini-player floats over them, lists get end padding while it shows, Play's tag handle lifts above it.
- 2026-11-02: Tagging after the field report (15 tags, ~150 songs; the main long-term flow is download songs, then tag them). Mock-ups in docs/mockups/tagging-flow*.html (rows vs chips vs tiles; the user picked chips and rejected tiles as clunky).
  - Tag editor is chips (TagChipFlow): filled = on for every song, half filled = some, outlined = none. A tag with subtags opens while it shows as on, its subtags on an indented line under the line it sits on (lines packed in JS from measured chip widths, so lines above never move). A parent shows as on when a subtag is (shownMark). tapTag: on → off with its subtags; off having started partial → back to as it was; else on, and a parent turned on this visit on the way down reverts, so "kpop" + "gen 4" saves as just "gen 4". Search flattens to the matches with their paths.
  - Sort label in the editor (Your order default · A–Z · Most used · Colour), remembered (editTags.sort). Default is Your order so chips stay put between visits; Colour lets recolouring act as loose grouping. User wants sort/group options on every long list eventually; SectionHead's label is the building block to reuse.
  - Inbox: "Not tagged yet" left the Tags page for its own page (library/to-tag, newest first, select then Tag…). A card leads there on the Tags and Songs pages (not Artists/Albums: browsing, not a to-do), and the Library tab carries the count as a badge. "Not now" (inbox.dismissed = newest untagged id) hides card and badge until a newer song arrives; tagging everything hides them too. Dismissed, a quiet "Not tagged yet · N" row ends the Tags page.
  - Removed: the row editor (TagCheckRow), listRecentTags and the recent/genre ordering. Kept: Enter ticks the match or creates, genre create row, typed new tags (now chips).
  - Checked on the emulator: badge, card, inbox page, editor opening down the tree, saving only gen 4, packing, Colour sort, Not now and the fallback row.

- 2026-11-02: The inbox reminder is one line, "N untagged songs" with Not now; the row left after dismissing says the same.
- 2026-11-02: A chevron after "N untagged songs" says the line opens somewhere; the ✕ alone at the edge dismisses.
- 2026-11-03: Tag editor: a family chip is split, the name tags and the › opens a tray under its line (tinted in its colour, nesting three deep, flat below that). A parent on only through a subtag shows dashed, "on via gen 4". Families the songs already reach into start open. Sorts gain Family (a section per family, the rest under Other); Colour now starts each colour on its own line. Typing a nested new tag drops a parent turned on this visit, as tapping a subtag does.
- 2026-11-03: No dashed chip or "on via" note for a parent on through a subtag: it shows filled, like any tag the songs are in.
- 2026-11-03: Library Songs, Artists and Albums get the sort label (SectionHead, with the count as its label), each remembered under its own key (library.songsSort/artistsSort/albumsSort). Songs: A–Z · Artist · Album · Recently added · Most played; Artist and Album keep each album together in track order, unknowns last. Artists/Albums: A–Z · Most played · Recently added (A–Z first, as before). Sort only, no group headers, so rows keep fixed heights. Tags page left as is for now (its drag handles only make sense in your order). The editor keeps all five of its sorts: the user picks one that suits their library and masters that.
- 2026-11-03: The Library's Tags page gets its sort label too: Your order · A–Z · Most used · Most played (library.tagsSort, Your order by default). One choice covers the top level and every tag's subtags ("Subtags · …" on a tag page, shown from two subtags up). Drag handles show only in Your order; in the others, selecting still works, there's just nothing to drag.
- 2026-11-03: The sort label sits at the far end of its row (before Play's search button), the section's name or count alone on the left, no "·" between: what you're looking at on the left, what changes it on the right. One change in SectionHead, so the Library, tag editor and Play tab all move together.
- 2026-11-03: Manual tag order removed: the user added it expecting use it didn't get in practice. Gone: the drag handles and their glide (TagList is now plain rows with slide-to-select), setTagOrder/placeAtEnd, and "Your order" from every sort list. Tags sort A–Z · Most used · Most played, on the Play tab and in the Library alike (TagSort), A–Z by default; the editor is A–Z · Most used · Colour · Family, A–Z by default and within each colour. A saved "custom" falls back to A–Z. The sort_order column stays, unused (no migration, backup format unchanged); tag queries order by name. If someone asks for it back, a "Pin to top" would cover it with far less.
- 2026-11-03: Save is a bar, not a header pill (SaveBar replaces SaveButton): bright teal (accentFg, page colour as ink), full width at the bottom, rising once there's something to save and saying what it will do ("Save · 1 tag to add", "Save · 2 songs to add"); gone when there's nothing. The old pill was a dark fill barely different from its tonal resting state, in the far corner, with its summary as separate text. The status lines under the search fields are back to the hints. Tag editor and Add songs alike; leaving with changes still asks to discard.
- 2026-11-03: A tag on some of the selected songs shows how many instead of a half fill: lightly tinted, "gen 4 2/3". A tag that started partial keeps its count all the way round its taps (3/3, 0/3, back to 2/3), so its width never changes. Chips now start from how many songs each tag reaches, itself or through a subtag (countReach), so kpop shows full when every song is in it, even through different subtags; tapTag takes that shown mark from the editor. Mock-ups: docs/mockups/partial-chips.html (count beat fill-by-share and stripes).
- 2026-11-04: Pot tiles sit closer: 6 between them (was 12) and 6 in from the tray's edge (was 10). A kept-out tile's ring is thinner (1.5, with a 1 gap) so it still clears its neighbours and the edge.
- 2026-11-04: Privacy policy written (docs/privacy-policy.md) and published as a public gist under BleakBubbles: https://gist.github.com/BleakBubbles/be05fdba361750f4301e81fa13a690ac — use this URL in Play Console. Developer name BleakBubbles, contact BleakBubbles193@gmail.com (user's choice; 2FA on all accounts tied to it). Edit the gist in place to update it, so the URL stays the same.
