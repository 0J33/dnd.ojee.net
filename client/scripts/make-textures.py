#!/usr/bin/env python3
"""Draws the tavern's materials as seamless tiles into client/public/tex/.

  oak.webp    oiled dark oak table boards, grain running left to right
  paper.webp  rag paper for notices, sheets and handouts
  slate.webp  a chalk slate, for the join-a-friend board
  brass.webp  brushed brass plate, for the buttons you press

Everything is generated from filtered noise (FFT noise is periodic, so every
tile repeats without a seam). Re-run to change a material:
  python3 client/scripts/make-textures.py
"""
import os
import sys

import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'tex')
rng = np.random.default_rng(int(sys.argv[1]) if len(sys.argv) > 1 else 20261028)


def noise(h, w, fy, fx, falloff=2.0):
    """Periodic noise; fy/fx set the feature size per axis (bigger = finer)."""
    ky = np.fft.fftfreq(h)[:, None] * h / fy
    kx = np.fft.fftfreq(w)[None, :] * w / fx
    k = np.sqrt(ky ** 2 + kx ** 2)
    amp = 1.0 / (1.0 + k ** falloff)
    amp[0, 0] = 0
    spec = amp * np.exp(2j * np.pi * rng.random((h, w)))
    n = np.real(np.fft.ifft2(spec))
    n -= n.min()
    return n / (n.max() + 1e-9)


def mix(a, b, t):
    t = np.clip(t, 0, 1)[..., None]
    return a * (1 - t) + b * t


def hexrgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], dtype=float)


def save(name, rgb, q=84):
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB')
    img.save(os.path.join(OUT, name), 'WEBP', quality=q, method=6)
    print(name, img.size)


def oak(h=512, w=1024, planks=4):
    y = np.arange(h)[:, None].repeat(w, 1).astype(float)
    x = np.arange(w)[None, :].repeat(h, 0).astype(float)
    ph = h / planks
    row = np.floor(y / ph)
    out = np.zeros((h, w, 3))
    dark, mid, light = hexrgb('#1c100a'), hexrgb('#3b2415'), hexrgb('#5e3b22')
    warp = noise(h, w, 3, 1.5)               # slow sway of the growth rings
    streak = noise(h, w, 40, 2.2, 1.6)       # long fibre streaks
    pores = noise(h, w, 180, 6, 1.2)         # open pores
    for p in range(planks):
        m = row == p
        tone = rng.uniform(-0.12, 0.12)
        freq = rng.uniform(0.07, 0.11)
        rings = np.sin((y - p * ph) * freq * 2 * np.pi / 3 + warp * rng.uniform(9, 14) + p * 7.1)
        rings = (rings * 0.5 + 0.5) ** 2.2
        v = 0.42 + tone + 0.22 * rings + 0.28 * (streak - 0.5) - 0.18 * np.clip(pores - 0.62, 0, 1) * 4
        col = mix(mix(dark, mid, v / 0.55), light, (v - 0.55) / 0.45)
        out[m] = col[m]
    # seams between boards: a dark gap with a lit lower lip
    edge = (y % ph)
    out *= np.where(edge < 2, 0.35, 1.0)[..., None]
    out *= np.where((edge >= 2) & (edge < 4), 1.12, 1.0)[..., None]
    # a butt joint in two of the boards (inside the tile, so it still tiles)
    for p, jx in ((1, w * 0.31), (3, w * 0.74)):
        m = (row == p) & (np.abs(x - jx) < 1.5)
        out[m] *= 0.4
    # oil: a soft sheen that breathes across the boards
    out *= (0.92 + 0.16 * noise(h, w, 2, 2))[..., None]
    return out


def paper(n=512):
    base = hexrgb('#e9dcbc')
    mott = noise(n, n, 3, 3)
    fibre = noise(n, n, 90, 90, 1.1)
    hair = noise(n, n, 260, 30, 1.0)
    v = 0.3 * (mott - 0.5) + 0.4 * (fibre - 0.5) + 0.25 * np.clip(hair - 0.7, 0, 1) * 3
    tint = mix(base, hexrgb('#d2bf96'), np.clip(mott - 0.55, 0, 1) * 1.1)
    return tint * (1 + 0.09 * v)[..., None]


def slate(n=512):
    base = hexrgb('#262b2e')
    grain = noise(n, n, 120, 120, 1.0)
    clouds = noise(n, n, 2.5, 2.5)
    smear = noise(n, n, 6, 14)
    col = base * (0.9 + 0.2 * grain)[..., None]
    chalk = np.clip(smear - 0.55, 0, 1) * 0.35 * clouds
    return mix(col, hexrgb('#c9cfcf'), chalk)


def brass(h=128, w=512):
    # brushed: fine streaks along x, a little tarnish, warm metal ramp
    brush = noise(h, w, 90, 2, 1.0)
    tarnish = noise(h, w, 3, 4)
    v = 0.55 + 0.35 * (brush - 0.5) - 0.25 * np.clip(tarnish - 0.62, 0, 1) * 2
    lo, mid, hi = hexrgb('#8a6228'), hexrgb('#c99d52'), hexrgb('#f0d796')
    return mix(mix(lo, mid, v / 0.55), hi, (v - 0.55) / 0.45)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    save('oak.webp', oak())
    save('paper.webp', paper())
    save('slate.webp', slate())
    save('brass.webp', brass())
