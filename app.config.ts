import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * The development build is its own app ("ProTag Dev", `com.protag.app.dev`),
 * so it installs beside the real one instead of replacing it. Each keeps its
 * own library and tags. EAS's development profile sets `APP_VARIANT`; the
 * rest of the config is app.json.
 */
const DEV = process.env.APP_VARIANT === 'development';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: DEV ? 'ProTag Dev' : 'ProTag',
  // Its own link scheme too, so a protag:// link never asks which ProTag to open.
  scheme: DEV ? 'protag-dev' : 'protag',
  ios: { ...config.ios, bundleIdentifier: DEV ? 'com.protag.app.dev' : 'com.protag.app' },
  android: { ...config.android, package: DEV ? 'com.protag.app.dev' : 'com.protag.app' },
});
