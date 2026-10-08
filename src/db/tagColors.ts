/**
 * Tag colours are stored as names, not hex values, so the palette can be
 * retuned (or given a light-theme variant) without touching anyone's data.
 * The hex for each name lives in `src/ui/theme.ts`.
 */

/** Every colour a tag can have, in the order the picker shows them. */
export const TAG_COLORS = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'cyan',
  'blue',
  'indigo',
  'purple',
  'pink',
  'brown',
  'gray',
] as const;

export type TagColor = (typeof TAG_COLORS)[number];

/**
 * The order new tags take colours in. Shuffled away from hue order so tags made
 * one after another look clearly different. Gray is left out; it's there to be
 * picked, not assigned.
 *
 * Migration v3 copies this order to colour existing tags. Changing it later only
 * affects new tags.
 */
export const TAG_COLOR_CYCLE: readonly TagColor[] = [
  'teal',
  'orange',
  'blue',
  'pink',
  'green',
  'purple',
  'yellow',
  'red',
  'cyan',
  'brown',
  'indigo',
];

/** The colour that follows `previous` in the cycle; the first if there's none. */
export function nextTagColor(previous: string | null | undefined): TagColor {
  const at = TAG_COLOR_CYCLE.indexOf(previous as TagColor);
  return TAG_COLOR_CYCLE[(at + 1) % TAG_COLOR_CYCLE.length];
}

export function isTagColor(value: string): value is TagColor {
  return (TAG_COLORS as readonly string[]).includes(value);
}
