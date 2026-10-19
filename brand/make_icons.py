"""Small-size marks for the website: nav badge + favicons/app icons."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
night = Image.open('out/hex-modifications-night.png').convert('RGBA')
fig = Image.open('out/figure-only.png').convert('RGBA')
S = 2048

def night_bg(size):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    base = np.ones((size, size, 3), np.float32) * np.array([20, 19, 26], np.float32)
    def glow(cx, cy, r, col, a):
        d = np.clip(1 - np.hypot(xx - cx, yy - cy) / r, 0, 1) ** 2 * a
        return d[..., None] * (np.array(col, np.float32) - np.array([20, 19, 26], np.float32))
    img = base + glow(size * .5, size * .38, size * .75, (93, 84, 156), .8) + glow(size * .8, size * 1.0, size * .7, (126, 58, 99), .6)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).convert('RGBA')

def rounded(im, radius_frac):
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=int(im.width * radius_frac), fill=255)
    out = im.copy(); out.putalpha(m); return out

def shrink(im, size):
    out = im.resize((size, size), Image.LANCZOS)
    return out.filter(ImageFilter.UnsharpMask(radius=0.6, percent=60, threshold=1)) if size <= 64 else out

# 1. Nav badge: figure + text rings on night, rounded square
cx, cy, side = 1024, 812, 1240
badge = night.crop((cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2))
rounded(shrink(badge, 192), .24).save(OUT / 'logo-badge.png')

# 2. Icon: tight crop on head + cross (readable at 16–32px), figure only on night glow
icx, icy, iside = 1032, 720, 640
crop = fig.crop((icx - iside // 2, icy - iside // 2, icx + iside // 2, icy + iside // 2))
icon = night_bg(iside); icon.alpha_composite(crop)
# larger icons get a wider frame (whole head + shoulders)
bcx, bcy, bside = 1024, 860, 1060
big = night_bg(bside); big.alpha_composite(fig.crop((bcx - bside // 2, bcy - bside // 2, bcx + bside // 2, bcy + bside // 2)))
shrink(big, 180).convert('RGB').save(OUT / 'apple-touch-icon.png')        # iOS rounds it itself
for n in (192, 512):
    shrink(big, n).convert('RGB').save(OUT / f'icon-{n}.png')
fav = rounded(icon, .22)
shrink(fav, 32).save(OUT / 'favicon-32.png')
shrink(fav, 16).save(OUT / 'favicon-16.png')
fav.resize((256, 256), Image.LANCZOS).save(OUT / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

# preview sheet
sheet = Image.new('RGBA', (900, 300), (232, 231, 236, 255))
sheet.alpha_composite(Image.open(OUT / 'logo-badge.png').resize((160, 160)), (20, 70))
sheet.alpha_composite(Image.open(OUT / 'icon-512.png').convert('RGBA').resize((160, 160)), (210, 70))
f32 = Image.open(OUT / 'favicon-32.png'); f16 = Image.open(OUT / 'favicon-16.png')
sheet.alpha_composite(f32.resize((128, 128), Image.NEAREST), (400, 86)); sheet.alpha_composite(f32, (560, 134))
sheet.alpha_composite(f16.resize((128, 128), Image.NEAREST), (620, 86)); sheet.alpha_composite(f16, (780, 142))
sheet.save(OUT / 'preview-icons.png')
print('icons ok')
