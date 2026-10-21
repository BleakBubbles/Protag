import test from 'node:test';
import assert from 'node:assert/strict';

import type { Asset } from 'expo-music-library';

import { freshDatabase, insertSong } from './helpers/db.ts';
import { distinctAlbums } from '../src/library/mixArt.ts';
import { findSongs } from '../src/query/run.ts';
import { getTagsForSong } from '../src/db/tags.ts';
import type { ScannedSong } from '../src/db/songs.ts';
import { albumArtUri, MIN_DURATION_MS, toScannedSong } from '../src/library/assets.ts';
import { completeScan, recordScanPage } from '../src/library/ingest.ts';
import { baseName, entryLabel, folderLabel, parseM3u, playlistNameFromUri } from '../src/library/m3u.ts';
import { normalize, SongMatcher } from '../src/library/match.ts';
import { importPlaylistAsTag } from '../src/library/playlists.ts';

// ---------------------------------------------------------------- asset mapping

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: '101',
    filename: '01 - Ditto.mp3',
    title: 'Ditto',
    artist: 'NewJeans',
    albumTitle: 'OMG',
    albumId: '7',
    genreId: '3',
    trackNumber: 1,
    uri: '',
    contentUri: 'content://media/external/audio/media/101',
    availability: 'local',
    duration: 185.5,
    mediaType: 'audio',
    width: 0,
    height: 0,
    creationTime: 1_700_000_000_000,
    modificationTime: 0,
    ...overrides,
  } as Asset;
}

const genres = new Map([['3', 'K-Pop']]);

test('maps a MediaStore asset to a song row', () => {
  const mapped = toScannedSong(asset(), genres);
  assert.ok(mapped.ok);
  assert.deepEqual(mapped.song, {
    mediaId: '101',
    uri: 'content://media/external/audio/media/101',
    filename: '01 - Ditto.mp3',
    title: 'Ditto',
    artist: 'NewJeans',
    album: 'OMG',
    albumId: '7',
    genre: 'K-Pop',
    trackNo: 1,
    durationMs: 185500,
    addedAt: 1_700_000_000_000,
  });
});

test('placeholder metadata is treated as missing, never stored as a value', () => {
  const mapped = toScannedSong(
    asset({ title: 'Unknown Title', artist: '<unknown>', albumTitle: '  ' }),
    genres
  );
  assert.ok(mapped.ok);
  assert.equal(mapped.song.title, 'Ditto', 'falls back to the filename');
  assert.equal(mapped.song.artist, null);
  assert.equal(mapped.song.album, null);

  const unknownArtist = toScannedSong(asset({ artist: 'Unknown Artist' }), genres);
  assert.ok(unknownArtist.ok);
  assert.equal(unknownArtist.song.artist, null);
});

test('skips clips, unplayable items, and items with no uri — and says why', () => {
  const short = toScannedSong(asset({ duration: MIN_DURATION_MS / 1000 - 1 }), genres);
  assert.deepEqual(short, { ok: false, reason: 'too-short' });

  assert.deepEqual(toScannedSong(asset({ availability: 'cloud' }), genres), {
    ok: false,
    reason: 'unavailable',
  });
  assert.deepEqual(toScannedSong(asset({ contentUri: null, uri: '' }), genres), {
    ok: false,
    reason: 'no-uri',
  });
});

test('unknown genre ids and junk track numbers become null', () => {
  const mapped = toScannedSong(asset({ genreId: '99', trackNumber: 0 }), genres);
  assert.ok(mapped.ok);
  assert.equal(mapped.song.genre, null);
  assert.equal(mapped.song.trackNo, null);
});

test('album art comes straight from MediaStore', () => {
  assert.equal(albumArtUri('7'), 'content://media/external/audio/albumart/7');
  assert.equal(albumArtUri(null), null);
});

// ------------------------------------------------------------------ ingest

function scanned(mediaId: string, overrides: Partial<ScannedSong> = {}): ScannedSong {
  return {
    mediaId,
    uri: `content://media/external/audio/media/${mediaId}`,
    filename: `${mediaId}.mp3`,
    title: `Song ${mediaId}`,
    artist: 'Artist',
    album: null,
    albumId: null,
    genre: null,
    trackNo: null,
    durationMs: 200000,
    addedAt: null,
    ...overrides,
  };
}

