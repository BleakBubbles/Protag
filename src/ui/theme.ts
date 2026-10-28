import type { TextStyle } from 'react-native';

import { isTagColor, type TagColor } from '@/db/tagColors';

/**
 * Design tokens — the only place visual values live.
 *
 * Every component reads from here instead of hardcoding, so re-theming the app
 * means editing this file, not hunting through screens. Colours come in two
 * palettes, dark and light, picked by ThemeContext (the phone's setting unless
 * the user chose one); components read the current one with `useColors()` or
 * `makeStyles()`, never these objects directly.
 *
 * Warm dark: neutrals with a faint brown tint, so the UI feels considered but
 * still recedes behind album art. Keep the tint barely visible — more and the
 * beige starts competing with the artwork.
 *
 * The accent is a deep teal, in two shades: `accent` for filled shapes (buttons)
 * and `accentFg` for teal text, icons and thin lines on the dark background,
 * where the deep shade is too dark to read.
 */
const dark = {
  bg: '#151413',
  surface: '#1E1D1B',
  surfaceAlt: '#272624',
  border: '#34322F',
  /**
   * A step up from `border`: the neutral pill of an artist or album in the
   * Play tab's pot, where tags have their colours (colour is a tag's identity).
   */
  raised: '#3D3B38',
  /**
   * The pot: a teal band, the same in both schemes, with the recess cut into
   * it and Shuffle under it in the scheme's own colours (dark teal here, paper
   * in light), so neither is a dark hole in a light app or a white slab in a dark one.
   */
  potBand: '#0F5C54',
  potRecess: '#0B1F1C',
  /** The recess's edge while building. */
  potEdge: '#3F7A71',
  /** Text and icons on the band. */
  onPot: '#EAF4F1',
  onPotDim: '#A9CFC8',
  /** Inside the recess: the × between combined tags, a hovered tile's ring. */
  onRecess: '#EAF4F1',
  /** The empty recess's words. */
  potHint: '#7FA79F',
  potButton: '#0B1F1C',
  onPotButton: '#EAF4F1',
  /** Dims the app behind something floating over it (the (i) bubble), so it stands out. */
  scrim: 'rgba(0, 0, 0, 0.4)',

  text: '#EFEDE9',
  textDim: '#A3A09A',
  textFaint: '#75726C',

  accent: '#0F5C54',
  /** Text on an `accent` fill. */
  onAccent: '#FFFFFF',
  accentFg: '#2E9384',
  /** `accentFg` at low opacity: a soft teal wash behind teal text (tonal buttons). */
  accentTint: '#2E938429',
  /** Android's press ripple over an `accent` fill. */
  rippleOnAccent: '#FFFFFF33',

  /** Text on a tag's colour (pot tiles, mix chips): dark on the mid-tone tag colours in either scheme. */
  onTag: '#151413',

  include: '#8FB57E',
  exclude: '#D9706A',

  danger: '#D9706A',
};

/**
 * Light: its own palette rather than the dark one inverted — warm paper and
 * ink, closest to the original bookstore idea, with the deep teal that's too
 * dark on dark. Surfaces step *down* from the page (a shade darker) the way the
 * dark palette's step up, so cards still read as raised.
 */
const light: typeof dark = {
  bg: '#F6F2EA',
  surface: '#EDE7DC',
  surfaceAlt: '#E5DED1',
  border: '#D9D1C3',
  raised: '#D2C9B9',
  // The band stays teal; the recess and Shuffle are paper, like the page.
  potBand: '#0F5C54',
  potRecess: '#F6F2EA',
  potEdge: '#9CC9C0',
  onPot: '#EAF4F1',
  onPotDim: '#A9CFC8',
  onRecess: '#35302A',
  potHint: '#8E877C',
  potButton: '#F6F2EA',
  onPotButton: '#0F5C54',
  scrim: 'rgba(40, 32, 20, 0.28)',

  // Soft ink rather than near-black, which reads harsh on paper, most of all in filled icons.
  text: '#35302A',
  textDim: '#665F55',
  textFaint: '#8E877C',

  accent: '#1F5E58',
  onAccent: '#FFFFFF',
  accentFg: '#17695F',
  accentTint: '#17695F3D',
  rippleOnAccent: '#FFFFFF33',

  onTag: '#2A2520',

  include: '#4E8A3E',
  exclude: '#C2524B',

  danger: '#B9463F',
};

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
 * What each tag colour name looks like. A wide range, so a big library can tell
 * tags apart, but softened slightly so they sit on the warm neutrals.
 */
const darkTags = {
  red: '#E06C64',
  orange: '#E08A4F',
  yellow: '#D9B648',
  green: '#74B266',
  teal: '#3F9E8F',
  cyan: '#4FB0C6',
  blue: '#5E8FDB',
  indigo: '#8A80DC',
  purple: '#B07CD0',
  pink: '#DB7AA8',
  brown: '#A9805E',
  gray: '#959089',
} satisfies Record<TagColor, string>;

export type Scheme = 'dark' | 'light';

/** Every colour role, plus the tag colours and which scheme it is. */
export type Palette = { readonly [Role in keyof typeof dark]: string } & {
  readonly scheme: Scheme;
  /** A tag's stored colour name as a colour; gray for none or a name no longer in the palette. */
  tag: (name: string | null | undefined) => string;
};

function palette(scheme: Scheme, roles: typeof dark, tags: Record<TagColor, string>): Palette {
  return { ...roles, scheme, tag: (name) => (name && isTagColor(name) ? tags[name] : tags.gray) };
}

/** The same twelve, brighter and a little more saturated, so they stay lively on paper rather than muddy. */
const lightTags = {
  red: '#EC7A70',
  orange: '#F29A55',
  yellow: '#EDC84B',
  green: '#82C471',
  teal: '#4FB7A6',
  cyan: '#5EC3DA',
  blue: '#719FEE',
  indigo: '#978CEE',
  purple: '#C38EE4',
  pink: '#EE89BA',
  brown: '#BE936D',
  gray: '#ABA59C',
} satisfies Record<TagColor, string>;

export const palettes: Record<Scheme, Palette> = {
  dark: palette('dark', dark, darkTags),
  light: palette('light', light, lightTags),
};
