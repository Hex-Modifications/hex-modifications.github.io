"""Hex Modifications official mark.
Cuts the figure out of the source photo, simplifies it into a clean stencil,
and wraps text rings around the silhouette. Outputs transparent + backed PNGs."""
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SRC = sys.argv[1]
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
FONTS = Path(__file__).parent / 'fonts'
S = 2048  # output size

# ── 1. Figure mask ─────────────────────────────────────────
src = cv2.imread(SRC, cv2.IMREAD_GRAYSCALE)
blur = cv2.GaussianBlur(src, (0, 0), 6)
_, m = cv2.threshold(blur, 38, 255, cv2.THRESH_BINARY)
m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
n, lab, stats, _ = cv2.connectedComponentsWithStats(m)
big = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
m = np.where(lab == big, 255, 0).astype(np.uint8)
# fill holes
ff = m.copy(); h, w = m.shape
cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 255)
m = m | cv2.bitwise_not(ff)
# soften the edge
m = cv2.GaussianBlur(m, (0, 0), 2.2)
_, m = cv2.threshold(m, 127, 255, cv2.THRESH_BINARY)
ys, xs = np.where(m > 0)
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()

# ── 2. Simplified figure: halftone on a hexagonal dot lattice ──
tone = cv2.GaussianBlur(src, (0, 0), 3.2).astype(np.float32) / 255.0
bright = (cv2.GaussianBlur(src, (0, 0), 2.5) > 228).astype(np.uint8)
nb, blab, bstats, _ = cv2.connectedComponentsWithStats(bright)
cross_src = np.zeros_like(src)
if nb > 1:
    ci = 1 + np.argmax(bstats[1:, cv2.CC_STAT_AREA])
    cross_src = np.where(blab == ci, 255, 0).astype(np.uint8)
    cross_src = cv2.morphologyEx(cross_src, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))

pad = 4
sl = (slice(y0 - pad, y1 + pad), slice(x0 - pad, x1 + pad))
crop_t, crop_m, crop_c = tone[sl], m[sl], cross_src[sl]
fig_h = 1060
k = fig_h / crop_t.shape[0]
fw, fh = int(crop_t.shape[1] * k), int(crop_t.shape[0] * k)
crop_t = cv2.resize(crop_t, (fw, fh), interpolation=cv2.INTER_CUBIC)
crop_m = cv2.GaussianBlur(cv2.resize(crop_m, (fw, fh), interpolation=cv2.INTER_CUBIC), (0, 0), 1.2)
crop_c = cv2.GaussianBlur(cv2.resize(crop_c, (fw, fh), interpolation=cv2.INTER_NEAREST), (0, 0), 1.0)
fx, fy = (S - fw) // 2, 330
figure_mask = np.zeros((S, S), np.uint8)
figure_mask[fy:fy + fh, fx:fx + fw] = (crop_m > 127).astype(np.uint8) * 255
bottom_y = fy + fh - 1

SS = 3  # supersample for smooth dots
dots = Image.new('L', (fw * SS, fh * SS), 0)
dd = ImageDraw.Draw(dots)
pitch = 12.5
row_h = pitch * math.sqrt(3) / 2
inside = crop_m > 127
r_max = pitch * 0.5
for row in range(int(fh / row_h) + 2):
    cy = row * row_h
    off = (pitch / 2) if row % 2 else 0
    for col in range(int(fw / pitch) + 2):
        cx = col * pitch + off
        ix, iy = int(cx), int(cy)
        if ix >= fw or iy >= fh or not inside[iy, ix]:
            continue
        v = float(crop_t[iy, ix])
        v = max(0.0, min(1.0, (v - 0.12) / 0.88)) ** 1.35
        r = r_max * math.sqrt(v)
        if r < 0.9:
            continue
        dd.ellipse([(cx - r) * SS, (cy - r) * SS, (cx + r) * SS, (cy + r) * SS], fill=255)
