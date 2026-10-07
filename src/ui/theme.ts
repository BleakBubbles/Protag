import type { TextStyle } from 'react-native';

/**
 * Design tokens — the only place visual values live.
 *
 * Every component reads from here instead of hardcoding, so re-theming the app
 * means editing this file, not hunting through screens. `app.json` pins
 * `userInterfaceStyle` to "dark" so the system never fights this palette.
 *
 * Warm dark: neutrals with a faint brown tint, so the UI feels considered but
 * still recedes behind album art. Keep the tint barely visible — more and the
 * beige starts competing with the artwork. The accent is a light teal; the deep
 * teal it comes from is too dark to read on a dark background, and is saved for
 * a future light theme.
 */
export const colors = {
  bg: '#151413',
  surface: '#1E1D1B',
  surfaceAlt: '#272624',
  border: '#34322F',

  text: '#EFEDE9',
  textDim: '#A3A09A',
  textFaint: '#75726C',

  accent: '#6FB3A6',
  accentDim: '#3E6F67',
  /** Dark text, not white: white on light teal is too low-contrast. */
  accentText: '#10302B',

  include: '#8FB57E',
  exclude: '#D9706A',

  danger: '#D9706A',
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

type Weight = '400' | '500' | '600' | '700';

/**
 * A typeface as React Native needs it. A system font takes a `fontWeight`; a
 * custom font registers every weight as its own family (`Lora_700Bold`), and
 * its weight is pinned to 'normal' — any other weight, set directly or inherited
 * from a parent Text, makes Android draw a synthetic bold over the real file.
 */
type Typeface =
  | { kind: 'system' }
  | { kind: 'custom'; families: Partial<Record<Weight, string>> };

/**
 * Serif for display, system sans for everything else.
 *
 * **The rule: Lora only at 17 px and up.** At display sizes its serifs and
 * stroke contrast read as character; below that they read as noise — worse
 * light-on-dark and in dense lists, where dozens of small titles stack up. So
 * song titles and tag names in lists are sans too, despite being "content".
 *
 * The sans is Android's own on purpose. Lora has no CJK glyphs, so Chinese text
 * falls back to Noto Sans CJK, which was drawn to sit beside Roboto. Keeping
 * lists system-sans keeps them uniform whatever language a title is in.
 *
 * Changing a custom family here means changing `fontAssets` in fonts.ts to load it.
 */
export const typefaces = {
  display: {
    kind: 'custom',
    families: { '600': 'Lora_600SemiBold', '700': 'Lora_700Bold' },
  },
  body: { kind: 'system' },
} satisfies Record<string, Typeface>;

function face(typeface: Typeface, weight: Weight): TextStyle {
  if (typeface.kind === 'system') return { fontWeight: weight };
  const fontFamily = typeface.families[weight];
  if (!fontFamily) throw new Error(`No ${weight} weight is loaded for this typeface`);
  return { fontFamily, fontWeight: 'normal' };
}

/**
 * Every text style sets an explicit lineHeight. Without one, Android sizes each
 * line from the font's own metrics, so scripts that render in a fallback font
 * (Chinese, Japanese, Korean) come out taller than Latin text at the same size.
 */
export const font = {
  title: { ...face(typefaces.display, '700'), fontSize: 22, lineHeight: 28 },
  heading: { ...face(typefaces.display, '600'), fontSize: 17, lineHeight: 22 },
  // `name` and `listTitle` are identical today but separate on purpose: they're
  // different roles, and either may diverge as the design settles. Medium, not
  // semibold — Android's system font has a true Medium but no true SemiBold, so
  // '600' gets rounded to Medium or Bold depending on the phone.
  /** Things the user named — tags in lists. */
  name: { ...face(typefaces.body, '500'), fontSize: 15, lineHeight: 20 },
  /** Song titles in lists. Medium, to stand apart from the regular artist line. */
  listTitle: { ...face(typefaces.body, '500'), fontSize: 15, lineHeight: 20 },
  body: { ...face(typefaces.body, '400'), fontSize: 15, lineHeight: 20 },
  label: { ...face(typefaces.body, '500'), fontSize: 13, lineHeight: 18 },
  caption: { ...face(typefaces.body, '500'), fontSize: 11, lineHeight: 14 },
  /** Tabular digits so counters and timestamps don't jitter as they change. */
  numeric: { ...face(typefaces.body, '500'), fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;

/** Navigator header titles, in the display face. */
export const headerTitleStyle = {
  fontFamily: font.heading.fontFamily,
  fontWeight: font.heading.fontWeight,
};

export const iconSize = {
  sm: 20,
  md: 26,
  lg: 34,
  /** The main play/pause button. */
  hero: 64,
} as const;

/** Minimum touch target, per platform accessibility guidance. */
export const touchTarget = 44;

/**
 * Deterministic tag colour so a tag looks the same everywhere without storing one.
 * Earthy and mid-saturation to sit on the warm neutrals; bright hues clash with them.
 */
const TAG_COLORS = [
  '#6FB3A6', // teal
  '#C99A5B', // ochre
  '#C4848E', // dusty rose
  '#8FB57E', // sage
  '#7F9CC4', // slate blue
  '#A68BB8', // plum
  '#C9785A', // terracotta
  '#B8A889', // sand
];

export function tagColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}
