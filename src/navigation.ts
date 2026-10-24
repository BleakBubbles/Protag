import { router } from 'expo-router';

import type { QueryDraft } from './query/types';

/**
 * Every in-app navigation, in one place. Screens call these rather than
 * building paths themselves, so restructuring routes later means editing
 * this file, not hunting for string paths across the app.
 */
/**
 * `fromPlayer` is the path of the screen the full player was open over, when
 * a page is opened from the player: its Back returns there, player open
 * (see useBackToPlayer).
 */
const via = (fromPlayer?: string) => (fromPlayer ? { player: fromPlayer } : {});

export const openTag = (id: number, fromPlayer?: string) =>
  router.push({ pathname: '/library/tag/[id]', params: { id: String(id), ...via(fromPlayer) } });

/** An album's page: its tracklist, in order. `albumId` is Android's. */
export const openAlbum = (albumId: string, fromPlayer?: string) =>
  router.push({ pathname: '/library/album/[id]', params: { id: albumId, ...via(fromPlayer) } });

/** An artist's page: their albums and songs. */
export const openArtist = (name: string, fromPlayer?: string) =>
  router.push({ pathname: '/library/artist/[name]', params: { name, ...via(fromPlayer) } });

/** One song's tags: the same editor as for several songs. */
export const openSongTags = (id: number) => openEditTags([id]);

export const openAddSongs = (tagId: number) =>
  router.push({ pathname: '/add-songs/[tagId]', params: { tagId: String(tagId) } });

/** Edit the tags of several songs at once. */
export const openEditTags = (songIds: readonly number[]) =>
  router.push({ pathname: '/edit-tags', params: { songs: songIds.join(',') } });

export const openManageLibrary = () => router.push('/library/manage');

/** Which of the phone's audio folders the library reads. */
export const openLibraryFolders = () => router.push('/library/folders');

export const openLibrary = () => router.navigate('/library');

/** The Shuffle tab, optionally with a saved mix or a tag combination loaded into the pot. */
export const openShuffle = (open?: { mixId: number } | { draft: QueryDraft }) =>
  router.navigate(
    !open
      ? '/shuffle'
      : 'mixId' in open
        ? { pathname: '/shuffle', params: { edit: String(open.mixId) } }
        : { pathname: '/shuffle', params: { draft: JSON.stringify(open.draft) } }
  );

// The full player isn't a route: it's a sheet over the tabs (usePlayerSheet).
