/** Codes for a file the phone can open but not make sense of. */
const UNREADABLE = ['ERROR_CODE_PARSING_', 'ERROR_CODE_DECODING_', 'ERROR_CODE_DECODER_'];

/**
 * What to tell someone when a song won't play, from the player's error code
 * (Media3's `errorCodeName`, e.g. "ERROR_CODE_IO_FILE_NOT_FOUND"). Says what
 * went wrong and what they can do about it, in ProTag's words, never the
 * engine's; the raw code goes to the log.
 */
export function playbackErrorMessage(code: string | null): string {
  const name = code ?? '';
  if (name === 'ERROR_CODE_IO_FILE_NOT_FOUND') {
    return "This song's file is missing: it may have been moved or deleted. Rescan in Settings to update your library.";
  }
  if (name === 'ERROR_CODE_IO_NO_PERMISSION') {
    return "ProTag isn't allowed to read this song's file. Check that it can access your music in the phone's app settings.";
  }
  if (UNREADABLE.some((prefix) => name.startsWith(prefix))) {
    return "This song's file is damaged, or in a format this phone can't play.";
  }
  if (name.startsWith('ERROR_CODE_AUDIO_TRACK_')) {
    return "The phone's audio output stopped working. Press play to try again.";
  }
  return "This song couldn't be played. Press play to try again, or skip to the next.";
}
