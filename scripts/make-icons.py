"""
Builds the app icons from assets/brand/logo-source.png.

The source is a flat two-colour drawing, so the mark is traced out of it as an
anti-aliased mask (each pixel's position between the two colours) and redrawn in
whatever colours below. Re-run after changing a colour or the source:

    python scripts/make-icons.py

Needs Pillow. Icons are native config: changes appear after the next EAS build.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'assets'

# The colours the source is drawn in, used only to trace it.
SOURCE_BG = (237, 220, 185)
SOURCE_FG = (84, 107, 119)

# The colours the icons are drawn in. Keep BACKGROUND in sync with
# android.adaptiveIcon.backgroundColor in app.json.
BACKGROUND = (237, 220, 185)  # #EDDCB9
MARK = (84, 107, 119)  # #546B77

SIZE = 1024


def trace_mask() -> Image.Image:
    src = Image.open(ASSETS / 'brand' / 'logo-source.png').convert('RGB')
    axis = [f - b for f, b in zip(SOURCE_FG, SOURCE_BG)]
    norm = sum(a * a for a in axis)

    def alpha(pixel):
        t = sum((p - b) * a for p, b, a in zip(pixel, SOURCE_BG, axis)) / norm
        # The source's own rounded corners (white) blend into its background
        # along a slightly different colour line and trace as a faint ghost.
        if t < 0.15:
            return 0
        return round(255 * min(1.0, t))

    mask = Image.new('L', src.size)
    mask.putdata([alpha(p) for p in src.getdata()])
    return mask


def place(mask: Image.Image, scale: float) -> Image.Image:
    """The mark on a SIZE canvas, the source's square scaled to `scale` of it and
    centred. The stem runs off the bottom of the source, so it's extended down to
    the canvas edge rather than stopping short."""
    side = round(SIZE * scale)
    scaled = mask.resize((side, side), Image.LANCZOS)
    offset = (SIZE - side) // 2
    canvas = Image.new('L', (SIZE, SIZE))
    canvas.paste(scaled, (offset, offset))
    last_row = scaled.crop((0, side - 1, side, side))
    for y in range(offset + side, SIZE):
        canvas.paste(last_row, (offset, y))
    return canvas


def solid(color, mask: Image.Image) -> Image.Image:
    layer = Image.new('RGBA', (SIZE, SIZE), color + (255,))
    layer.putalpha(mask)
    return layer


def main():
    mask = trace_mask()

    # Full-bleed square for stores and the legacy icon; the OS rounds the corners.
    icon = Image.new('RGBA', (SIZE, SIZE), BACKGROUND + (255,))
    icon.alpha_composite(solid(MARK, place(mask, 1.0)))
    icon.convert('RGB').save(ASSETS / 'icon.png')

    # Android adaptive icon: a 108dp canvas of which the launcher shows the
    # middle 72dp, so the source square maps to 2/3 of it.
    adaptive = place(mask, 72 / 108)
    solid(MARK, adaptive).save(ASSETS / 'android-icon-foreground.png')
    # Themed (Material You) icons: the launcher recolours this; only alpha matters.
    solid((255, 255, 255), adaptive).save(ASSETS / 'android-icon-monochrome.png')

    icon.convert('RGB').resize((48, 48), Image.LANCZOS).save(ASSETS / 'favicon.png')


if __name__ == '__main__':
    main()
