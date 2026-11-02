"""Draws the Android launcher icon and splash ("Med.Record" on the app's teal-to-indigo gradient).
Run after `npx cap add android`, only when the design changes:  python mobile/scripts/make-icons.py
Needs Pillow (dev only). Nothing here ships except the PNGs."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RES = Path(__file__).resolve().parents[1] / 'android/app/src/main/res'
TEAL = (20, 184, 166)
INDIGO = (99, 102, 241)
DARK = (6, 9, 18)
FONT = 'C:/Windows/Fonts/segoeuib.ttf'
SS = 4   # drawn large, scaled down for clean edges
DENSITIES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def gradient(size):
    n = 256
    img = Image.new('RGB', (n, n))
    px = img.load()
    for y in range(n):
        for x in range(n):
            t = (x + y) / (2 * (n - 1))
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(TEAL, INDIGO))
    return img.resize((size, size), Image.BICUBIC).convert('RGBA')


def fit_font(draw, text, width):
    size = 10
    while draw.textlength(text, font=ImageFont.truetype(FONT, size + 2)) <= width:
        size += 2
    return ImageFont.truetype(FONT, size)


def art(size, content=0.62):
    """White mark on transparent: 'Med.' over 'Record' with a pulse line, inside the central `content` share of the square."""
    s = size * SS
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    width = s * content
    font = fit_font(d, 'Record', width)
    white = (255, 255, 255, 255)
    asc, desc = font.getmetrics()
    line = int((asc + desc) * 0.86)
    pulse_h = int(line * 0.42)
    top = (s - (line * 2 + pulse_h)) // 2 - int(desc * 0.25)
    d.text((s / 2, top), 'Med.', font=font, fill=white, anchor='ma')
    d.text((s / 2, top + line), 'Record', font=font, fill=white, anchor='ma')
    # Pulse line under the words, the same mark as the web icon.
    y = top + line * 2 + pulse_h * 0.55
    left = (s - width) / 2
    u = width / 10
    h = pulse_h * 0.8
    pts = [(left, y), (left + 3.4 * u, y), (left + 4.2 * u, y - h * 0.6), (left + 5 * u, y + h * 0.5), (left + 5.8 * u, y - h * 0.3), (left + 6.4 * u, y), (left + width, y)]
    d.line(pts, fill=white, width=max(1, int(s * 0.022)), joint='curve')
    for x, yy in (pts[0], pts[-1]):
        r = int(s * 0.011)
        d.ellipse((x - r, yy - r, x + r, yy + r), fill=white)
    return img.resize((size, size), Image.LANCZOS)


def masked(size, round_icon):
    s = size * SS
    mask = Image.new('L', (s, s), 0)
    d = ImageDraw.Draw(mask)
    if round_icon:
        d.ellipse((0, 0, s - 1, s - 1), fill=255)
    else:
        d.rounded_rectangle((0, 0, s - 1, s - 1), radius=int(s * 0.2), fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(Image.alpha_composite(gradient(size), art(size, 0.68)), (0, 0), mask)
    return out


for name, scale in DENSITIES.items():
    folder = RES / f'mipmap-{name}'
    # Adaptive foreground: 108dp, launchers may crop to the central 66dp.
    art(round(108 * scale), 0.48).save(folder / 'ic_launcher_foreground.png')
    gradient(round(108 * scale)).convert('RGB').save(folder / 'ic_launcher_background.png')
    masked(round(48 * scale), False).save(folder / 'ic_launcher.png')
    masked(round(48 * scale), True).save(folder / 'ic_launcher_round.png')

for path in RES.glob('drawable*/splash.png'):
    w, h = Image.open(path).size
    img = Image.new('RGBA', (w, h), DARK + (255,))
    side = int(min(w, h) * 0.34)
    tile = masked(side, False)
    img.paste(tile, ((w - side) // 2, (h - side) // 2), tile)
    img.convert('RGB').save(path)

print('icons written to', RES)
