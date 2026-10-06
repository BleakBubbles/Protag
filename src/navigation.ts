import { router } from 'expo-router';

/**
 * Every in-app navigation, in one place. Screens call these rather than
 * building paths themselves, so restructuring routes later means editing
 * this file, not hunting for string paths across the app.
 */
export const openTag = (id: number) =>
  router.push({ pathname: '/tag/[id]', params: { id: String(id) } });

export const openSongTags = (id: number) =>
  router.push({ pathname: '/song/[id]/tags', params: { id: String(id) } });

export const openAddSongs = (tagId: number) =>
  router.push({ pathname: '/add-songs/[tagId]', params: { tagId: String(tagId) } });

export const openManageLibrary = () => router.push('/library-manage');

export const openLibrary = () => router.navigate('/library');