dots = dots.resize((fw, fh), Image.LANCZOS)
alpha = np.maximum(np.array(dots), crop_c)                       # crisp solid cross on top of the dots
alpha = (alpha.astype(np.float32) * (crop_m.astype(np.float32) / 255.0)).astype(np.uint8)
fig_rgba = np.zeros((S, S, 4), np.uint8)
fig_rgba[fy:fy + fh, fx:fx + fw, :3] = 255
fig_rgba[fy:fy + fh, fx:fx + fw, 3] = alpha

# ── 3. Text on the silhouette ──────────────────────────────
def ring_path(offset, sigma, close=161):
    """Outer contour of the silhouette dilated by `offset`, smoothed, from bottom-left over the top to bottom-right."""
    ksz = offset * 2 + 1
    dil = cv2.dilate(figure_mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ksz, ksz)))
    dil = cv2.morphologyEx(dil, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close, close)))
    cnts, _ = cv2.findContours(dil, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cnts, key=cv2.contourArea)[:, 0, :].astype(np.float64)
    # circular gaussian smoothing of coordinates
    r = int(sigma * 3)
    kern = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2); kern /= kern.sum()
    cs = np.vstack([c[-r:], c, c[:r]])
    c = np.stack([np.convolve(cs[:, 0], kern, 'valid'), np.convolve(cs[:, 1], kern, 'valid')], 1)
    cut = bottom_y - 6
    above = c[:, 1] < cut
    # rotate the array so it starts in the excluded bottom segment, then take the single run above the cut
    start = np.where(~above)[0][0]
    c = np.roll(c, -start, 0); above = np.roll(above, -start)
    i0 = np.argmax(above); i1 = len(above) - np.argmax(above[::-1])
    seg = c[i0:i1]
    # orient: must start on the LEFT (so text reads up the left side, across the top, down the right)
    if seg[0, 0] > seg[-1, 0]:
        seg = seg[::-1]
    # resample at 1px
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(seg, axis=0).T))]
    t = np.arange(0, d[-1], 1.0)
    seg = np.stack([np.interp(t, d, seg[:, 0]), np.interp(t, d, seg[:, 1])], 1)
    return seg


