import test from 'node:test';
import assert from 'node:assert/strict';

import { playbackErrorMessage } from '../src/player/playbackErrors.ts';

test('playback errors say what went wrong and what to do, never the engine code', () => {
  assert.match(playbackErrorMessage('ERROR_CODE_IO_FILE_NOT_FOUND'), /missing.*Rescan in Settings/);
  assert.match(playbackErrorMessage('ERROR_CODE_IO_NO_PERMISSION'), /isn't allowed/);
  assert.match(playbackErrorMessage('ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED'), /format this phone can't play/);
  assert.match(playbackErrorMessage('ERROR_CODE_DECODING_FAILED'), /damaged/);
  assert.match(playbackErrorMessage('ERROR_CODE_AUDIO_TRACK_INIT_FAILED'), /audio output/);
  // Unknown, or a native build that doesn't send the code yet.
  for (const code of ['ERROR_CODE_UNSPECIFIED', null]) {
    const message = playbackErrorMessage(code);
    assert.match(message, /couldn't be played/);
    assert.doesNotMatch(message, /ERROR_CODE/);
  }
});
