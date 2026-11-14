"""Prépare les données NASA d'ARES NAV pour un fonctionnement hors ligne.

À lancer une fois, avec internet (quelques minutes, le serveur Mars Trek est lent) :
    python tools/build_data.py            # tout
    python tools/build_data.py tiles      # seulement les tuiles de carte
    python tools/build_data.py zone       # seulement la zone de sortie

Produit :
    tiles/<vue>/<z>/<ligne>/<colonne>.(jpg|png)   tuiles de carte (projection équirectangulaire Mars Trek)
    tiles/index.js                                liste des tuiles présentes (la carte ne demande que celles-là)
    data/zone.js                                  altitude (MNT HiRISE) et sable (imagerie HiRISE) de la zone de sortie
    assets/zone/*.jpg                             images de la zone pour la page de présentation

Sources : NASA Mars Trek (https://trek.nasa.gov/mars). Dépendances : Pillow, numpy.
"""
import io
import json
import sys
import time
import base64
import urllib.request
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TILES = ROOT / "tiles"
EQ = "https://trek.nasa.gov/tiles/Mars/EQ/{layer}/1.0.0/default/default028mm/{z}/{r}/{c}.{ext}"
T = 256

# Emprises (lon min, lat min, lon max, lat max), en degrés est / nord.
WORLD = (-180, -90, 180, 90)
GALE = (135.2, -6.6, 139.3, -2.8)            # cratère Gale entier
STRIP = (137.12, -4.93, 137.73, -4.25)       # couverture HiRISE autour de la route de Curiosity
SURROUND = (137.2, -4.93, 137.6, -4.55)      # nord du mont Sharp
ZONE = (137.33, -4.75, 137.41, -4.69)        # zone de sortie (≈ 4,7 × 3,5 km)

# vue -> (couche Mars Trek, extension source, [(zmin, zmax, emprise), ...])
LAYERS = {
    "viking": ("Mars_Viking_MDIM21_ClrMosaic_global_232m", "jpg", [(0, 3, WORLD), (4, 7, GALE)]),
    "relief": ("Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp_lzw", "jpg", [(0, 3, WORLD), (4, 8, GALE)]),
    "ctx": ("Gale_CTX_BlockAdj_dd", "png", [(5, 9, GALE), (10, 12, SURROUND)]),
    "hirise": ("curiosity_hirise_mosaic", "png", [(10, 11, STRIP), (12, 12, SURROUND), (13, 15, ZONE)]),
    "themis": ("THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018", "png", [(4, 7, GALE), (8, 10, SURROUND)]),
}

# Étalonnage du MNT HiRISE de Gale (Gale_DEM_SMG_1m, tuiles 8 bits) par régression sur MOLA :
# MOLA 8 bits = linéaire de -8200 m (0) à +21230 m (255), vérifié sur Hellas et Olympus Mons ;
# sur l'emprise HiRISE, MOLA = 0,1601 × MNT + 30,95 (r = 0,999, 806 points)
# d'où altitude = -4629 m + 18,48 m × niveau. Précision : un niveau = 18,5 m.
DEM_M_PER_LEVEL = 18.48
DEM_OFFSET_M = -4629.0
MARS_R = 3389500.0


CACHE = ROOT / "tools" / ".cache"


def fetch(url, tries=4):
    import hashlib
    cached = CACHE / hashlib.sha1(url.encode()).hexdigest()
    if cached.exists():
        return cached.read_bytes() or None
    err = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=90) as f:
                data = f.read()
            CACHE.mkdir(parents=True, exist_ok=True)
            cached.write_bytes(data)
            return data
        except urllib.error.HTTPError as e:
            if e.code == 404:
                CACHE.mkdir(parents=True, exist_ok=True)
                cached.write_bytes(b"")
                return None
            err = e
        except Exception as e:  # réseau lent ou coupé : on réessaie
            err = e
        time.sleep(1 + 2 * i)
    print("  échec", url, err, file=sys.stderr)
    return None


