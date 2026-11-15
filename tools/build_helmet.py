"""Texture du terrain pour la vue casque (casque.html).

    python tools/build_helmet.py
Assemble les tuiles HiRISE locales (zoom 14, ≈ 2,6 m/px) sur l'emprise exacte de la zone de sortie
et l'écrit en data URI dans assets/casque/terrain-data.js (WebGL refuse les images file://).
"""
import base64
import io
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
T, Z = 256, 14
LON0, LAT0, LON1, LAT1 = 137.33, -4.75, 137.41, -4.69   # = ZONE de build_data.py

idx = json.loads((ROOT / "tiles" / "index.json").read_text())["hirise"]
deg = 180 / 2 ** Z
c0, c1 = int((LON0 + 180) // deg), int((LON1 + 180) // deg)
r0, r1 = int((90 - LAT1) // deg), int((90 - LAT0) // deg)
big = Image.new("L", ((c1 - c0 + 1) * T, (r1 - r0 + 1) * T), 90)
for r in range(r0, r1 + 1):
    for c in range(c0, c1 + 1):
        k = idx.get(f"{Z}/{r}/{c}")
        if k:
            big.paste(Image.open(ROOT / "tiles" / "hirise" / str(Z) / str(r) / f"{c}.{'jpg' if k == 'j' else 'png'}").convert("L"), ((c - c0) * T, (r - r0) * T))
px = T / deg
crop = big.crop((round((LON0 + 180 - c0 * deg) * px), round((90 - LAT1 - r0 * deg) * px),
                 round((LON1 + 180 - c0 * deg) * px), round((90 - LAT0 - r0 * deg) * px)))
crop = crop.resize((2048, round(2048 * crop.height / crop.width)), Image.LANCZOS)
# Teinte martienne légère (HiRISE est en niveaux de gris ici)
rgb = Image.merge("RGB", [crop.point(lambda v: min(255, int(v * 1.08 + 18))), crop.point(lambda v: int(v * 0.82 + 8)), crop.point(lambda v: int(v * 0.64))])
buf = io.BytesIO(); rgb.save(buf, "JPEG", quality=80, optimize=True, progressive=True)
out = ROOT / "assets" / "casque" / "terrain-data.js"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text("// Généré par tools/build_helmet.py : image HiRISE de la zone de sortie (NASA/JPL/UArizona).\n"
               "window.ARES_TERRAIN = 'data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode() + "';\n", encoding="utf-8")
print(crop.size, out.stat().st_size // 1024, "Ko")
