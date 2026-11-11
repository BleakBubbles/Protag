<img src="docs/store/icon-512.png" width="96" alt="Protag logo">

# Protag

A music player for Android built around tags instead of playlists. Tag your songs, nest tags inside each other, then mix any tags, artists and albums into a shuffle and weigh how much of each you hear.

It plays the audio files already on your phone. No account, no ads, no tracking; nothing leaves the device.

Now in closed testing on Google Play: join through the [testers group](https://groups.google.com/g/protag-testers).

## Stack

- **Expo SDK 58 / React Native 0.88**, TypeScript, Expo Router
- **SQLite** (expo-sqlite) for the library, tags, mixes and play history
- **A native Kotlin module** ([modules/protag-player](modules/protag-player)) on Media3: background playback, the media notification, lock screen, headphone and car controls, an equalizer, a sleep timer, and a watcher that sees songs added to or deleted from the phone
- **Tests** on Node's built-in runner against real SQLite ([tests](tests))

## Running it

Needs a development build (the native module isn't in Expo Go):

```bash
npm install
npm run android   # build and install on a device or emulator
npm start         # Metro, for the installed dev build
npm test
npm run typecheck
```

## License

Copyright © BleakBubbles. All rights reserved. The source is here to read; please don't republish the app.
