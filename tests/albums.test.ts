import test from 'node:test';
import assert from 'node:assert/strict';

import { freshDatabase, insertSong } from './helpers/db.ts';
import {
  getAlbum,
  getArtist,
  listAlbums,
  listAlbumSongs,
  listArtistAlbums,
  listArtists,
  listArtistSongs,
} from '../src/db/albums.ts';

async function library() {
  const db = await freshDatabase();
  await insertSong(db, 'Hype Boy', { artist: 'NewJeans', album: 'New Jeans', albumId: '1', trackNo: 3 });
  await insertSong(db, 'Attention', { artist: 'NewJeans', album: 'New Jeans', albumId: '1', trackNo: 1 });
  await insertSong(db, 'Cookie', { artist: 'NewJeans', album: 'New Jeans', albumId: '1' });
  await insertSong(db, 'Ditto', { artist: 'NewJeans', album: 'OMG', albumId: '2', trackNo: 1 });
  // A guest on one track of the album doesn't take it over.
  await insertSong(db, 'Hurt', { artist: 'NewJeans feat. X', album: 'New Jeans', albumId: '1', trackNo: 4 });
  await insertSong(db, 'Lemon', { artist: 'Kenshi Yonezu' });
  await insertSong(db, 'Gone', { artist: 'NewJeans', album: 'OMG', albumId: '2', missing: true });
  return db;
}

test('albums show under their most common artist, with songs on the phone counted', async () => {
  const db = await library();
  assert.deepEqual(await listAlbums(db as never), [
    { albumId: '1', title: 'New Jeans', artist: 'NewJeans', songs: 4 },
    { albumId: '2', title: 'OMG', artist: 'NewJeans', songs: 1 },
  ]);
  assert.equal((await getAlbum(db as never, '2'))?.songs, 1);
  assert.equal(await getAlbum(db as never, 'nope'), null);
  db.close();
});

test('an album plays in track order, untracked songs last', async () => {
  const db = await library();
  const titles = (await listAlbumSongs(db as never, '1')).map((s) => s.title);
  assert.deepEqual(titles, ['Attention', 'Hype Boy', 'Hurt', 'Cookie']);
  db.close();
});

test('artists list their songs and albums, pictured by their biggest album', async () => {
  const db = await library();
  const artists = await listArtists(db as never);
  assert.deepEqual(
    artists.map((a) => a.name),
    ['Kenshi Yonezu', 'NewJeans', 'NewJeans feat. X']
  );
  const newJeans = await getArtist(db as never, 'NewJeans');
  assert.deepEqual(newJeans, { name: 'NewJeans', songs: 4, albums: 2, coverAlbumId: '1' });
  assert.equal(artists[0].coverAlbumId, null, 'no album, no picture');

  assert.deepEqual(
    (await listArtistAlbums(db as never, 'NewJeans')).map((a) => a.title),
    ['New Jeans', 'OMG']
  );
  assert.deepEqual(
    (await listArtistSongs(db as never, 'NewJeans')).map((s) => s.title),
    ['Attention', 'Hype Boy', 'Cookie', 'Ditto']
  );
  db.close();
});
