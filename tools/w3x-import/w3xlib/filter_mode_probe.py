"""🔬 GH#841 —— filter-mode 對照表的**量尺**（⛔ 不是一份抄本）。

它組一份**合成的** MDX 模型（每個 filter mode 一份材質），跑**出貨的**
`gltf.convert()`，然後把 glb 裡真的位元組讀回來：alphaMode、有沒有 emissive、
以及 baseColor 貼圖**每一個 texel 的 alpha**。

⭐ 為什麼要讀 alpha 而不是只讀 alphaMode：`fm5 Modulate` 翻成
「黑色 ＋ alpha = 1 − 亮度」的 BLEND —— **同一個 alphaMode**（BLEND）可以是
「相加發光」也可以是「相乘變暗」，⛔ 只看 alphaMode 分不出來。
⇒ 量尺要能同時量到**兩個方向**：
  · 黑貼圖走 Modulate ⇒ alpha 必須是 255（**真的會變暗**）
  · 白貼圖走 Modulate ⇒ alpha 必須是 0（**不可以變暗**，那是恆等）
一把只驗過單邊的尺不算自證過（CLAUDE.md）。

    python3 -m w3xlib.filter_mode_probe        # stdout 一份 JSON
"""

from __future__ import annotations

import io
import json
import struct
import sys

from .gltf import convert
from .mdx import Geoset, Layer, Material, MDXModel, Texture

# 合成貼圖：(名字, RGB, alpha) —— ⛔ 不用任何暴雪資產。
_SWATCHES: dict[str, tuple[tuple[int, int, int], object]] = {
    "white": ((255, 255, 255), 255),        # 亮 → Modulate 是恆等
    "black": ((0, 0, 0), 255),              # 暗 → Modulate 全黑
    "gray50": ((128, 128, 128), 255),       # ⭐ 分得出 Modulate 與 Modulate2x
    "cutout": ((200, 40, 40), "cutout"),    # 1-bit alpha → hint "mask"
    "smooth": ((200, 40, 40), "ramp"),      # 漸層 alpha → hint "blend"
    "glow": ((255, 230, 120), 255),         # 亮在黑底上、alpha 平坦 → hint "opaque"
}

#: (filterMode, 貼圖名) —— 最後一列是**兩層**的材質（疊加層必須活下來）。
PROBES: list[tuple[str, list[tuple[int, str]]]] = [
    ("fm0-none", [(0, "white")]),
    ("fm1-transparent-flat-alpha", [(1, "glow")]),
    ("fm1-transparent-cutout", [(1, "cutout")]),
    ("fm2-blend-smooth", [(2, "smooth")]),
    ("fm3-additive", [(3, "glow")]),
    ("fm4-addalpha", [(4, "smooth")]),
    ("fm5-modulate-black", [(5, "black")]),
    ("fm5-modulate-white", [(5, "white")]),
    ("fm5-modulate-gray", [(5, "gray50")]),
    ("fm6-modulate2x-gray", [(6, "gray50")]),
    ("fm99-unknown", [(99, "smooth")]),
    ("two-layer-opaque-base-plus-blend", [(0, "white"), (2, "smooth")]),
]


def _png(rgb, alpha) -> tuple[bytes, str]:
    from PIL import Image
    from .models import _alpha_hint
    n = 16
    img = Image.new("RGBA", (n, n), (*rgb, 255))
    if alpha == "cutout":
        a = Image.new("L", (n, n), 0)
        a.paste(255, (0, 0, n, n // 2))
    elif alpha == "ramp":
        a = Image.new("L", (n, n))
        a.putdata([int(255 * (i % n) / (n - 1)) for i in range(n * n)])
    else:
        a = Image.new("L", (n, n), int(alpha))
    img.putalpha(a)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue(), _alpha_hint(img)


def _quad(material_id: int) -> Geoset:
    v = [(-1.0, -1.0, 0.0), (1.0, -1.0, 0.0), (1.0, 1.0, 0.0), (-1.0, 1.0, 0.0)]
    return Geoset(vertices=v, normals=[(0.0, 0.0, 1.0)] * 4,
                  uvs=[(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)],
                  faces=[0, 1, 2, 0, 2, 3], vertex_groups=[0] * 4,
                  matrix_groups=[[]], material_id=material_id)


def _glb_parts(glb: bytes) -> tuple[dict, bytes]:
    jlen = struct.unpack_from("<I", glb, 12)[0]
    doc = json.loads(glb[20:20 + jlen].decode("utf-8"))
    bin_start = 20 + jlen + 8
    return doc, glb[bin_start:]


def _alpha_stats(doc: dict, blob: bytes, tex_index: int) -> dict:
    from PIL import Image
    src = doc["textures"][tex_index]["source"]
    bv = doc["bufferViews"][doc["images"][src]["bufferView"]]
    off = bv.get("byteOffset", 0)
    png = blob[off:off + bv["byteLength"]]
    a = Image.open(io.BytesIO(png)).convert("RGBA").getchannel("A")
    data = list(a.getdata())
    return {"min": min(data), "max": max(data),
            "mean": round(sum(data) / len(data), 1)}


def run() -> dict:
    tex_png: dict[int, bytes] = {}
    tex_alpha: dict[int, str] = {}
    names = list(_SWATCHES)
    for i, key in enumerate(names):
        tex_png[i], tex_alpha[i] = _png(*_SWATCHES[key])
    model = MDXModel(name="filter-mode-probe")
    model.textures = [Texture(0, f"probe\\{k}.blp") for k in names]
    for _label, layers in PROBES:
        model.materials.append(Material(layers=[
            Layer(filter_mode=fm, shading_flags=0, texture_id=names.index(tex),
                  alpha=1.0) for fm, tex in layers]))
        model.geosets.append(_quad(len(model.materials) - 1))
    res = convert(model, tex_png, 1.0, "probe.mdx", tex_alpha)
    doc, blob = _glb_parts(res.glb)
    prim_mats: list[list[int]] = [[] for _ in PROBES]
    for prim in doc["meshes"][0]["primitives"]:
        mat = doc["materials"][prim["material"]]
        prim_mats[mat["extras"]["w3x"]["material"]].append(prim["material"])
    out = {"notes": res.notes, "probes": {}}
    for pi, (label, _layers) in enumerate(PROBES):
        mats = []
        for mi in prim_mats[pi]:
            m = doc["materials"][mi]
            pbr = m.get("pbrMetallicRoughness", {})
            entry = {
                "name": m.get("name"),
                "alphaMode": m.get("alphaMode", "OPAQUE"),
                "alphaCutoff": m.get("alphaCutoff"),
                "emissive": "emissiveTexture" in m,
                "baseColorFactor": pbr.get("baseColorFactor"),
                "extras": m.get("extras"),
            }
            if "baseColorTexture" in pbr:
                entry["textureAlpha"] = _alpha_stats(
                    doc, blob, pbr["baseColorTexture"]["index"])
            mats.append(entry)
        out["probes"][label] = mats
    return out


if __name__ == "__main__":
    json.dump(run(), sys.stdout, indent=1, ensure_ascii=False)
    sys.stdout.write("\n")
