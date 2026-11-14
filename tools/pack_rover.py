"""Allège le modèle 3D officiel de Curiosity (NASA) et l'embarque pour la page de présentation.

Source : https://science.nasa.gov/resource/curiosity-rover-3d-model/ (24584_Curiosity_static.glb)
    python tools/pack_rover.py
Entrée : assets/models/curiosity.glb ; sortie : assets/models/curiosity-light.glb et assets/models/rover-data.js
(les textures PNG sont recompressées en JPEG ≤ 1024 px ; la géométrie n'est pas modifiée).
"""
import base64
import io
import json
import struct
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "models" / "curiosity.glb"
MAX = 1024


def read_glb(b):
    jlen = struct.unpack("<I", b[12:16])[0]
    j = json.loads(b[20:20 + jlen])
    off = 20 + jlen
    blen = struct.unpack("<I", b[off:off + 4])[0]
    return j, b[off + 8: off + 8 + blen]


def pad4(data, fill=b"\x00"):
    return data + fill * ((4 - len(data) % 4) % 4)


def main():
    j, bin_ = read_glb(SRC.read_bytes())
    image_views = {im["bufferView"] for im in j["images"]}
    new_bin = bytearray()
    cache = {}
    for i, bv in enumerate(j["bufferViews"]):
        data = bin_[bv.get("byteOffset", 0): bv.get("byteOffset", 0) + bv["byteLength"]]
        if i in image_views:
            if i not in cache:
                im = Image.open(io.BytesIO(data)); im.load()
                im.thumbnail((MAX, MAX), Image.LANCZOS)
                alpha = im.mode in ("RGBA", "LA") and np.asarray(im.convert("RGBA"))[..., 3].min() < 250
                out = io.BytesIO()
                if alpha:
                    im.save(out, "PNG", optimize=True); mime = "image/png"
                else:
                    im.convert("RGB").save(out, "JPEG", quality=82, optimize=True); mime = "image/jpeg"
                cache[i] = (out.getvalue(), mime)
            data, mime = cache[i]
            for im in j["images"]:
                if im["bufferView"] == i:
                    im["mimeType"] = mime
        while len(new_bin) % 4:
            new_bin += b"\x00"
        bv["byteOffset"] = len(new_bin)
        bv["byteLength"] = len(data)
        new_bin += data
    new_bin = pad4(bytes(new_bin))
    j["buffers"][0]["byteLength"] = len(new_bin)
    js = pad4(json.dumps(j, separators=(",", ":")).encode(), b" ")
    glb = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(new_bin))
    glb += struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(new_bin), 0x004E4942) + new_bin
    light = ROOT / "assets" / "models" / "curiosity-light.glb"
    light.write_bytes(glb)
    (ROOT / "assets" / "models" / "rover-data.js").write_text(
        "// Généré par tools/pack_rover.py : modèle 3D de Curiosity (NASA/JPL-Caltech), textures allégées.\n"
        "window.ARES_ROVER = '" + base64.b64encode(glb).decode() + "';\n", encoding="utf-8")
    print("GLB", SRC.stat().st_size // 1024, "Ko ->", len(glb) // 1024, "Ko")


if __name__ == "__main__":
    main()
