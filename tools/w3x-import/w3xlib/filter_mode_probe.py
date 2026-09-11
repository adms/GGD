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
    "whiteCarrier": ((255, 255, 255), "white-carrier"),
}

#: (filterMode, 貼圖名) —— 最後一列是**兩層**的材質（疊加層必須活下來）。
PROBES: list[tuple[str, list[tuple[int, str]]]] = [
    ("fm0-none", [(0, "white")]),
    ("fm1-transparent-flat-alpha", [(1, "glow")]),
    ("fm1-transparent-cutout", [(1, "cutout")]),
    ("fm2-blend-smooth", [(2, "smooth")]),
    ("fm3-additive", [(3, "glow")]),
    # The transparent half retains bright RGB in the source PNG.  This is safe
    # in ordinary alpha blending and a solid rectangle under ONE+ONE unless the
    # converter clears RGB below alpha=0.
    ("fm3-additive-cutout", [(3, "cutout")]),
    ("fm3-additive-white-carrier", [(3, "whiteCarrier")]),
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
    if alpha == "white-carrier":
        # Opaque legacy art whose effect is encoded as contrast against white.
        # ONE+ONE must see a black carrier after conversion.
        for y in range(n // 4, n * 3 // 4):
            for x in range(n // 4, n * 3 // 4):
                img.putpixel((x, y), (45, 90, 140, 255))
        a = Image.new("L", (n, n), 255)
    elif alpha == "cutout":
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


def _texture_stats(doc: dict, blob: bytes, tex_index: int) -> dict:
    from PIL import Image
    src = doc["textures"][tex_index]["source"]
    bv = doc["bufferViews"][doc["images"][src]["bufferView"]]
    off = bv.get("byteOffset", 0)
    png = blob[off:off + bv["byteLength"]]
    rgba = list(Image.open(io.BytesIO(png)).convert("RGBA").getdata())
    alpha = [p[3] for p in rgba]
    transparent = [p for p in rgba if p[3] <= 5]
    bright_transparent = [p for p in transparent if max(p[:3]) > 1]
    return {
        "min": min(alpha), "max": max(alpha),
        "mean": round(sum(alpha) / len(alpha), 1),
        "transparent": len(transparent),
        "brightTransparent": len(bright_transparent),
    }


def run() -> dict:
    tex_png: dict[int, bytes] = {}
    tex_alpha: dict[int, str] = {}
    names = list(_SWATCHES)
    for i, key in enumerate(names):
        tex_png[i], tex_alpha[i] = _png(*_SWATCHES[key])
    # ⭐⭐ **一個案例一顆模型**（⛔ 不是 14 個案例塞進同一顆）。
    #
    # ⛔ 在此之前這裡把 14 個案例當成同一顆模型的 14 份材質，⇒ 而 GH#1164 的
    # **渲染狀態去重**（`gltf.py`「兩份材質如果畫出來逐像素一樣，它們就是同一份」）
    # 會**跨案例**把它們併掉：`fm99-unknown`(BLEND+smooth) 與
    # `fm2-blend-smooth` 畫出來逐像素一樣、`two-layer` 的兩層又分別等於
    # `fm0-none` 與 `fm2-blend-smooth` ⇒ 量到 `merged 3 render-identical materials`，
    # ⭐ 而少掉的正好就是那 3 份 ⇒ 這兩個案例**永遠回 0 份材質**。
    #
    # ⚠️⚠️ ⭐ 去重是**對的**，探針才是壞的 —— ⛔ 而它壞的樣子是
    # 「疊加層靜默消失」與「未知 fm 靜默消失」，⭐ **正好就是這兩條斷言要抓的缺陷**
    # ⇒ 一把量尺在它最需要說話的時候，報出了它本來就在找的那個症狀。
    # （同族：本文件「一把只驗過單邊的尺不算自證過」與假綠燈⑪「兩條各自對的閘，
    #   而沒有人驗接縫」—— 這裡的接縫是 #841 的溯源契約 × #1164 的去重。）
    #
    # ⇒ ⭐ 分開轉之後跨案例的去重**結構上不可能發生**，⛔ 而每個案例仍然跑
    #   出貨的那一支 `convert()`（⛔ 不是換一條假的路徑繞過去）。
    # ⚠️ 貼圖表**每一顆模型都帶全份** —— notes 裡有「texture 6: …」這種以
    #   **索引**指名的句子，只留用到的那幾張會讓索引漂掉。
    notes: list[str] = []
    per_case: list[tuple[dict, bytes, list[int]]] = []
    for _label, layers in PROBES:
        model = MDXModel(name="filter-mode-probe")
        model.textures = [Texture(0, f"probe\\{k}.blp") for k in names]
        model.materials.append(Material(layers=[
            Layer(filter_mode=fm, shading_flags=0, texture_id=names.index(tex),
                  alpha=1.0) for fm, tex in layers]))
        model.geosets.append(_quad(0))
        res = convert(model, tex_png, 1.0, "probe.mdx", tex_alpha)
        notes += res.notes
        doc, blob = _glb_parts(res.glb)
        # ⭐ 只收**真的被 primitive 用到的**材質（⛔ 不是整個 materials 陣列）——
        #   `gltf.py` 刻意不壓縮那個陣列，沒被引用的會留成 UNUSED_OBJECT。
        used: list[int] = []
        for prim in doc["meshes"][0]["primitives"]:
            if prim["material"] not in used:
                used.append(prim["material"])
        per_case.append((doc, blob, used))
    out = {"notes": notes, "probes": {}}
    for pi, (label, _layers) in enumerate(PROBES):
        doc, blob, used = per_case[pi]
        mats = []
        for mi in used:
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
                entry["textureAlpha"] = _texture_stats(
                    doc, blob, pbr["baseColorTexture"]["index"])
            mats.append(entry)
        out["probes"][label] = mats
    return out


if __name__ == "__main__":
    json.dump(run(), sys.stdout, indent=1, ensure_ascii=False)
    sys.stdout.write("\n")
