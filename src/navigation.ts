import { router } from 'expo-router';

import type { QueryDraft } from './query/types';

/**
 * Every in-app navigation, in one place. Screens call these rather than
 * building paths themselves, so restructuring routes later means editing
 * this file, not hunting for string paths across the app.
 */
export const openTag = (id: number) =>
  router.push({ pathname: '/library/tag/[id]', params: { id: String(id) } });

/** An album's page: its tracklist, in order. `albumId` is Android's. */
export const openAlbum = (albumId: string) =>
  router.push({ pathname: '/library/album/[id]', params: { id: albumId } });

/** An artist's page: their albums and songs. */
export const openArtist = (name: string) =>
  router.push({ pathname: '/library/artist/[name]', params: { name } });

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

/** Every artist or album, to put in the Shuffle tab's pot. */
export const openPotPicker = (kind: 'artists' | 'albums') =>
  router.push({ pathname: '/pot/pick', params: { kind } });

/** The songs the Shuffle tab's pot would play; `label` is the name they'd play under, if not the usual. */
export const openPotPreview = (label?: string) =>
  router.push({ pathname: '/pot/preview', params: label ? { label } : {} });

// The full player isn't a route: it's a sheet over the tabs (usePlayerSheet).
