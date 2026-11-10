"""Landscape store video (docs/store/demo-clip-landscape.mp4) from a raw emulator recording.

  python landscape_clip.py <raw clip.mp4> <ffmpeg.exe> <out.mp4>

The raw clip is a 1080x2400 `adb shell screenrecord` of the demo take (see NOTES.md,
2026-11-04). The phone sits right, zoomed in and fixed to the top of its screen, where
the tagging, the pot and the weights happen; it cuts to the bottom as the player opens,
for the song's title and controls. Captions on the left.
"""
import os
import subprocess
import sys

from PIL import Image, ImageDraw

RAW, FF, OUT = sys.argv[1:4]
FONT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../node_modules/@expo-google-fonts/lora/700Bold/Lora_700Bold.ttf'))
FONT = FONT.replace('\\', '/').replace(':', r'\:')

W, H = 1920, 1080
PH = 1700                                  # phone height on the canvas: taller than the frame
PW = round(1080 * PH / 2400 / 2) * 2
X = W - 140 - PW
TOP, BOTTOM = 48, H - 48 - PH
CUT = 22.15                                # the player starts to open: cut to the phone's bottom
START = 2.0                                # trimmed off the raw recording
R = 44
BG = '2F4C6E'

# Background-coloured corners laid over the recording to round it off.
mask = os.path.join(os.path.dirname(OUT) or '.', 'mask-landscape.png')
m = Image.new('RGBA', (PW, PH), tuple(int(BG[i:i + 2], 16) for i in (0, 2, 4)) + (255,))
ImageDraw.Draw(m).rounded_rectangle([0, 0, PW - 1, PH - 1], R, fill=(0, 0, 0, 0))
m.save(mask)

caps = [(0.0, 7.6, 'Tag your songs'), (7.6, 13.6, 'Mix tags into a shuffle'),
        (13.6, 19.6, 'Weigh them how you like'), (19.6, 99, 'Play')]
F = 0.25
draws = []
for a, b, text in caps:
    alpha = f"if(lt(t,{a}+{F}),(t-{a})/{F},if(gt(t,{b}-{F}),({b}-t)/{F},1))"
    draws.append(f"drawtext=fontfile='{FONT}':text='{text}':fontsize=72:fontcolor=0xF6F2EA:"
                 f"x={X // 2}-text_w/2:y=(h-text_h)/2:enable='between(t,{a},{b})':alpha='{alpha}'")

fc = (f"[0:v]trim=start={START},setpts=PTS-STARTPTS,fps=30,scale={PW}:{PH}:flags=lanczos[v];"
      f"[v][1:v]overlay=0:0[ph];"
      f"color=c=0x{BG}:s={W}x{H}:r=30[bg];"
      rf"[bg][ph]overlay=x={X}:y='if(lt(t\,{CUT})\,{TOP}\,{BOTTOM})':eval=frame:shortest=1,"
      + ",".join(draws) + ",format=yuv420p[out]")
subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', '-i', RAW, '-i', mask,
                '-filter_complex', fc, '-map', '[out]', '-c:v', 'libx264', '-crf', '18', '-preset', 'slow',
                '-movflags', '+faststart', OUT], check=True)
os.remove(mask)
