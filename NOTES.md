# ProTag — working notes

Plan: `C:\Users\fifth\.claude\plans\i-d-like-to-make-piped-starfish.md`

## Where things stand

Done and verified:

1. **Scaffold** — Expo SDK 57.0.13, RN 0.86.2, expo-router, TypeScript strict. Two tabs
   (Player / Library) that boot. Dark theme in `src/ui/theme.ts`.
2. **Database** — `src/db/`. Migrations, songs + tags repositories, cycle prevention.
3. **Query engine** — `src/query/`. AST, SQL compiler, human-readable labels.

Not started: library scan, player, tag screens, query builder UI, backup. Tasks 4–8.

Verification currently passing:

```bash
npm test && npm run typecheck
```

24 tests, both typecheck projects clean. The app also bundles: `npx expo export --platform android`.

## Decisions made during the build

**Tests run on Node, not Jest.** `node --experimental-strip-types` plus `node:sqlite` and
`node:test` means zero test dependencies. `tests/helpers/db.ts` adapts Node's synchronous
SQLite to the async slice of `expo-sqlite` the repositories use, so tests exercise the *real*
migrations and *real* repository code against a real SQLite engine — no mocks, no schema copy
that could drift. Everything in `src/db` imports `expo-sqlite` as `import type` only, which is
what makes this possible; keep it that way.

**`tsconfig.test.json` is separate** because Node's type stripping requires explicit `.ts`
import extensions and the Metro build forbids them. `npm run typecheck` runs both projects.

**No `babel.config.js`.** SDK 57 applies `babel-preset-expo` internally. The expo-router docs
still say to add one; doing so breaks the build unless you also install the preset explicitly.

**`metro.config.js` redirects one package.** `@missingcore/audio-metadata` does
`require('expo-file-system')` and calls `getInfoAsync` / `readAsStringAsync`. SDK 57 moved
those to `expo-file-system/legacy`; the root export keeps same-named stubs that **throw at
runtime**. So without the redirect, metadata extraction fails on every song with a confusing
deprecation error rather than a resolution error. Verified by diffing bundles for the
`ExponentFileSystem` native-module string: present with the resolver, absent without, and
absent when nothing imports the metadata library (so the redirect stays correctly scoped).

**Only `READ_MEDIA_AUDIO` is requested.** `expo-media-library`'s `granularPermissions` is
pinned to `["audio"]`, and `expo-audio`'s `recordAudioAndroid` is off since ProTag never
records. `POST_NOTIFICATIONS` is added by hand — the audio plugin only adds it for background
*recording*, but without it the media notification won't show on Android 13+.

## Next session — start here

Task 4, the library scan (`src/library/scan.ts`). Two phases, per the plan:

- Phase 1 discovery uses `MediaLibrary.getAssetsAsync({ mediaType: 'audio' })` and
  `upsertScannedSong` / `flagMissingAfterScan` in `src/db/songs.ts`, which are already written.
- Phase 2 enrichment reads tags with `getAudioMetadata(uri, [...])` and writes artwork to disk
  with the **new** file-system API (`new File(Paths.document, ...)`), not `documentDirectory`.

Two things to confirm on a real device the first time it runs:

- `expo-media-library` returns **no** artist/album/title for audio — only uri, filename,
  duration. That is why phase 2 exists. Verify the URIs it returns are readable by
  `getAudioMetadata` (content:// vs file:// could matter here — this is the main unknown).
- Metadata extraction is unverified end to end; the resolver is verified, the extraction path
  is not.

## Running on a device

This machine has no JDK and no Android SDK, and doesn't need them: builds go through EAS
(cloud). An emulator would be useless here anyway, since the app scans your real music library.

One-time:

```bash
npx eas login
npx eas init
npx eas build --profile development --platform android
```

Then install the resulting APK on the phone. Day to day:

```bash
npx expo start --dev-client
```

Only rebuild the APK when native config changes — a new native dependency, or an `app.json`
plugin/permission edit. Pure JS and TS changes reload over Wi-Fi. Add `--tunnel` to
`expo start` if the phone and PC aren't on the same network.
