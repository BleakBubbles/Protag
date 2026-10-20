import { router } from 'expo-router';

/**
 * Every in-app navigation, in one place. Screens call these rather than
 * building paths themselves, so restructuring routes later means editing
 * this file, not hunting for string paths across the app.
 */
export const openTag = (id: number) =>
  router.push({ pathname: '/library/tag/[id]', params: { id: String(id) } });

/** One song's tags: the same editor as for several songs. */
export const openSongTags = (id: number) => openEditTags([id]);

export const openAddSongs = (tagId: number) =>
  router.push({ pathname: '/add-songs/[tagId]', params: { tagId: String(tagId) } });

/** Edit the tags of several songs at once. */
export const openEditTags = (songIds: readonly number[]) =>
  router.push({ pathname: '/edit-tags', params: { songs: songIds.join(',') } });

export const openManageLibrary = () => router.push('/library/manage');

export const openLibrary = () => router.navigate('/library');

/** The Play tab; with a mix id, that mix opens in the pot for editing. */
export const openPlay = (editMixId?: number) =>
  router.navigate(
    editMixId === undefined ? '/play' : { pathname: '/play', params: { edit: String(editMixId) } }
  );

// The full player isn't a route: it's a sheet over the tabs (usePlayerSheet).
