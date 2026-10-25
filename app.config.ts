import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * The development build is its own app ("ProTag Dev", `com.protag.app.dev`),
 * so it installs beside the real one instead of replacing it. Each keeps its
 * own library and tags. EAS's development profile sets `APP_VARIANT`; the
 * rest of the config is app.json. `APP_VARIANT=engine` ("ProTag Engine") is a
 * third, for trying a local release build of native changes on a phone beside
 * both, without touching either (see NOTES.md, local tooling).
 */
const VARIANTS = {
  development: { name: 'ProTag Dev', scheme: 'protag-dev', id: 'com.protag.app.dev' },
  engine: { name: 'ProTag Engine', scheme: 'protag-engine', id: 'com.protag.app.engine' },
  release: { name: 'ProTag', scheme: 'protag', id: 'com.protag.app' },
};
const variant = VARIANTS[process.env.APP_VARIANT as keyof typeof VARIANTS] ?? VARIANTS.release;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: variant.name,
  slug: 'protag',
  // Its own link scheme too, so a protag:// link never asks which ProTag to open.
  scheme: variant.scheme,
  ios: { ...config.ios, bundleIdentifier: variant.id },
  android: { ...config.android, package: variant.id },
});