def text_on_path(layer, path, unit, font, fill, tracking_min=0.0, sep=''):
    """Repeat `unit` along `path`, justified so it fills the path exactly."""
    draw_cache = {}
    L = len(path) - 1
    adv = lambda ch: font.getlength(ch)
    unit_w = sum(adv(ch) for ch in unit) + tracking_min * len(unit)
    reps = max(1, int(L // unit_w))
    text = (unit * reps).rstrip() + sep
    widths = [adv(ch) for ch in text]
    extra = (L - sum(widths)) / max(1, len(text) - 1)
    s = 0.0
    fs = font.size
    for ch, wch in zip(text, widths):
        mid = s + wch / 2
        i = int(min(L - 1, max(1, mid)))
        a, b = path[max(0, i - 12)], path[min(L, i + 12)]
        ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
        if ch == '+':
            px, py = path[i]; arm = fs * 0.36; th = fs * 0.13
            cross = Image.new('RGBA', (fs * 2, fs * 2), (0, 0, 0, 0)); cdr = ImageDraw.Draw(cross); c0 = fs
            cdr.rectangle([c0 - arm, c0 - th, c0 + arm, c0 + th], fill=fill); cdr.rectangle([c0 - th, c0 - arm, c0 + th, c0 + arm], fill=fill)
            cross = cross.rotate(-ang, resample=Image.BICUBIC)
            layer.alpha_composite(cross, (int(round(px - cross.width / 2)), int(round(py - cross.height / 2))))
        elif ch.strip():
            if ch not in draw_cache:
                im = Image.new('RGBA', (fs * 3, fs * 3), (0, 0, 0, 0))
                ImageDraw.Draw(im).text((fs * 1.5, fs * 1.5), ch, font=font, fill=fill, anchor='mm')
                draw_cache[ch] = im
            g = draw_cache[ch].rotate(-ang, resample=Image.BICUBIC)
            px, py = path[i]
            layer.alpha_composite(g, (int(round(px - g.width / 2)), int(round(py - g.height / 2))))
        s += wch + extra


mono = ImageFont.truetype(str(FONTS / 'JetBrainsMono-ExtraBold.ttf'), 44)
mono_small = ImageFont.truetype(str(FONTS / 'JetBrainsMono-Medium.ttf'), 29)
text_layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
ring1 = ring_path(48, 22, 181)
ring2 = ring_path(122, 36, 261)
text_on_path(text_layer, ring1, 'HEX MODIFICATIONS + ', mono, (255, 255, 255, 255))
text_on_path(text_layer, ring2, 'GTA V · GTA VI · FIVEM · RESHADE · MACOS · WINDOWS · ', mono_small, (255, 255, 255, 120))

# hairline that closes the base under the figure
base = Image.new('RGBA', (S, S), (0, 0, 0, 0))
bd = ImageDraw.Draw(base)
left_end, right_end = ring2[0], ring2[-1]
bd.line([(left_end[0], bottom_y + 2), (right_end[0], bottom_y + 2)], fill=(255, 255, 255, 90), width=2)

# ── 4. Wordmark ────────────────────────────────────────────
word = Image.new('RGBA', (S, S), (0, 0, 0, 0))
wd = ImageDraw.Draw(word)
hexf = ImageFont.truetype(str(FONTS / 'InterTight-SemiBold.ttf'), 210)
subf = ImageFont.truetype(str(FONTS / 'InterTight-Medium.ttf'), 74)


def tight_text(d, xy, text, font, fill, track):
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill, anchor='ls')
        x += font.getlength(ch) + track
    return x


hex_w = sum(hexf.getlength(c) for c in 'hex') + (-14) * 2
sub_w = sum(subf.getlength(c) for c in 'modifications') + (-2.5) * 12
gap = 26
total = hex_w + gap + sub_w
x = (S - total) / 2
base_y = bottom_y + 250
x = tight_text(wd, (x, base_y), 'hex', hexf, (255, 255, 255, 255), -14)
tight_text(wd, (x + gap, base_y), 'modifications', subf, (255, 255, 255, 170), -2.5)

# ── 5. Compose ─────────────────────────────────────────────
mark = Image.new('RGBA', (S, S), (0, 0, 0, 0))
mark.alpha_composite(text_layer)
mark.alpha_composite(base)
mark.alpha_composite(Image.fromarray(fig_rgba, 'RGBA'))
mark.alpha_composite(word)

mark.save(OUT / 'hex-modifications-official.png')

def with_bg(bg):
    out = bg.convert('RGBA'); out.alpha_composite(mark); return out

# night background (brand near-black with a soft indigo/plum glow)
yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
def glow(cx, cy, r, color, a):
    d = np.clip(1 - np.hypot(xx - cx, yy - cy) / r, 0, 1) ** 2 * a
    return d[..., None] * np.array(color, np.float32)[None, None, :]
night = np.ones((S, S, 3), np.float32) * np.array([20, 19, 26], np.float32)
night = night * 1 + glow(S * .5, S * .42, S * .55, (93 - 20, 84 - 19, 156 - 26), .55) + glow(S * .7, S * .8, S * .45, (126 - 20, 58 - 19, 99 - 26), .35)
with_bg(Image.fromarray(np.clip(night, 0, 255).astype(np.uint8))).save(OUT / 'hex-modifications-night.png')

# GTA VI sunset gradient background
t = (yy / S)[..., None]
stops = [(0.0, (43, 37, 82)), (0.38, (93, 84, 156)), (0.68, (126, 58, 99)), (1.0, (232, 152, 152))]
sun = np.zeros((S, S, 3), np.float32)
for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
    seg = np.clip((t - p0) / (p1 - p0), 0, 1)
    inside = ((t >= p0) & ((t < p1) if p1 < 1 else (t <= p1))).astype(np.float32)
    sun += inside * (np.array(c0) + (np.array(c1) - np.array(c0)) * seg)
sun = np.clip(sun, 0, 255)
with_bg(Image.fromarray(sun.astype(np.uint8))).save(OUT / 'hex-modifications-sunset.png')
print('ok', OUT)
