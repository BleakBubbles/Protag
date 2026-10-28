import { router, useSegments } from 'expo-router';


/**
 * Every in-app navigation, in one place. Screens call these rather than
 * building paths themselves, so restructuring routes later means editing
 * this file, not hunting for string paths across the app.
 */
/**
 * `fromPlayer`: a page opened from the full player opens over it (the
 * `from-player` routes, above the tabs and the player), sliding in like any
 * page, so Back slides it away to the player just as it was. Its own links
 * stay over the player too (`useFromPlayer`); otherwise they'd open in the
 * Library, hidden behind it.
 */
export const openTag = (id: number, fromPlayer = false) =>
  router.push({ pathname: fromPlayer ? '/from-player/tag/[id]' : '/library/tag/[id]', params: { id: String(id) } });

/** An album's page: its tracklist, in order. `albumId` is Android's. */
export const openAlbum = (albumId: string, fromPlayer = false) =>
  router.push({ pathname: fromPlayer ? '/from-player/album/[id]' : '/library/album/[id]', params: { id: albumId } });

/** An artist's page: their albums and songs. */
export const openArtist = (name: string, fromPlayer = false) =>
  router.push({ pathname: fromPlayer ? '/from-player/artist/[name]' : '/library/artist/[name]', params: { name } });

/** Whether this page was opened over the player, for its links to open there too. */
export const useFromPlayer = () => useSegments()[0] === 'from-player';

/** One song's tags: the same editor as for several songs. */
export const openSongTags = (id: number) => openEditTags([id]);

export const openAddSongs = (tagId: number) =>
  router.push({ pathname: '/add-songs/[tagId]', params: { tagId: String(tagId) } });

/** Edit the tags of several songs at once. */
export const openEditTags = (songIds: readonly number[]) =>
  router.push({ pathname: '/edit-tags', params: { songs: songIds.join(',') } });

export const openSettings = () => router.push('/settings');

/** Which of the phone's audio folders the library reads. */
export const openLibraryFolders = () => router.push('/settings/folders');

export const openLibrary = () => router.navigate('/library');

// The full player isn't a route: it's a sheet over the tabs (usePlayerSheet).
