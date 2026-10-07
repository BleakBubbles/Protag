// Per-weight imports on purpose: the package's root index requires all eight
// Lora files (every weight plus italics), and Metro bundles every font file
// that's required — ~1.1 MB instead of the ~400 KB actually used.
import { Lora_500Medium } from '@expo-google-fonts/lora/500Medium';
import { Lora_600SemiBold } from '@expo-google-fonts/lora/600SemiBold';
import { Lora_700Bold } from '@expo-google-fonts/lora/700Bold';

/**
 * Font files to load at startup, keyed by the family names `typefaces` in
 * theme.ts refers to. Only the weights actually used are loaded — each is
 * ~134 KB and delays first render.
 *
 * Loaded at runtime with `useFonts` (no native rebuild). For production, the
 * expo-font config plugin can embed them at build time instead, which avoids
 * the wait at startup.
 */
export const fontAssets = {
  Lora_500Medium,
  Lora_600SemiBold,
  Lora_700Bold,
};
