"""A fake music library for store screenshots: invented artists and albums,
silent MP3s with real ID3 tags and generated abstract covers. Also writes
demo_tags.sql, which tags the songs once the app has scanned them."""
import io, json, math, os, random, struct, sys
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
random.seed(7)

# artist, album, year, genre, cover colours, [(title, seconds, tags)]
ALBUMS = [
    ("Halcyon Drift", "Low Tide Lights", 2022, "Lo-fi", ("#2E4A62", "#E7B07A"), [
        ("Harbour Lamps", 152, ["chill", "late night"]),
        ("Salt on the Window", 171, ["chill"]),
        ("Slow Ferry", 143, ["chill", "rainy day"]),
        ("Midnight Laundromat", 165, ["late night", "chill"]),
        ("Tidewater", 188, ["chill", "rainy day"]),
    ]),
    ("Mara Vell", "Paper Moons", 2021, "Indie", ("#C9D6C2", "#6B4E71"), [
        ("Paper Moons", 214, ["indie", "favourites"]),
        ("Cartographer", 236, ["indie"]),
        ("Small Hours", 198, ["indie", "late night", "sad"]),
        ("Lanterns", 221, ["indie", "summer"]),
        ("Everything Is Weather", 247, ["indie", "sad", "rainy day"]),
    ]),
    ("Saturn Arcade", "Overdrive", 2004, "Rock", ("#1B1B2F", "#E94F37"), [
        ("Overdrive", 203, ["2000s", "driving", "workout/running"]),
        ("Neon Interstate", 228, ["2000s", "driving"]),
        ("Static Hearts", 195, ["2000s", "hype"]),
        ("Last Exit", 241, ["2000s", "driving", "favourites"]),
        ("Gravity Kicks", 186, ["2000s", "workout/lifting", "hype"]),
    ]),
    ("LUMEN", "Prism Season", 2023, "K-pop", ("#F4C6D7", "#7A5CFA"), [
        ("Prism", 196, ["kpop/gen 4", "hype", "favourites"]),
        ("Afterglow", 203, ["kpop/gen 4", "summer"]),
        ("Satellite Heart", 189, ["kpop/gen 4", "workout/running"]),
        ("Polaroid", 211, ["kpop/gen 4", "chill"]),
    ]),
    ("NOVA9", "Starfall", 2025, "K-pop", ("#0F1C3F", "#5FD3E8"), [
        ("Starfall", 192, ["kpop/gen 5", "hype"]),
        ("Velocity", 178, ["kpop/gen 5", "workout/lifting", "workout/running"]),
        ("Blue Hour", 205, ["kpop/gen 5", "late night"]),
        ("Countdown", 184, ["kpop/gen 5", "driving"]),
    ]),
    ("Kei Morrow", "Slow Bloom", 2020, "R&B", ("#3B2A2F", "#D98E73"), [
        ("Slow Bloom", 233, ["rnb", "late night", "favourites"]),
        ("Velvet Static", 207, ["rnb", "late night"]),
        ("Say It Softer", 219, ["rnb", "sad"]),
        ("Golden Hour Again", 196, ["rnb", "summer", "chill"]),
    ]),
    ("Juniper & Ash", "Field Notes", 2019, "Folk", ("#E8DFC8", "#7C8F5A"), [
        ("Field Notes", 188, ["acoustic", "chill"]),
        ("Woodsmoke", 224, ["acoustic", "rainy day"]),
        ("Kettle Song", 167, ["acoustic"]),
        ("Northbound", 241, ["acoustic", "driving"]),
    ]),
    ("Coastline Club", "Summer Static", 2024, "Pop", ("#FFD27A", "#FF7A6B"), [
        ("Summer Static", 182, ["summer", "hype"]),
        ("Pool Lights", 194, ["summer", "chill"]),
        ("Sunburn", 176, ["summer", "workout/running", "hype"]),
        ("Postcards", 201, ["summer", "driving", "favourites"]),
    ]),
    ("Halcyon Drift", "Night Bus", 2024, "Lo-fi", ("#1E2433", "#8FA8C8"), [
        ("Night Bus", 158, ["late night", "chill"]),
        ("Rain Delay", 172, ["rainy day", "chill"]),
        ("Last Stop", 149, ["late night", "sad"]),
    ]),
]

TAG_COLORS = {
    "chill": "green", "late night": "indigo", "rainy day": "blue", "indie": "brown",
    "sad": "purple", "2000s": "red", "driving": "orange", "workout": "yellow",
    "running": "red", "lifting": "cyan", "hype": "pink", "kpop": "pink", "gen 4": "purple",
    "gen 5": "teal", "favourites": "yellow", "summer": "orange", "rnb": "blue",
    "acoustic": "green",
}


