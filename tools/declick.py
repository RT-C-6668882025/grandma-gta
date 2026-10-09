#!/usr/bin/env python3
"""Paint out the Chrome gif_creator click marks (orange dot + dark "Clicked" tag) from recording frames.
python3 tools/declick.py in.png out.png   — prints what it patched"""
import sys
import numpy as np
from PIL import Image

def blobs(mask):
    seen = np.zeros_like(mask, bool); H, W = mask.shape; out = []
    for y, x in zip(*np.nonzero(mask)):
        if seen[y, x]: continue
        st = [(y, x)]; seen[y, x] = True; pts = []
        while st:
            cy, cx = st.pop(); pts.append((cy, cx))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = cy + dy, cx + dx
                if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]: seen[ny, nx] = True; st.append((ny, nx))
        ys, xs = zip(*pts); out.append((min(xs), min(ys), max(xs) + 1, max(ys) + 1, len(pts)))
    return out

def patch(a, x0, y0, x1, y1):
    """fill the box by blending the row above and the row below, column by column"""
    H, W, _ = a.shape
    x0, y0, x1, y1 = max(x0, 0), max(y0, 1), min(x1, W), min(y1, H - 1)
    top, bot = a[y0 - 1, x0:x1].astype(float), a[y1, x0:x1].astype(float)
    for i, y in enumerate(range(y0, y1)):
        t = (i + 1) / (y1 - y0 + 1)
        a[y, x0:x1] = (top * (1 - t) + bot * t).astype(a.dtype)

def declick(src, dst):
    a = np.array(Image.open(src).convert('RGB'))
    r, g, b = a[..., 0].astype(int), a[..., 1].astype(int), a[..., 2].astype(int)
    orange = (r > 120) & (r - g > 45) & (g - b > 25) & (g < 140)  # the half-transparent orange dot (~171,108,57)
    for _ in range(2):  # close the gaps where the dot sits over other UI (dilate 2 px)
        o = orange.copy()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)): o |= np.roll(np.roll(orange, dy, 0), dx, 1)
        orange = o
    hits = []
    for x0, y0, x1, y1, n in blobs(orange):
        w, h = x1 - x0, y1 - y0
        if not (18 <= w <= 38 and 18 <= h <= 38 and abs(w - h) <= 8 and n > 0.25 * w * h) or y1 > a.shape[0] - 8: continue
        # the "Clicked" tag sits just right of the dot: extend while the strip stays dark-ish with white text
        cy = (y0 + y1) // 2; ex = x1
        while ex < min(a.shape[1], x1 + 90):
            col = a[max(cy - 9, 0):cy + 10, ex].astype(int)
            if (col.mean() < 70) or (col.max() > 225): ex += 1
            else: break
        if ex - x1 < 30 or y0 < 45: continue  # no tag beside it (a real orange UI icon) or the top nav bar
        hits.append((x0 - 3, y0 - 3, ex + 4, y1 + 3))
    for bx in hits: patch(a, *bx)
    Image.fromarray(a).save(dst)
    return hits

if __name__ == '__main__':
    print(declick(sys.argv[1], sys.argv[2]))