def tile_range(z, box):
    deg = 180 / 2 ** z
    lon0, lat0, lon1, lat1 = box
    cmax, rmax = 2 ** (z + 1) - 1, 2 ** z - 1
    c0, c1 = int((lon0 + 180) // deg), min(cmax, int((lon1 + 180) // deg))
    r0, r1 = int((90 - lat1) // deg), min(rmax, int((90 - lat0) // deg))
    return [(r, c) for r in range(max(0, r0), r1 + 1) for c in range(max(0, c0), c1 + 1)]


def save_tile(name, z, r, c, data):
    """Enregistre en JPEG si la tuile est opaque (plus léger), sinon en PNG. Renvoie 'j', 'p' ou None."""
    im = Image.open(io.BytesIO(data))
    im.load()
    has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    if has_alpha:
        a = np.asarray(im.convert("RGBA"))[..., 3]
        if a.max() == 0:
            return None                      # tuile vide : on ne la garde pas
        if a.min() < 250:
            out = TILES / name / str(z) / str(r) / f"{c}.png"
            out.parent.mkdir(parents=True, exist_ok=True)
            im.convert("LA" if im.mode in ("L", "LA") else "RGBA").save(out, optimize=True)
            return "p"
    rgb = im.convert("RGB")
    arr = np.asarray(rgb)
    gray = np.abs(arr[..., 0].astype(int) - arr[..., 2]).max() < 4
    out = TILES / name / str(z) / str(r) / f"{c}.jpg"
    out.parent.mkdir(parents=True, exist_ok=True)
    (rgb.convert("L") if gray else rgb).save(out, quality=82, optimize=True)
    return "j"


def build_tiles():
    index_file = TILES / "index.json"
    index = json.loads(index_file.read_text()) if index_file.exists() else {}
    for name, (layer, ext, ranges) in LAYERS.items():
        idx = index.setdefault(name, {})
        jobs = []
        for zmin, zmax, box in ranges:
            for z in range(zmin, zmax + 1):
                for r, c in tile_range(z, box):
                    key = f"{z}/{r}/{c}"
                    if key not in idx:
                        jobs.append((z, r, c))
        print(f"{name}: {len(jobs)} tuiles à télécharger ({len(idx)} déjà présentes)")

        def work(job):
            z, r, c = job
            data = fetch(EQ.format(layer=layer, z=z, r=r, c=c, ext=ext))
            return job, (save_tile(name, z, r, c, data) if data else None)

        done = 0
        with ThreadPoolExecutor(12) as ex:
            for (z, r, c), kind in ex.map(work, jobs):
                if kind:
                    idx[f"{z}/{r}/{c}"] = kind
                done += 1
                if done % 50 == 0:
                    print(f"  {done}/{len(jobs)}")
                    index_file.write_text(json.dumps(index))
        index_file.write_text(json.dumps(index))
    meta = {name: {"source": layer} for name, (layer, _, _) in LAYERS.items()}
    js = "// Généré par tools/build_data.py : tuiles présentes localement (j = jpg, p = png).\n"
    js += "window.ARES_TILES = " + json.dumps({"layers": index, "meta": meta}, separators=(",", ":")) + ";\n"
    (TILES / "index.js").write_text(js, encoding="utf-8")
    print("tiles/index.js écrit")


def mosaic(layer, ext, z, box, mode):
    deg = 180 / 2 ** z
    cells = tile_range(z, box)
    rows = sorted({r for r, _ in cells}); cols = sorted({c for _, c in cells})
    with ThreadPoolExecutor(12) as ex:
        datas = list(ex.map(lambda rc: fetch(EQ.format(layer=layer, z=z, r=rc[0], c=rc[1], ext=ext)), cells))
    im = Image.new(mode, (len(cols) * T, len(rows) * T))
    for (r, c), d in zip(cells, datas):
        if d:
            im.paste(Image.open(io.BytesIO(d)).convert(mode), ((c - cols[0]) * T, (r - rows[0]) * T))
    px = T / deg
    lon0, lat0, lon1, lat1 = box
    crop = (round((lon0 + 180 - cols[0] * deg) * px), round((90 - lat1 - rows[0] * deg) * px),
            round((lon1 + 180 - cols[0] * deg) * px), round((90 - lat0 - rows[0] * deg) * px))
    return im.crop(crop)


def gauss(a, sigma):
    r = int(3 * sigma)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2); k /= k.sum()
    p = np.pad(a, r, mode="edge")
    p = np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 1, p)
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 0, p)


def box_mean(a, n):
    k = np.ones(n) / n
    p = np.pad(a, n // 2, mode="edge")
    p = np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 1, p)
    return np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 0, p)[: a.shape[0], : a.shape[1]]