test('a rescan refreshes metadata in place, so tags survive', async () => {
  const db = await freshDatabase();
  await recordScanPage(db as never, [scanned('1', { title: 'Old title' })], 1000);
  const { id } = (await db.getFirstAsync<{ id: number }>('SELECT id FROM songs'))!;
  await db.runAsync("INSERT INTO tags (name, created_at) VALUES ('kpop', 0)");
  await db.runAsync('INSERT INTO song_tags (song_id, tag_id, added_at) VALUES (?, 1, 0)', id);

  await recordScanPage(db as never, [scanned('1', { title: 'Fixed title', genre: 'K-Pop' })], 2000);

  const row = await db.getFirstAsync<{ id: number; title: string; genre: string }>(
    'SELECT id, title, genre FROM songs'
  );
  assert.equal(row?.id, id, 'same row, not a new one');
  assert.equal(row?.title, 'Fixed title');
  assert.equal(row?.genre, 'K-Pop');
  assert.equal((await getTagsForSong(db as never, id)).length, 1);
  db.close();
});

test('songs a scan does not see are flagged missing, and return when seen again', async () => {
  const db = await freshDatabase();
  await recordScanPage(db as never, [scanned('1'), scanned('2')], 1000);

  await recordScanPage(db as never, [scanned('1')], 2000);
  assert.deepEqual(await completeScan(db as never, 2000, 1), { missing: 1, hidden: 0 });
  const missing = await db.getFirstAsync<{ media_id: string }>(
    'SELECT media_id FROM songs WHERE is_missing = 1'
  );
  assert.equal(missing?.media_id, '2');

  await recordScanPage(db as never, [scanned('1'), scanned('2')], 3000);
  assert.deepEqual(await completeScan(db as never, 3000, 2), { missing: 0, hidden: 0 });
  const stillMissing = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM songs WHERE is_missing = 1'
  );
  assert.equal(stillMissing?.n, 0);
  db.close();
});

test('songs in a left-out folder are hidden, not reported as gone', async () => {
  const db = await freshDatabase();
  await recordScanPage(db as never, [scanned('1'), scanned('2'), scanned('3')], 1000);

  // '2' is in a folder now left out; '3' has really gone.
  await recordScanPage(db as never, [scanned('1')], 2000);
  assert.deepEqual(await completeScan(db as never, 2000, 1, ['2', 'not-in-library']), { missing: 1, hidden: 1 });

  // Ticked again, it comes back with the next scan.
  await recordScanPage(db as never, [scanned('1'), scanned('2')], 3000);
  assert.deepEqual(await completeScan(db as never, 3000, 2), { missing: 0, hidden: 0 });
  const back = await db.getFirstAsync<{ is_missing: number }>("SELECT is_missing FROM songs WHERE media_id = '2'");
  assert.equal(back?.is_missing, 0);
  db.close();
});

test('a scan that saw nothing does not wipe the library', async () => {
  const db = await freshDatabase();
  await recordScanPage(db as never, [scanned('1'), scanned('2')], 1000);

  // e.g. permission revoked mid-session, or storage not mounted yet
  assert.deepEqual(await completeScan(db as never, 2000, 0), { missing: 0, hidden: 0 });
  const missing = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM songs WHERE is_missing = 1'
  );
  assert.equal(missing?.n, 0);
  db.close();
});

// ---------------------------------------------------------------- m3u parsing

test('parses EXTINF metadata, playlist names, and messy real-world files', () => {
  const text =
    '\uFEFF#EXTM3U\r\n' +
    '#PLAYLIST:Late Night Drive\r\n' +
    '#EXTINF:185,NewJeans - Ditto\r\n' +
    'C:\\Music\\NewJeans\\Ditto.mp3\r\n' +
    '\r\n' +
    '#EXTVLCOPT:network-caching=1000\r\n' +
    'http://radio.example.com/stream\r\n' +
    '../Lemon.flac\r\n';

  const playlist = parseM3u(text, 'fallback');
  assert.equal(playlist.name, 'Late Night Drive');
  assert.deepEqual(playlist.entries, [
    { location: 'C:\\Music\\NewJeans\\Ditto.mp3', artist: 'NewJeans', title: 'Ditto' },
    { location: '../Lemon.flac', artist: null, title: null },
  ]);
});

