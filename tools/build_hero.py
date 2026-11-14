"""Visuels de l'accueil, à partir des vraies données NASA déjà présentes dans le projet.

    python tools/build_hero.py
Produit assets/hero/{mars,gale,zone}.webp : disques ombrés (fond transparent) pour le carrousel d'échelles.
- mars : mosaïque Viking (assets/mars-viking-4k.jpg) en projection orthographique, centrée sur Gale
- gale : mosaïque CTX du cratère (tuiles locales tiles/ctx/8)
- zone : image HiRISE de la zone de sortie (assets/zone/hirise.jpg)
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "hero"
S = 900


def shade_disc(rgb, light=(-0.55, -0.45, 0.7), rim=(255, 120, 60)):
    """Applique un éclairage sphérique et un liseré d'atmosphère à une image carrée."""
    n = rgb.shape[0]
    yy, xx = np.mgrid[0:n, 0:n]
    u = (xx + 0.5) / n * 2 - 1; v = (yy + 0.5) / n * 2 - 1
    r2 = u * u + v * v
    inside = r2 <= 1
    z = np.sqrt(np.clip(1 - r2, 0, 1))
    L = np.array(light) / np.linalg.norm(light)
    lam = np.clip(u * L[0] + v * L[1] + z * L[2], 0, 1)
    k = 0.18 + 0.95 * lam ** 0.9
    out = rgb.astype(float) * k[..., None]
    edge = np.clip((np.sqrt(r2) - 0.86) / 0.14, 0, 1) ** 2 * np.clip(lam * 1.4 + 0.2, 0, 1)
    out = out * (1 - edge[..., None] * 0.55) + np.array(rim) * edge[..., None] * 0.55
    alpha = np.clip((1 - np.sqrt(r2)) * n / 2, 0, 1) * 255
    return np.dstack([np.clip(out, 0, 255), alpha]).astype(np.uint8)


def mars():
    tex = np.asarray(Image.open(ROOT / "assets" / "mars-viking-4k.jpg").convert("RGB"), float)
    th, tw = tex.shape[:2]
    lat0, lon0 = np.radians(-8), np.radians(130)
    yy, xx = np.mgrid[0:S, 0:S]
    x = (xx + 0.5) / S * 2 - 1; y = 1 - (yy + 0.5) / S * 2
    rho = np.sqrt(x * x + y * y); c = np.arcsin(np.clip(rho, 0, 1))
    lat = np.arcsin(np.clip(np.cos(c) * np.sin(lat0) + np.where(rho > 0, y * np.sin(c) * np.cos(lat0) / np.maximum(rho, 1e-9), 0), -1, 1))
    lon = lon0 + np.arctan2(x * np.sin(c), rho * np.cos(c) * np.cos(lat0) - y * np.sin(c) * np.sin(lat0))
    px = ((np.degrees(lon) + 180) % 360) / 360 * (tw - 1)
    py = (90 - np.degrees(lat)) / 180 * (th - 1)
    rgb = tex[py.astype(int).clip(0, th - 1), px.astype(int).clip(0, tw - 1)]
    return shade_disc(rgb)


def gale():
    idx = json.loads((ROOT / "tiles" / "index.json").read_text())["ctx"]
    z, T = 8, 256
    deg = 180 / 2 ** z
    lat_c, lon_c, half = -5.35, 137.8, 1.25
    r0, r1 = int((90 - (lat_c + half)) // deg), int((90 - (lat_c - half)) // deg)
    c0, c1 = int((lon_c - half + 180) // deg), int((lon_c + half + 180) // deg)
    big = Image.new("L", ((c1 - c0 + 1) * T, (r1 - r0 + 1) * T))
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            k = idx.get(f"{z}/{r}/{c}")
            if k:
                big.paste(Image.open(ROOT / "tiles" / "ctx" / str(z) / str(r) / f"{c}.{'jpg' if k == 'j' else 'png'}").convert("L"), ((c - c0) * T, (r - r0) * T))
    px = T / deg
    box = (round((lon_c - half + 180 - c0 * deg) * px), round((90 - (lat_c + half) - r0 * deg) * px),
           round((lon_c + half + 180 - c0 * deg) * px), round((90 - (lat_c - half) - r0 * deg) * px))
    im = big.crop(box).resize((S, S), Image.LANCZOS)
    a = np.asarray(im, float)
    a = np.clip((a - np.percentile(a, 1)) / (np.percentile(a, 99.5) - np.percentile(a, 1)), 0, 1) * 255
    tint = np.stack([a * 1.0, a * 0.78, a * 0.62], -1)              # teinte martienne légère (image en niveaux de gris)
    return shade_disc(tint, rim=(255, 140, 80))


def zone():
    im = Image.open(ROOT / "assets" / "zone" / "hirise.jpg").convert("L")
    w, h = im.size
    im = im.crop(((w - h) // 2, 0, (w - h) // 2 + h, h)).resize((S, S), Image.LANCZOS)
    a = np.asarray(im, float)
    a = np.clip((a - np.percentile(a, 1)) / (np.percentile(a, 99.5) - np.percentile(a, 1)), 0, 1) * 255
    tint = np.stack([a * 1.0, a * 0.8, a * 0.66], -1)
    return shade_disc(tint, rim=(255, 150, 90))


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in (("mars", mars), ("gale", gale), ("zone", zone)):
        Image.fromarray(fn(), "RGBA").save(OUT / f"{name}.webp", quality=86, method=6)
        print(name, (OUT / f"{name}.webp").stat().st_size // 1024, "Ko")
