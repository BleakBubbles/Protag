import * as MusicLibrary from 'expo-music-library';
import type { SQLiteDatabase } from 'expo-sqlite';

import { getSetting, setSetting, SettingKey } from '../db/settings';
import {
  guessFolder,
  parseFolderChoices,
  reconcileFolders,
  SAMPLE_SIZE,
  type FolderChoice,
  type FolderChoices,
} from './folders';

const PAGE_SIZE = 500;

/** A folder on the phone, with how many audio files it holds and whether ProTag reads it. */
export interface LibraryFolder {
  id: string;
  count: number;
  choice: FolderChoice;
}

export async function loadFolderChoices(db: SQLiteDatabase): Promise<FolderChoices> {
  return parseFolderChoices(await getSetting(db, SettingKey.libraryFolders));
}

async function saveFolderChoices(db: SQLiteDatabase, choices: FolderChoices): Promise<void> {
  await setSetting(db, SettingKey.libraryFolders, JSON.stringify(choices));
}

/**
 * The phone's audio folders with their choices. Folders seen for the first
 * time get a default from their name and a few of their files, saved so it's
 * only guessed once. Needs audio permission.
 */
export async function syncFolders(db: SQLiteDatabase): Promise<LibraryFolder[]> {
  const onPhone = await MusicLibrary.getFoldersAsync();
  const { choices, unseen } = reconcileFolders(await loadFolderChoices(db), onPhone);
  for (const folder of unseen) {
    let sample: MusicLibrary.Asset[] = [];
    try {
      sample = (await MusicLibrary.getFolderAssetsAsync(folder.id, { first: SAMPLE_SIZE, artwork: 'none' })).assets;
    } catch (error) {
      // Judged by its name alone, which errs towards reading it.
      console.warn('[folders] could not sample', folder.title, error);
    }
    choices[folder.id] = { title: folder.title, by: 'auto', ...guessFolder(folder.title, sample) };
  }
  await saveFolderChoices(db, choices);
  return onPhone.map((folder) => ({ id: folder.id, count: folder.assetCount, choice: choices[folder.id] }));
}

/** Tick or untick a folder. The user's choice is never guessed over again. */
export async function setFolderIncluded(db: SQLiteDatabase, id: string, include: boolean): Promise<void> {
  const choices = await loadFolderChoices(db);
  const choice = choices[id];
  if (!choice) return;
  choices[id] = { ...choice, include, by: 'user', reason: null };
  await saveFolderChoices(db, choices);
}

/**
 * Media ids of the files a scan should leave out: everything in unticked
 * folders. If the folders can't be read, nothing is left out; showing a voice
 * note by mistake beats hiding a song.
 */
export async function leftOutOfScan(db: SQLiteDatabase): Promise<string[]> {
  let folders: LibraryFolder[];
  try {
    folders = await syncFolders(db);
  } catch (error) {
    console.warn('[folders] unavailable; reading every folder', error);
    return [];
  }
  const ids: string[] = [];
  for (const folder of folders) {
    if (folder.choice.include) continue;
    let cursor: string | undefined;
    let more = true;
    while (more) {
      const page = await MusicLibrary.getFolderAssetsAsync(folder.id, { first: PAGE_SIZE, after: cursor, artwork: 'none' });
      for (const asset of page.assets) ids.push(asset.id);
      cursor = page.endCursor;
      more = page.hasNextPage && page.assets.length > 0;
    }
  }
  return ids;
}