test('a stream line does not leak its EXTINF onto the next entry', () => {
  const playlist = parseM3u(
    '#EXTINF:-1,Radio - Station\nhttps://radio.example/live\nHype Boy.mp3\n',
    'x'
  );
  assert.deepEqual(playlist.entries, [{ location: 'Hype Boy.mp3', artist: null, title: null }]);
});

test('names come from the file when the playlist has no #PLAYLIST line', () => {
  assert.equal(parseM3u('a.mp3', 'Driving').name, 'Driving');
  assert.equal(
    playlistNameFromUri(
      'content://com.android.externalstorage.documents/tree/primary%3AMusic/document/primary%3AMusic%2FPlaylists%2FGym%20Mix.m3u8'
    ),
    'Gym Mix'
  );
});

test('baseName handles every path style exporters produce', () => {
  assert.equal(baseName('C:\\Users\\me\\Music\\Ditto.mp3'), 'Ditto.mp3');
  assert.equal(baseName('/storage/emulated/0/Music/Ditto.mp3'), 'Ditto.mp3');
  assert.equal(baseName('file:///sdcard/Music/Hype%20Boy.mp3'), 'Hype Boy.mp3');
  assert.equal(baseName('Ditto.mp3'), 'Ditto.mp3');
});

// ---------------------------------------------------------------- matching

const library = [
  { id: 1, filename: 'Ditto.mp3', title: 'Ditto', artist: 'NewJeans' },
  { id: 2, filename: 'Intro.mp3', title: 'Intro', artist: 'The xx' },
  { id: 3, filename: 'Intro.mp3', title: 'Intro', artist: 'M83' },
  { id: 4, filename: '07 track.flac', title: 'Halo', artist: 'Beyoncé' },
];

test('normalize ignores case, accents, and punctuation', () => {
  assert.equal(normalize('Beyoncé – Halo (Remastered)!'), 'beyonce halo remastered');
});

test('matches a unique filename regardless of the path it was exported with', () => {
  const matcher = new SongMatcher(library);
  assert.equal(matcher.matchEntry({ location: 'D:\\old pc\\DITTO.mp3', artist: null, title: null }), 1);
});

test('a shared filename is disambiguated by metadata, or left unmatched', () => {
  const matcher = new SongMatcher(library);
  assert.equal(matcher.matchEntry({ location: 'x/Intro.mp3', artist: 'M83', title: 'Intro' }), 3);
  assert.equal(
    matcher.matchEntry({ location: 'x/Intro.mp3', artist: null, title: null }),
    null,
    'two candidates and nothing to choose between them: never guess'
  );
});

test('falls back to artist + title when the filename differs', () => {
  const matcher = new SongMatcher(library);
  assert.equal(matcher.matchEntry({ location: 'halo.mp3', artist: 'beyonce', title: 'HALO' }), 4);
  // No EXTINF, but the filename itself reads "Artist - Title".
  assert.equal(matcher.matchEntry({ location: 'Beyonce - Halo.mp3', artist: null, title: null }), 4);
});

test('matchAll keeps playlist order and drops duplicates', () => {
  const matcher = new SongMatcher(library);
  const result = matcher.matchAll([
    { location: 'Ditto.mp3', artist: null, title: null },
    { location: 'missing.mp3', artist: null, title: null },
    { location: 'Beyonce - Halo.mp3', artist: null, title: null },
    { location: 'Ditto.mp3', artist: null, title: null },
  ]);
  assert.deepEqual(result.matched, [1, 4]);
  assert.equal(result.unmatched.length, 1);
});

// ---------------------------------------------------------------- playlist import

