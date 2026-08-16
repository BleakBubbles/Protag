const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// `@missingcore/audio-metadata` does `require('expo-file-system')` and expects the
// legacy functional API (`getInfoAsync` / `readAsStringAsync` with byte-range reads).
// SDK 54+ moved those to `expo-file-system/legacy` and the root export now only has
// the `File`/`Directory`/`Paths` classes, so that require resolves to a module without
// the functions it calls and blows up at metadata-read time.
//
// Redirect the import for that package only, so our own code keeps using the modern API.
const LEGACY_FS_CONSUMER = path.join('node_modules', '@missingcore', 'audio-metadata');

const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolveRequest ?? context.resolveRequest;
  if (
    moduleName === 'expo-file-system' &&
    context.originModulePath?.includes(LEGACY_FS_CONSUMER)
  ) {
    return resolve(context, 'expo-file-system/legacy', platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