def build_zone():
    lon0, lat0, lon1, lat1 = ZONE
    lat_c = (lat0 + lat1) / 2
    m_per_deg_lat = MARS_R * np.pi / 180
    m_per_deg_lon = m_per_deg_lat * np.cos(np.radians(lat_c))
    W_m, H_m = (lon1 - lon0) * m_per_deg_lon, (lat1 - lat0) * m_per_deg_lat
    cell = 20.0
    nx, ny = int(round(W_m / cell)), int(round(H_m / cell))
    print(f"zone {W_m:.0f} × {H_m:.0f} m, grille {nx} × {ny} de {cell:.0f} m")

    # Altitude : MNT HiRISE (zoom 13 ≈ 5 m/px), étalonné. Les tuiles 8 bits forment des marches de 18,5 m :
    # on reconstruit une surface continue en interpolant, pour chaque pixel, entre la courbe de niveau
    # inférieure et la courbe supérieure les plus proches (là où elles sont serrées, la pente est forte).
    from scipy.ndimage import distance_transform_edt
    lv = np.asarray(mosaic("Gale_DEM_SMG_1m", "png", 13, ZONE, "L"), int)
    cap = 60.0                                                    # px (≈ 300 m) : bornage aux sommets et creux
    frac = np.full(lv.shape, 0.5)
    for v in np.unique(lv):
        here = lv == v
        d_dn = np.minimum(distance_transform_edt(lv >= v), cap) if (lv < v).any() else np.full(lv.shape, cap)
        d_up = np.minimum(distance_transform_edt(lv <= v), cap) if (lv > v).any() else np.full(lv.shape, cap)
        frac[here] = (d_dn / (d_dn + d_up))[here]
    elev = DEM_OFFSET_M + DEM_M_PER_LEVEL * (lv - 0.5 + frac)
    elev = gauss(elev, sigma=3)                                   # ≈ 15 m
    elev_g = np.asarray(Image.fromarray(elev.astype(np.float32), "F").resize((nx, ny), Image.BILINEAR), float)

    # Sable : zones sombres ET lisses de l'image HiRISE (zoom 14 ≈ 2,6 m/px) = dunes.
    hi = mosaic("curiosity_hirise_mosaic", "png", 14, ZONE, "L")
    h = np.asarray(hi, float)
    mean = box_mean(h, 15)
    std = np.sqrt(np.maximum(box_mean(h * h, 15) - mean ** 2, 0))
    dark = mean < np.percentile(mean, 22)
    smooth = std < np.percentile(std, 45)
    from scipy.ndimage import label
    sand = (dark & smooth).astype(float)
    sand = gauss(sand, sigma=6) > 0.5
    lab, n = label(sand)                                          # on écarte les taches < 1,5 ha
    sizes = np.bincount(lab.ravel())
    sand = (sizes[lab] >= 15000 / 2.6 ** 2) & (lab > 0)
    sand = sand.astype(float)
    sand_g = np.asarray(Image.fromarray(sand.astype(np.float32), "F").resize((nx, ny), Image.BILINEAR), float) > 0.5

    # Pentes (pour contrôle uniquement : la page les recalcule).
    gy, gx = np.gradient(elev_g, cell)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    print(f"altitude {elev_g.min():.0f} à {elev_g.max():.0f} m ; pente max {slope.max():.1f}° ; "
          f">20° : {100 * (slope > 20).mean():.1f} % ; >15° : {100 * (slope > 15).mean():.1f} % ; sable : {100 * sand_g.mean():.1f} %")

    # ---- Classement du terrain par apprentissage non supervisé (k-moyennes) ----
    # Variables par cellule de 20 m : luminosité et texture HiRISE (échelles 40 m et 120 m), pente du MNT.
    def to_grid(a):
        return np.asarray(Image.fromarray(a.astype(np.float32), "F").resize((nx, ny), Image.BOX), float)
    mean_g, std_g = to_grid(mean), to_grid(std)
    ctx_g = gauss(mean_g, sigma=3)
    X = np.stack([mean_g, std_g, ctx_g, slope], -1).reshape(-1, 4)
    mu, sd = X.mean(0), X.std(0) + 1e-9
    Z = (X - mu) / sd
    K = 6
    rng = np.random.default_rng(42)
    cent = Z[rng.choice(len(Z), 1)]
    for _ in range(K - 1):                                        # initialisation k-means++
        d2 = ((Z[:, None, :] - cent[None]) ** 2).sum(-1).min(1)
        cent = np.vstack([cent, Z[rng.choice(len(Z), 1, p=d2 / d2.sum())]])
    for _ in range(60):
        dist = ((Z[:, None, :] - cent[None]) ** 2).sum(-1)
        lab_ = dist.argmin(1)
        new = np.array([Z[lab_ == k].mean(0) if (lab_ == k).any() else cent[k] for k in range(K)])
        if np.allclose(new, cent, atol=1e-5):
            break
        cent = new
    dist = np.sqrt(((Z[:, None, :] - cent[None]) ** 2).sum(-1))
    c_raw = cent * sd + mu                                        # centres en unités physiques
    # Nommage des groupes à partir de leurs centres : 0 sol compact, 1 sable, 2 roche rugueuse, 3 affleurement clair, 4 pente raide
    names = {}
    left = list(range(K))
    k = min(left, key=lambda i: cent[i, 0] + cent[i, 1] * 0.7); names[k] = 1; left.remove(k)
    k = max(left, key=lambda i: c_raw[i, 3])
    if c_raw[k, 3] > 11: names[k] = 4; left.remove(k)
    k = max(left, key=lambda i: cent[i, 1]); names[k] = 2; left.remove(k)
    k = max(left, key=lambda i: cent[i, 0]); names[k] = 3; left.remove(k)
    for k in left: names[k] = 0
    cls_raw = np.vectorize(names.get)(dist.argmin(1)).reshape(ny, nx)
    # Lissage spatial (vote des voisins) et confiance (écart entre les deux groupes les plus proches)
    onehot = np.stack([gauss((cls_raw == c).astype(float), 1.0) for c in range(5)], -1)
    cls = onehot.argmax(-1).astype(np.uint8)
    ds = np.sort(dist, 1)
    conf = np.clip(0.5 + (ds[:, 1] - ds[:, 0]) / (ds[:, 1] + 1e-9), 0, 1).reshape(ny, nx)
    conf = np.round(np.minimum(conf, onehot.max(-1) / onehot.sum(-1)) * 255).astype(np.uint8)
    for k in range(K):
        print(f"  groupe {k} -> classe {names[k]} : lum {c_raw[k,0]:.0f}, texture {c_raw[k,1]:.1f}, pente {c_raw[k,3]:.1f}°, {100*(dist.argmin(1)==k).mean():.1f} %")
    print("  classes :", {c: f"{100 * (cls == c).mean():.1f} %" for c in range(5)})
    sand_g = cls == 1                                             # le sable de l'itinéraire = classe « sable » du modèle

    q = np.round(elev_g * 2).astype("<i2")                       # demi-mètres
    data = {
        "bounds": [lon0, lat0, lon1, lat1], "nx": nx, "ny": ny, "cell": cell,
        "mPerDegLon": m_per_deg_lon, "mPerDegLat": m_per_deg_lat,
        "elev": base64.b64encode(q.tobytes()).decode(),
        "sand": base64.b64encode(np.packbits(sand_g.astype(np.uint8)).tobytes()).decode(),
        "cls": base64.b64encode(cls.tobytes()).decode(),
        "conf": base64.b64encode(conf.tobytes()).decode(),
        "classes": ["sol compact", "sable", "roche rugueuse", "affleurement clair", "pente raide"],
        "source": {
            "elev": "MRO HiRISE · MNT de Gale (Mars Trek), étalonné sur MGS MOLA, précision ≈ 18 m",
            "sand": "Classe « sable » du modèle de terrain",
            "cls": "Classement non supervisé (k-moyennes, 6 groupes) : luminosité et texture HiRISE, pente du MNT",
        },
    }
    out = ROOT / "data" / "zone.js"
    out.parent.mkdir(exist_ok=True)
    out.write_text("// Généré par tools/build_data.py\nwindow.ARES_ZONE = " + json.dumps(data) + ";\n", encoding="utf-8")
    print("data/zone.js écrit", out.stat().st_size // 1024, "Ko")

    # Images de la zone pour la page de présentation.
    z = ROOT / "assets" / "zone"
    z.mkdir(parents=True, exist_ok=True)
    w = 1400
    hi.resize((w, round(w * hi.height / hi.width)), Image.LANCZOS).save(z / "hirise.jpg", quality=84, optimize=True, progressive=True)
    th = mosaic("THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018", "png", 9, ZONE, "L")
    th = th.resize((w // 2, round(w // 2 * th.height / th.width)), Image.BICUBIC)
    th.save(z / "themis.jpg", quality=88)
    # Version en fausses couleurs (contraste étiré) : violet = froid la nuit (sable), jaune = chaud (roche).
    a = np.asarray(th, float)
    lo_, hi_ = np.percentile(a, [2, 98])
    t = np.clip((a - lo_) / max(1, hi_ - lo_), 0, 1)
    stops = np.array([0, .35, .6, .8, 1]); cols = np.array([[26, 11, 59], [107, 29, 110], [201, 60, 60], [255, 138, 42], [255, 224, 102]], float)
    rgb = np.stack([np.interp(t, stops, cols[:, i]) for i in range(3)], -1).astype(np.uint8)
    Image.fromarray(rgb, "RGB").save(z / "themis-color.jpg", quality=88)
    ctx = mosaic("Gale_CTX_BlockAdj_dd", "png", 12, ZONE, "L")
    ctx.resize((w // 2, round(w // 2 * ctx.height / ctx.width)), Image.LANCZOS).save(z / "ctx.jpg", quality=86)
    print("assets/zone/*.jpg écrits")


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("all", "zone"):
        build_zone()
    if what in ("all", "tiles"):
        build_tiles()
