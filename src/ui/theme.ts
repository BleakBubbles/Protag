/**
 * A single dark palette. Music players are conventionally dark and a second
 * theme is UI surface area we don't need yet — `app.json` pins
 * `userInterfaceStyle` to "dark" so the system never fights this.
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

export const font = {
  title: { fontSize: 22, fontWeight: '700' },
  heading: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '500' },
  caption: { fontSize: 11, fontWeight: '500' },
} as const;

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