test('a playlist becomes a root tag on its matched songs', async () => {
  const db = await freshDatabase();
  const ditto = await insertSong(db, 'Ditto', { artist: 'NewJeans' });
  await insertSong(db, 'Lemon', { artist: 'Kenshi Yonezu' });

  const matcher = new SongMatcher([{ id: ditto, filename: 'Ditto.mp3', title: 'Ditto', artist: 'NewJeans' }]);
  const result = await importPlaylistAsTag(
    db as never,
    parseM3u('Ditto.mp3\nnot-in-library.mp3\n', 'Driving'),
    matcher
  );

  assert.equal(result.createdTag, true);
  assert.equal(result.matched, 1);
  assert.equal(result.unmatched, 1);
  assert.deepEqual(result.missing, ['not-in-library']);
  assert.ok(result.color, 'reports the new tag’s colour');
  assert.equal(result.added, 1);
  const tags = await getTagsForSong(db as never, ditto);
  assert.deepEqual(tags.map((t) => [t.name, t.parent_id]), [['Driving', null]]);
  db.close();
});

test('re-importing is idempotent and merges into an existing tag', async () => {
  const db = await freshDatabase();
  const ditto = await insertSong(db, 'Ditto');
  await db.runAsync("INSERT INTO tags (name, created_at) VALUES ('driving', 0)");
  const matcher = new SongMatcher([{ id: ditto, filename: 'Ditto.mp3', title: 'Ditto', artist: null }]);
  const playlist = parseM3u('Ditto.mp3', 'Driving');

  const first = await importPlaylistAsTag(db as never, playlist, matcher);
  assert.equal(first.createdTag, false, 'reused "driving" despite the case difference');
  assert.equal(first.added, 1);

  const second = await importPlaylistAsTag(db as never, playlist, matcher);
  assert.equal(second.added, 0);
  const tagCount = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM tags');
  assert.equal(tagCount?.n, 1);
  db.close();
});

test('songs not found read the way people know them', () => {
  assert.equal(entryLabel({ location: 'x.mp3', artist: 'NewJeans', title: 'Ditto' }), 'NewJeans – Ditto');
  assert.equal(entryLabel({ location: 'x.mp3', artist: null, title: 'Ditto' }), 'Ditto');
  assert.equal(entryLabel({ location: '/storage/Music/NewJeans%20-%20Ditto.flac', artist: null, title: null }), 'NewJeans - Ditto');
});

test('an import folder is named the way the file picker shows it', () => {
  assert.equal(
    folderLabel('content://com.android.externalstorage.documents/tree/primary%3AMusic%2FPlaylists'),
    'Music/Playlists'
  );
  assert.equal(folderLabel('content://com.android.externalstorage.documents/tree/primary%3A'), 'Phone storage');
});

test('a playlist with no matches creates no tag', async () => {
  const db = await freshDatabase();
  const result = await importPlaylistAsTag(
    db as never,
    parseM3u('nothing.mp3', 'Ghost Playlist'),
    new SongMatcher([])
  );
  assert.equal(result.tagId, null);
  const tagCount = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM tags');
  assert.equal(tagCount?.n, 0);
  db.close();
});

test("a song's added date is when the file reached the phone, refreshed on rescan", async () => {
  const db = await freshDatabase();
  await recordScanPage(db as never, [scanned('1')], 5000);
  const before = await db.getFirstAsync<{ added_at: number }>('SELECT added_at FROM songs');
  assert.equal(before?.added_at, 5000, 'falls back to the scan time when MediaStore has no date');

  await recordScanPage(db as never, [scanned('1', { addedAt: 1234 })], 6000);
  const after = await db.getFirstAsync<{ added_at: number }>('SELECT added_at FROM songs');
  assert.equal(after?.added_at, 1234);
  db.close();
});

test("a mix's artwork is its most-played albums, each once", async () => {
  assert.deepEqual(
    distinctAlbums([{ album_id: 'a' }, { album_id: null }, { album_id: 'a' }, { album_id: 'b' }, { album_id: 'c' }]),
    ['a', 'b', 'c']
  );
  assert.equal(distinctAlbums(['1', '2', '3', '4', '5'].map((album_id) => ({ album_id }))).length, 4);

  const db = await freshDatabase();
  for (const [title, album, plays] of [['Rare', 'r', 1], ['Fave', 'f', 9], ['Mid', 'm', 4]] as const) {
    const id = await insertSong(db, title);
    await db.runAsync('UPDATE songs SET album_id = ?, play_count = ? WHERE id = ?', album, plays, id);
  }
  const songs = await findSongs(db as never, { type: 'all' }, { order: 'played' });
  assert.deepEqual(distinctAlbums(songs), ['f', 'm', 'r']);
  db.close();
});