def cover(a, b, seed):
    """A soft colour field: two colours blended, with a blurred circle and a band."""
    rnd = random.Random(seed)
    w = 600
    img = Image.new("RGB", (w, w), a)
    ca, cb = Image.new("RGB", (w, w), a), Image.new("RGB", (w, w), b)
    # Rotated at twice the size and cropped, so no corner is left uncovered.
    big = Image.linear_gradient("L").resize((w * 2, w * 2)).rotate(rnd.choice([0, 45, 90, 135]))
    mask = big.crop((w // 2, w // 2, w // 2 + w, w // 2 + w))
    img = Image.composite(cb, ca, mask)
    over = Image.new("RGBA", (w, w), (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    r = rnd.randint(130, 220)
    cx, cy = rnd.randint(170, 430), rnd.randint(170, 430)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=Image.new("RGB", (1, 1), b).getpixel((0, 0)) + (150,))
    y = rnd.randint(380, 520)
    d.rectangle((0, y, w, y + rnd.randint(18, 40)), fill=(255, 255, 255, 40))
    over = over.filter(ImageFilter.GaussianBlur(rnd.randint(18, 40)))
    img = Image.alpha_composite(img.convert("RGBA"), over).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88)
    return buf.getvalue()


def frame(fid, text):
    data = b"\x03" + text.encode("utf-8")  # UTF-8 (ID3v2.4)
    return fid.encode() + syncsafe(len(data)) + b"\x00\x00" + data


def syncsafe(n):
    return bytes([(n >> 21) & 0x7F, (n >> 14) & 0x7F, (n >> 7) & 0x7F, n & 0x7F])


def id3(title, artist, album, year, genre, track, art):
    frames = b"".join([
        frame("TIT2", title), frame("TPE1", artist), frame("TALB", album), frame("TPE2", artist),
        frame("TDRC", str(year)), frame("TCON", genre), frame("TRCK", str(track)),
    ])
    apic = b"\x00" + b"image/jpeg\x00" + b"\x03" + b"\x00" + art
    frames += b"APIC" + syncsafe(len(apic)) + b"\x00\x00" + apic
    return b"ID3\x04\x00\x00" + syncsafe(len(frames)) + frames


# MPEG-1 Layer III, 32 kbit/s, 44.1 kHz, mono, no CRC: 104-byte frames of silence
# (zeroed side info decodes to nothing), 1152 samples each.
HEADER = bytes([0xFF, 0xFB, 0x10, 0xC4])
FRAME = HEADER + bytes(104 - 4)


def mp3(seconds):
    n = math.ceil(seconds * 44100 / 1152)
    return FRAME * n


os.makedirs(OUT, exist_ok=True)
songs = []
for ai, (artist, album, year, genre, (ca, cb), tracks) in enumerate(ALBUMS):
    art = cover(ca, cb, ai)
    for ti, (title, secs, tags) in enumerate(tracks, 1):
        name = f"{artist} - {album} - {ti:02d} {title}.mp3".replace("&", "and")
        with open(os.path.join(OUT, name), "wb") as f:
            f.write(id3(title, artist, album, year, genre, ti, art) + mp3(secs))
        songs.append({"title": title, "artist": artist, "tags": tags})

# Tags, written into the app's database after it scans the files.
q = lambda s: "'" + s.replace("'", "''") + "'"
sql = ["PRAGMA foreign_keys = ON;", "DELETE FROM song_tags;", "DELETE FROM tags;"]
paths = sorted({p for s in songs for p in s["tags"]}, key=lambda p: (p.count("/"), p))
made = set()
for p in paths:
    parts = p.split("/")
    for i in range(len(parts)):
        sub = "/".join(parts[: i + 1])
        if sub in made:
            continue
        made.add(sub)
        name = parts[i]
        parent = "NULL" if i == 0 else f"(SELECT id FROM tags WHERE name = {q(parts[i-1])} AND parent_id IS NULL)"
        sql.append(
            f"INSERT INTO tags (name, parent_id, sort_order, created_at, color) "
            f"VALUES ({q(name)}, {parent}, 0, strftime('%s','now')*1000, {q(TAG_COLORS[name])});"
        )
for s in songs:
    for p in s["tags"]:
        parts = p.split("/")
        tag = (f"(SELECT id FROM tags WHERE name = {q(parts[0])} AND parent_id IS NULL)" if len(parts) == 1 else
               f"(SELECT id FROM tags WHERE name = {q(parts[1])} AND parent_id = "
               f"(SELECT id FROM tags WHERE name = {q(parts[0])} AND parent_id IS NULL))")
        sql.append(
            f"INSERT INTO song_tags (song_id, tag_id, added_at) SELECT id, {tag}, strftime('%s','now')*1000 "
            f"FROM songs WHERE title = {q(s['title'])} AND artist = {q(s['artist'])};"
        )
# Some plays, so "Most played" has something to say.
for s in songs:
    sql.append(f"UPDATE songs SET play_count = {random.randint(0, 40)} WHERE title = {q(s['title'])} AND artist = {q(s['artist'])};")
with open(os.path.join(os.path.dirname(OUT.rstrip('/\\')), "demo_tags.sql"), "w", encoding="utf-8") as f:
    f.write("\n".join(sql) + "\n")
print(len(songs), "songs,", len(made), "tags")
