// Builds the app icons from assets/brand/logo.svg. Re-run after changing the
// logo or a colour below:
//
//   npm run icons
//
// Icons are native config: changes appear after the next EAS build.
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const BRAND = new URL('../assets/brand/', import.meta.url);
const ASSETS = new URL('../assets/', import.meta.url);

// Keep BACKGROUND in sync with android.adaptiveIcon.backgroundColor in app.json.
const BACKGROUND = '#F5E7CA';
const MARK = '#446170';
// The mark on the app's dark background: the app's teal (`accentFg` in theme.ts), which sits
// with the rest of the UI where the beige clashed.
const ON_DARK = '#2E9384';

/** The logo's drawing and its canvas size, minus the outer <svg> element. */
const source = readFileSync(new URL('logo.svg', BRAND), 'utf8');
const LOGO_SIZE = Number(source.match(/viewBox="0 0 (\d+)/)[1]);
const logo = source.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

/**
 * An SVG of the mark in `color`, with the logo's square scaled to `scale` of
 * the canvas and centred. A plain <g>, not a nested <svg>, so nothing clips the
 * stem: it carries on to the bottom edge however small the mark is placed.
 */
function compose({ color, scale, background }) {
  const offset = (LOGO_SIZE * (1 - scale)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_SIZE} ${LOGO_SIZE}">
    ${background ? `<rect width="100%" height="100%" fill="${background}"/>` : ''}
    <g fill="${color}" transform="translate(${offset} ${offset}) scale(${scale})">${logo}</g>
  </svg>`;
}

function write(name, svg, size = 1024) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(new URL(name, ASSETS), png);
}

// Full-bleed square for stores and the legacy icon; the OS rounds the corners.
const icon = compose({ color: MARK, scale: 1, background: BACKGROUND });
write('icon.png', icon);
write('favicon.png', icon, 48);

// Android adaptive icon: a 108dp canvas of which the launcher shows the middle
// 72dp. At 72/108 the logo's square would fill exactly that; a little more
// zooms the P in (the logo has room around the mark, and the stem runs off the
// bottom anyway). Past ~0.9 the bowl nears the edge of round launcher masks.
// The background is a plain colour set in app.json.
const ADAPTIVE_SCALE = 0.82;
write('android-icon-foreground.png', compose({ color: MARK, scale: ADAPTIVE_SCALE }));
// Themed (Material You) icons: the launcher recolours this; only the shape matters.
write('android-icon-monochrome.png', compose({ color: '#FFFFFF', scale: ADAPTIVE_SCALE }));

// The mark alone, cropped to its own bounds (stem ending at the logo's bottom
// edge), in teal for the app's dark background. Used by the splash
// screen and inside the app. The crop is the mark's bounding box in logo.svg's
// coordinates, with a little room.
const MARK_BOUNDS = '140 144 280 416';
write(
  'logo-mark.png',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_BOUNDS}"><g fill="${ON_DARK}">${logo}</g></svg>`,
  512
);
