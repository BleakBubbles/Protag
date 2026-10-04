import type { TextStyle } from 'react-native';

/**
 * Design tokens — the only place visual values live.
 *
 * The visual direction is still open (warm "library" vs neutral dark), so every
 * component reads from here instead of hardcoding. Re-theming the app means
 * editing this file, not hunting through screens. `app.json` pins
 * `userInterfaceStyle` to "dark" so the system never fights this palette.
 */
export const colors = {
  bg: '#0E0E12',
  surface: '#17171F',
  surfaceAlt: '#1F1F2A',
  border: '#2A2A38',

  text: '#F2F2F7',
  textDim: '#9A9AAE',
  textFaint: '#6A6A80',

  accent: '#7C6BF5',
  accentDim: '#4A3FA8',
  accentText: '#FFFFFF',

  include: '#3DC98A',
  exclude: '#F2565B',

  danger: '#F2565B',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

/**
 * Font families. `undefined` means the platform default. Switching to a serif
 * (say, for the library look) is setting these and loading the font with
 * expo-font — every text style below picks it up.
 */
export const typeface = {
  display: undefined as string | undefined,
  body: undefined as string | undefined,
};

/**
 * Every text style sets an explicit lineHeight. Without one, Android sizes each
 * line from the font's own metrics, so scripts that render in a fallback font
 * (Chinese, Japanese, Korean) come out taller than Latin text at the same size.
 */
export const font = {
  title: { fontFamily: typeface.display, fontSize: 22, lineHeight: 28, fontWeight: '700' },
  heading: { fontFamily: typeface.display, fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontFamily: typeface.body, fontSize: 15, lineHeight: 20, fontWeight: '400' },
  label: { fontFamily: typeface.body, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  caption: { fontFamily: typeface.body, fontSize: 11, lineHeight: 14, fontWeight: '500' },
  /** Tabular digits so counters and timestamps don't jitter as they change. */
  numeric: { fontFamily: typeface.body, fontSize: 12, lineHeight: 16, fontWeight: '500', fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

export const iconSize = {
  sm: 20,
  md: 26,
  lg: 34,
  /** The main play/pause button. */
  hero: 64,
} as const;

/** Minimum touch target, per platform accessibility guidance. */
export const touchTarget = 44;

/** Deterministic tag colour so a tag looks the same everywhere without storing one. */
const TAG_COLORS = [
  '#7C6BF5',
  '#3DC98A',
  '#E8A33D',
  '#E05C8B',
  '#3DB4C9',
  '#B06BF5',
  '#C9873D',
  '#5C8BE0',
];

export function tagColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}
