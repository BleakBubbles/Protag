import { MIN_DURATION_MS } from './assets';

/**
 * Which of the phone's audio folders ProTag reads.
 *
 * Android's music library hands over every audio file it finds, so voice
 * messages, call recordings and podcasts arrive looking like songs. Each folder
 * gets a default — ticked, or left out when it looks like that kind of thing —
 * which the user can see and change. **Defaults, never silent filters**: a
 * voice note that slips through is visible and easy to untick, while a song
 * quietly hidden would never be missed. So guessing errs towards ticked, and
 * never leaves a folder out for untagged files alone (lots of real songs
 * downloaded to a phone have no tags).
 */

/** One folder's setting, as stored. */
export interface FolderChoice {
  title: string;
  include: boolean;
  /** 'auto' until the user flips it; their choice is never guessed over. */
  by: 'auto' | 'user';
  /** Why it was left out, when the app decided ("Looks like voice messages"). */
  reason: string | null;
}

/** Folder id → choice. Ids are Android's, stable for a folder's path. */
export type FolderChoices = Record<string, FolderChoice>;

/** What the guess looks at in a few of a folder's files. */
export interface SampleFile {
  mimeType?: string | null;
  fileSize?: number | null;
  /** Seconds, as the library reports it. */
  duration: number;
}

/**
 * Folder names that mean "not music": the ones Android and messaging apps
 * use, matched as the *whole* name. Matching words inside names would catch
 * album folders ("The Call", "Voices"), and hiding real music is the one
 * mistake this mustn't make.
 */
const NAMED: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /^((whatsapp|telegram)( audio| voice notes)?|voice notes|voice messages)$/i,
    reason: 'Looks like voice messages',
  },
  {
    pattern: /^(recordings?|call|calls|call recordings?|voice recorder|voice recordings?|sound recordings?|recorder)$/i,
    reason: 'Looks like recordings',
  },
  { pattern: /^(podcasts?|audiobooks?)$/i, reason: 'Looks like podcasts or audiobooks' },
  { pattern: /^(ringtones?|notifications?|alarms?|ui sounds?)$/i, reason: 'Looks like phone sounds' },
];

/** Speech codecs. Music is rarely stored in these. */
const VOICE_TYPES = new Set(['audio/amr', 'audio/amr-wb', 'audio/3gpp', 'audio/3gpp2']);

/** Below this, it's speech: voice notes are 12–32 kbps; even low-quality music is 96+. */
const VOICE_KBPS = 40;

/** How much of a folder must look like voice before it's left out. */
const VOICE_SHARE = 0.8;

/** How many files to look at per folder: enough to judge, few enough to stay quick. */
export const SAMPLE_SIZE = 40;

function looksLikeVoice(file: SampleFile): boolean {
  if (file.mimeType && VOICE_TYPES.has(file.mimeType.toLowerCase())) return true;
  if (!file.fileSize || file.duration <= 0) return false;
  return (file.fileSize * 8) / file.duration / 1000 < VOICE_KBPS;
}

/**
 * The default for a folder seen for the first time. Its name is the strongest
 * sign; failing that, a folder that's nearly all speech-quality audio (like
 * WhatsApp's weekly voice-note folders, named only "202542") is left out too.
 */
export function guessFolder(title: string, sample: readonly SampleFile[]): Omit<FolderChoice, 'title' | 'by'> {
  for (const { pattern, reason } of NAMED) {
    if (pattern.test(title)) return { include: false, reason };
  }
  // Only files long enough to be songs count; the scan skips the rest anyway.
  const songLength = sample.filter((file) => file.duration * 1000 >= MIN_DURATION_MS);
  if (songLength.length > 0) {
    const voice = songLength.filter(looksLikeVoice).length;
    if (voice / songLength.length >= VOICE_SHARE) return { include: false, reason: 'Looks like voice recordings' };
  }
  return { include: true, reason: null };
}

/**
 * Bring stored choices up to date with the folders on the phone: names are
 * refreshed, and folders not seen before are returned to be guessed. Folders
 * that are gone keep their choice, in case their storage comes back.
 */
export function reconcileFolders(
  stored: FolderChoices,
  onPhone: readonly { id: string; title: string }[]
): { choices: FolderChoices; unseen: { id: string; title: string }[] } {
  const choices: FolderChoices = { ...stored };
  const unseen: { id: string; title: string }[] = [];
  for (const folder of onPhone) {
    const known = choices[folder.id];
    if (known) choices[folder.id] = { ...known, title: folder.title };
    else unseen.push(folder);
  }
  return { choices, unseen };
}

/** Stored choices from the settings table; anything unreadable counts as none made yet. */
export function parseFolderChoices(json: string | null): FolderChoices {
  if (!json) return {};
  try {
    const value: unknown = JSON.parse(json);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as FolderChoices) : {};
  } catch {
    return {};
  }
}
