import test from 'node:test';
import assert from 'node:assert/strict';

import { guessFolder, parseFolderChoices, reconcileFolders, type SampleFile } from '../src/library/folders.ts';

/** A file of `minutes` at `kbps`, so its size gives that bitrate. */
const file = (kbps: number, minutes = 3, mimeType = 'audio/mpeg'): SampleFile => ({
  mimeType,
  duration: minutes * 60,
  fileSize: (kbps * 1000 * minutes * 60) / 8,
});

const music = [file(320), file(256), file(192)];

test('folders named like messaging apps, recorders and phone sounds start left out', () => {
  for (const name of ['WhatsApp Audio', 'WhatsApp Voice Notes', 'Telegram', 'Recordings', 'Call', 'Voice Recorder', 'Ringtones', 'Notifications', 'Alarms', 'Podcasts']) {
    const guess = guessFolder(name, music);
    assert.equal(guess.include, false, name);
    assert.ok(guess.reason, name);
  }
});

test('album and artist folders that merely contain those words stay in', () => {
  for (const name of ['The Call', 'Voices', 'Signal', 'Alarm Clock Songs', 'Recordings of Bach', 'Music', 'Download']) {
    assert.equal(guessFolder(name, music).include, true, name);
  }
});

test('a folder that is nearly all speech-quality audio is left out, whatever its name', () => {
  // WhatsApp's weekly voice-note folders are named only by date.
  const notes = Array.from({ length: 10 }, () => file(16, 1, 'audio/ogg'));
  assert.deepEqual(guessFolder('202542', notes), { include: false, reason: 'Looks like voice recordings' });
  assert.equal(guessFolder('Memos', [file(12, 2, 'audio/amr'), file(12, 2, 'audio/amr')]).include, false);
});

test('a few low-quality files among songs keep the folder in', () => {
  assert.equal(guessFolder('Download', [...music, ...music, file(24)]).include, true);
});

test('untagged files and unknown sizes are never reasons to leave a folder out', () => {
  const unknown: SampleFile[] = [{ duration: 200 }, { duration: 180, fileSize: null }];
  assert.equal(guessFolder('Stuff', unknown).include, true);
  assert.equal(guessFolder('Empty', []).include, true);
});

test('short clips do not count towards the guess', () => {
  // Clicks and blips are skipped by the scan anyway; the songs decide.
  const clips = Array.from({ length: 20 }, () => ({ duration: 2, fileSize: 2000, mimeType: 'audio/ogg' }));
  assert.equal(guessFolder('Mixed', [...clips, ...music]).include, true);
});

test('stored choices keep the user’s decisions, refresh names, and list new folders', () => {
  const stored = {
    a: { title: 'Old name', include: false, by: 'user' as const, reason: null },
    gone: { title: 'SD card', include: true, by: 'auto' as const, reason: null },
  };
  const { choices, unseen } = reconcileFolders(stored, [
    { id: 'a', title: 'New name' },
    { id: 'b', title: 'Music' },
  ]);
  assert.deepEqual(choices.a, { title: 'New name', include: false, by: 'user', reason: null });
  assert.ok(choices.gone, 'a folder that is gone keeps its choice');
  assert.deepEqual(unseen, [{ id: 'b', title: 'Music' }]);
});

test('unreadable stored choices count as none', () => {
  assert.deepEqual(parseFolderChoices(null), {});
  assert.deepEqual(parseFolderChoices('not json'), {});
  assert.deepEqual(parseFolderChoices('[1,2]'), {});
  assert.deepEqual(parseFolderChoices('{"x":{"title":"A","include":true,"by":"auto","reason":null}}').x.title, 'A');
});
