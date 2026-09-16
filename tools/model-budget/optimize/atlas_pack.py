#!/usr/bin/env python3
"""atlas_pack — the ATLAS stage of the offline batch optimiser (GH#1174 · GH#1198).

⭐ 它解的是**貼圖 stage 解不掉的那一半**：`optimize.ts` 的 texture stage 只會把每一張
貼圖縮小，⛔ 它一張都不會減少 —— 而 draw call 是**每一種畫法一次**，所以
「7 張不同貼圖」永遠是 7 個 draw call，⛔ 不管每一張多小。

判準與 `merge_glb_prims.py` 是同一條，只是反過來用：那一支問「畫法一不一樣」，
⭐ 這一支**把畫法變成一樣** —— 只差 baseColorTexture 的 primitive，把它們的貼圖
併成一張圖集、重映射 UV，於是它們的材質逐位元組相等 ⇒ 幾何接得起來。

─ 一個 primitive 在圖集裡取樣的是什麼（GH#1198）──────────────────────────────
圖集的 sampler 是 CLAMP（見 mip 滲色），⛔ 它不會 wrap ⇒ 原本靠 REPEAT 取樣到的每一個
texel 都要**先烘進格子裡**。做法：
  · 每個 primitive 量 UV 包圍盒，平移整數格讓中心落在 [0,1)
    （⛔ 平移不可以改變取樣：MIRRORED_REPEAT 只移偶數格、CLAMP 不移）
  · 同一張貼圖（同 wrap）所有 primitive 的包圍盒取聯集 ∪ [0,1]²、對齊 texel 格線
    ⇒ ⭐ 那一塊就是這張貼圖的「畫布」，照 wrap 規則逐 texel 搬出來（⛔ 不重取樣）：
      全部落在 [0,1] 的 ⇒ 畫布＝原圖（與 GH#1174 時一模一樣）
      溢出幾個 texel 的 ⇒ 畫布多一圈 wrap 過來的邊
      真的 tile 兩格的 ⇒ 畫布是兩份原圖接起來（⚠️ 每一格解析度少一半，量在 `cells[].scale`）
  · UV 重映射是線性的：u' = 格子起點 + (u − 平移 − 畫布起點) ÷ 畫布寬 × 格子寬
⚠️ 在此之前「UV 超出 [0,1]」一律判 ineligible —— ou99 超標的 8 顆裡那一類擋住 6 顆，
而其中大多數只是**整格平移**（V∈[-2,-1]）或**溢出 1–7 個 texel**，⛔ 不是 tile。

─ ⛔ 什麼**不可以**進圖集（都是可執行的判定，⛔ 不是提醒）──────────────────────
· **alphaMode / doubleSided / emissive / 其他材質欄位不同的** —— 那是不同的畫法。
  ⇒ render key = 材質 JSON 去掉 name/extras/baseColorTexture；⛔ key 不同不併。
· **帶第二張貼圖的材質**（normal / MR / occlusion，或**另一張圖**的 emissive）——
  那些要跟 baseColor **同一份版面**，今天沒有做 ⇒ 判定 ineligible。
  ⭐ emissiveTexture **指向同一張圖、同一組 UV、同一種 wrap** 的 ⛔ 不是第二張貼圖 ——
  它取樣的是同一個 texel ⇒ 兩格一起改指圖集。（ou99 超標的 8 顆：帶 emissive 的材質 100% 是這一形狀）
· 貼圖參照帶 extensions（KHR_texture_transform）· UV 不是 float · CLAMP 的貼圖 UV 超出 [0,1]
  · UV 跨超過 `MAX_TILES` 格（畫布＝格數 × 原圖，進格子時夾在 `--edge` 內 ⇒ 4 格時每格剩
    edge÷4 ＝ 256→64 texel ＝ MIN_CELL 的 4 倍；再多是地面那種無限 tile，⛔ 不是圖集該做的）

─ 幾張圖集、怎麼分 ──────────────────────────────────────────────────────────
draw call ＝「(畫法, 圖集)」的種類數 ＋ 不可併的那幾種。⇒ **按共用畫布的畫法分組**
（union-find），每組先 1 張，再把**品質最差的那一組**加一張，直到到品質底線、或
再加就超過 `--max-draws`。⭐ 只裝**一塊**畫布的圖集直接沿用原貼圖（⛔ 不重取樣、
UV 不動、REPEAT 照舊）—— draw call 一樣多，畫面逐位元組不變。
⚠️ 不跨 mesh：`merge_glb_prims` 只接單一 mesh（各 mesh 節點變換不同）；ou99 129 顆裡 0 顆多 mesh（2026-09-15 量）。

─ mip 滲色 ─────────────────────────────────────────────────────────────────
每一格內縮 `--pad`（預設 4）texel，並把邊緣像素**往外擴**填滿那一圈；圖集的
sampler 一律改成 CLAMP_TO_EDGE ⇒ 就算 UV 有 1e-4 的溢出也只會夾在自己的擴邊裡，
⛔ 不會取樣到鄰格。

─ 自我對帳 ─────────────────────────────────────────────────────────────────
`report.sampling`：每個進圖集的三角形重心，拿**原貼圖照 wrap 規則取模**（`texel_at`）與
**圖集照新 UV** 各取一次最近鄰，比差值 —— ⭐ 兩條路互相獨立（畫布是 tile＋crop 烘出來的）。
⚠️ 它量的是「貼圖查找有沒有搬對」（含縮圖損失），⛔ 不是實拍畫面。

─ ⛔ 絕不就地覆蓋 ───────────────────────────────────────────────────────────
預設是**乾跑**（只印計畫 JSON）。`--out` 才寫，而且只寫到指定的路徑。
"""
from __future__ import annotations

import argparse
import json
import math
import struct
import sys

CT = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
CLAMP_TO_EDGE = 33071
MIN_CELL = 16


# ---- glb io -----------------------------------------------------------------

def load(path: str):
    with open(path, "rb") as f:
        f.read(12)
        ln, _ = struct.unpack("<II", f.read(8))
        js = json.loads(f.read(ln).decode("utf-8"))
        f.read((4 - ln % 4) % 4)
        bl, _ = struct.unpack("<II", f.read(8))
        return js, bytearray(f.read(bl))


def save(path: str, j: dict, b: bytes) -> None:
    js = json.dumps(j, separators=(",", ":")).encode("utf-8")
    js += b" " * ((4 - len(js) % 4) % 4)
    bb = bytes(b) + b"\x00" * ((4 - len(b) % 4) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + 8 + len(bb)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack("<II", len(bb), 0x004E4942))
        f.write(bb)


def view_bytes(j: dict, b: bytes, vi: int) -> bytes:
    bv = j["bufferViews"][vi]
    off = bv.get("byteOffset", 0)
    return bytes(b[off:off + bv["byteLength"]])


def read_acc(j: dict, b: bytes, i: int):
    a = j["accessors"][i]
    bv = j["bufferViews"][a["bufferView"]]
    fmt = CT[a["componentType"]]
    n = NC[a["type"]]
    stride = bv.get("byteStride") or struct.calcsize(fmt) * n
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    return [struct.unpack_from("<" + fmt * n, b, off + k * stride) for k in range(a["count"])]


def append_view(j: dict, b: bytearray, blob: bytes, target: int | None = None) -> int:
    while len(b) % 4:
        b.append(0)
    off = len(b)
    b += blob
    bv: dict = {"buffer": 0, "byteOffset": off, "byteLength": len(blob)}
    if target is not None:
        bv["target"] = target
    j["bufferViews"].append(bv)
    return len(j["bufferViews"]) - 1


# ---- eligibility -------------------------------------------------------------

OTHER_TEX_SLOTS = ("normalTexture", "occlusionTexture")
REPEAT, MIRRORED_REPEAT = 10497, 33648
MAX_TILES = 4


def render_key(mat: dict) -> str:
    """材質去掉溯源欄位**與 baseColorTexture** —— ⭐ 剩下的就是「畫法」。

    同圖的 emissiveTexture 換成一個標記：「有沒有自發光這一格」仍然是畫法的一部分，
    ⛔ 但它指的是哪一張圖不是（它跟著 baseColor 一起改指圖集）。"""
    m = {k: v for k, v in mat.items() if k not in ("name", "extras")}
    pbr = dict(m.get("pbrMetallicRoughness", {}) or {})
    pbr.pop("baseColorTexture", None)
    if pbr:
        m["pbrMetallicRoughness"] = pbr
    else:
        m.pop("pbrMetallicRoughness", None)
    if "emissiveTexture" in m:
        m["emissiveTexture"] = "sameAsBaseColor"
    return json.dumps(m, sort_keys=True)


def state_key(mat: dict) -> str:
    """`merge_glb_prims.render_key` 的同一條：材質 JSON 去掉 name/extras ⇒ 逐位元組相等才併。"""
    return json.dumps({k: v for k, v in mat.items() if k not in ("name", "extras")}, sort_keys=True)


def wrap_modes(j: dict, tex_index: int) -> tuple[int, int]:
    s = j["textures"][tex_index].get("sampler")
    smp = j["samplers"][s] if isinstance(s, int) else {}
    return int(smp.get("wrapS", REPEAT)), int(smp.get("wrapT", REPEAT))


def axis_shift(lo: float, hi: float, wrap: int) -> int:
    """平移整數格讓包圍盒中心落在 [0,1) —— ⛔ 平移不可以改變取樣：MIRRORED 只移偶數格、CLAMP 不移。"""
    if wrap == CLAMP_TO_EDGE:
        return 0
    k = math.floor((lo + hi) / 2)
    return k - (k % 2) if wrap == MIRRORED_REPEAT else k


def surface_area(j: dict, b: bytes, prim: dict) -> float:
    pos = read_acc(j, b, prim["attributes"]["POSITION"])
    idx = [v[0] for v in read_acc(j, b, prim["indices"])] if "indices" in prim else list(range(len(pos)))
    tot = 0.0
    for t in range(0, len(idx) - 2, 3):
        a, c, d = pos[idx[t]], pos[idx[t + 1]], pos[idx[t + 2]]
        u = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
        v = (d[0] - a[0], d[1] - a[1], d[2] - a[2])
        cx = u[1] * v[2] - u[2] * v[1]
        cy = u[2] * v[0] - u[0] * v[2]
        cz = u[0] * v[1] - u[1] * v[0]
        tot += 0.5 * math.sqrt(cx * cx + cy * cy + cz * cz)
    return tot


def _ineligible_why(j: dict, prim: dict, mat: dict) -> str:
    texs = j.get("textures", [])
    pbr = mat.get("pbrMetallicRoughness", {}) or {}
    bct, em = pbr.get("baseColorTexture"), mat.get("emissiveTexture")
    if not bct:
        return "沒有 baseColorTexture"
    if any(mat.get(s) for s in OTHER_TEX_SLOTS) or pbr.get("metallicRoughnessTexture"):
        return "材質有第二張貼圖（normal/MR/occlusion）—— ⛔ 版面要一起搬,今天不做"
    if any(r.get("extensions") for r in (bct, em) if r):
        return "貼圖參照帶 extensions（KHR_texture_transform 之類）—— ⛔ UV 另有變換,今天不做"
    if em and (texs[em["index"]].get("source") != texs[bct["index"]].get("source")
               or int(em.get("texCoord", 0)) != int(bct.get("texCoord", 0))
               or wrap_modes(j, em["index"]) != wrap_modes(j, bct["index"])):
        return "emissiveTexture 是**另一張圖**（或另一組 UV／另一種 wrap）—— ⛔ 版面要一起搬,今天不做"
    ua = prim["attributes"].get(f"TEXCOORD_{int(bct.get('texCoord', 0))}")
    if ua is None:
        return "找不到對應的 TEXCOORD"
    if j["accessors"][ua]["componentType"] != 5126:
        return "TEXCOORD 不是 float（normalized 整數 UV）—— ⛔ 今天不做"
    return ""


def analyse(j: dict, b: bytes, tol: float = 1e-3) -> list[dict]:
    """逐 primitive：材質、貼圖、UV 範圍與平移、以及**為什麼**它能不能進圖集。"""
    mats = j.get("materials", [])
    texs = j.get("textures", [])
    out: list[dict] = []
    for mi, mesh in enumerate(j.get("meshes", [])):
        for pi, prim in enumerate(mesh.get("primitives", [])):
            m = prim.get("material")
            mat = mats[m] if isinstance(m, int) else {}
            row: dict = {
                "mesh": mi, "prim": pi, "material": m,
                "key": render_key(mat) if isinstance(m, int) else "(none)",
                "image": None, "uvSet": 0, "uv": None, "shift": None, "eligible": False,
                "why": _ineligible_why(j, prim, mat),
            }
            out.append(row)
            if row["why"]:
                continue
            bct = mat["pbrMetallicRoughness"]["baseColorTexture"]
            row["uvSet"] = int(bct.get("texCoord", 0))
            row["image"] = texs[bct["index"]].get("source")
            row["emissiveShared"] = bool(mat.get("emissiveTexture"))
            row["wrap"] = list(wrap_modes(j, bct["index"]))
            row["uvAccessor"] = prim["attributes"][f"TEXCOORD_{row['uvSet']}"]
            uv = read_acc(j, b, row["uvAccessor"])
            umin = min(v[0] for v in uv); umax = max(v[0] for v in uv)
            vmin = min(v[1] for v in uv); vmax = max(v[1] for v in uv)
            row["uv"] = [round(umin, 5), round(umax, 5), round(vmin, 5), round(vmax, 5)]
            ku, kv = axis_shift(umin, umax, row["wrap"][0]), axis_shift(vmin, vmax, row["wrap"][1])
            row["shift"] = [ku, kv]
            row["rect"] = [umin - ku, umax - ku, vmin - kv, vmax - kv]
            tiles = max(math.ceil(umax - umin - tol), math.ceil(vmax - vmin - tol))
            if any(w == CLAMP_TO_EDGE and (lo < -tol or hi > 1 + tol)
                   for w, lo, hi in ((row["wrap"][0], umin, umax), (row["wrap"][1], vmin, vmax))):
                row["why"] = f"CLAMP 的貼圖 UV 超出 [0,1]（{row['uv']}）—— ⛔ 夾邊取樣,今天不烘"
                continue
            if tiles > MAX_TILES:
                row["why"] = f"UV 跨 {tiles} 格 > {MAX_TILES}（{row['uv']}）—— ⛔ 無限 tile 那一類,留在自己的貼圖上"
                continue
            row["eligible"] = True
            row["area"] = surface_area(j, b, prim)
    return out


# ---- planning: cell sizes + shelf packing ------------------------------------

def pow2_near(n: float) -> int:
    """最近的 2 的冪（對數尺度）—— ⛔ 不是 floor：畫布多一圈 wrap 邊（例 256→262）不可以因此被砍成 128。"""
    return 1 << max(0, int(round(math.log2(max(1.0, n)))))


def cap_cell(w: int, h: int, edge: int) -> list[int]:
    """一格最大能多大：原生尺寸等比夾在 edge 內、取最近的 2 的冪。"""
    s = min(1.0, edge / max(w, h))
    return [min(edge, max(MIN_CELL, pow2_near(w * s))), min(edge, max(MIN_CELL, pow2_near(h * s)))]


def shelf_pack(cells: list[tuple[int, int, int]], edge: int, n_atlas: int, ordered: bool = False):
    """cells = [(key, w, h)] 由高到寬排序後逐層鋪。回傳 {key: (atlas, x, y)} 或 None。

    `ordered`：照給的順序鋪、**圖集編號只往前走** —— 半透明要的是「前面的畫布在前面的圖集」（見 run）。"""
    order = list(cells) if ordered else sorted(cells, key=lambda c: (-c[2], -c[1]))
    place: dict[int, tuple[int, int, int]] = {}
    shelves: list[list[list[int]]] = [[] for _ in range(n_atlas)]  # per atlas: [y, height, usedW]
    used_h = [0] * n_atlas
    first = 0
    for key, w, h in order:
        done = False
        for a in range(first, n_atlas):
            if ordered:
                first = a
            for sh in shelves[a]:
                if sh[1] >= h and sh[2] + w <= edge:
                    place[key] = (a, sh[2], sh[0])
                    sh[2] += w
                    done = True
                    break
            if done:
                break
            if used_h[a] + h <= edge:
                shelves[a].append([used_h[a], h, w])
                place[key] = (a, 0, used_h[a])
                used_h[a] += h
                done = True
                break
        if not done:
            return None
    return place


def plan_cells(imgs: dict[int, tuple[int, int]], demand: dict[int, float], edge: int, n_atlas: int, ordered: bool = False):
    """每一格從「原生（夾在 edge 內）」出發,塞不下就**砍掉取樣最浪費的那一格**。

    ⭐ 判準是 `格子面積 ÷ 這張貼圖服務的表面積佔比` —— 也就是**每單位表面積分到幾個
    texel**。砍密度最高的那一格 = 砍最看不出來的那一格,⛔ 不是「砍最大的」。
    """
    cap = {i: cap_cell(w, h, edge) for i, (w, h) in imgs.items()}
    cell = {i: list(c) for i, c in cap.items()}
    total = sum(demand.values()) or 1.0

    def density(i, c):
        return (c[0] * c[1]) / max(1e-9, demand.get(i, 0.0) / total)

    def fit():
        return shelf_pack([(i, c[0], c[1]) for i, c in cell.items()], edge, n_atlas, ordered)

    got = fit()
    for _ in range(256):                       # ① 塞不下就砍**取樣最浪費**的那一格
        if got is not None:
            break
        worst = max((i for i, c in cell.items() if max(c) > MIN_CELL),
                    key=lambda i: density(i, cell[i]), default=None)
        if worst is None:
            return None, None
        cell[worst] = [max(MIN_CELL, cell[worst][0] // 2), max(MIN_CELL, cell[worst][1] // 2)]
        got = fit()
    # ② ⭐ **長回去** —— 貪心的砍法會砍過頭（shelf 排不下 ≠ 面積不夠）,
    #    ⛔ 而砍過頭沒有任何東西會叫,它只是讓貼圖比需要的更糊。
    for _ in range(256):
        cand = [i for i, c in cell.items() if c[0] < cap[i][0] or c[1] < cap[i][1]]
        if not cand:
            break
        i = min(cand, key=lambda k: density(k, cell[k]))
        keep = list(cell[i])
        cell[i] = [min(cap[i][0], cell[i][0] * 2), min(cap[i][1], cell[i][1] * 2)]
        nxt = fit()
        if nxt is None:
            cell[i] = keep
            others = [k for k in cand if k != i]
            if not others:
                break
            # 這一格長不動,換下一格試 —— ⛔ 不要因為一格卡住就停止整個成長
            for k in sorted(others, key=lambda k: density(k, cell[k])):
                keep = list(cell[k])
                cell[k] = [min(cap[k][0], cell[k][0] * 2), min(cap[k][1], cell[k][1] * 2)]
                nxt = fit()
                if nxt is not None:
                    break
                cell[k] = keep
            if nxt is None:
                break
        got = nxt
    return cell, got


# ---- image work --------------------------------------------------------------

def dilate_into(cell_img, inner, pad: int):
    """把 inner 貼在 cell 中央,再把它的邊緣像素**往外擴** pad 圈（防 mip 滲色）。"""
    w, h = inner.size
    cell_img.paste(inner, (pad, pad))
    if pad <= 0:
        return
    cell_img.paste(inner.crop((0, 0, w, 1)).resize((w, pad)), (pad, 0))
    cell_img.paste(inner.crop((0, h - 1, w, h)).resize((w, pad)), (pad, pad + h))
    cell_img.paste(inner.crop((0, 0, 1, h)).resize((pad, h)), (0, pad))
    cell_img.paste(inner.crop((w - 1, 0, w, h)).resize((pad, h)), (pad + w, pad))
    for (sx, sy, dx, dy) in ((0, 0, 0, 0), (w - 1, 0, pad + w, 0), (0, h - 1, 0, pad + h), (w - 1, h - 1, pad + w, pad + h)):
        cell_img.paste(inner.crop((sx, sy, sx + 1, sy + 1)).resize((pad, pad)), (dx, dy))


def bake(img, wrap: list[int], x0: int, x1: int, y0: int, y1: int):
    """把 wrap 規則下 texel 區間 [x0,x1)×[y0,y1) 看到的東西烘成一張圖 —— 整張原圖一格一格接起來再裁（⛔ 不重取樣）。"""
    from PIL import Image, ImageOps
    w, h = img.size
    if (x0, x1, y0, y1) == (0, w, 0, h):
        return img
    tx0, tx1, ty0, ty1 = x0 // w, (x1 - 1) // w, y0 // h, (y1 - 1) // h
    big = Image.new("RGBA", ((tx1 - tx0 + 1) * w, (ty1 - ty0 + 1) * h))
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            t = ImageOps.mirror(img) if wrap[0] == MIRRORED_REPEAT and tx % 2 else img
            t = ImageOps.flip(t) if wrap[1] == MIRRORED_REPEAT and ty % 2 else t
            big.paste(t, ((tx - tx0) * w, (ty - ty0) * h))
    return big.crop((x0 - tx0 * w, y0 - ty0 * h, x1 - tx0 * w, y1 - ty0 * h))


def texel_at(img, wrap: list[int], u: float, v: float):
    """原貼圖照 glTF wrap 規則的最近鄰取樣 —— ⭐ 用取模算,⛔ 刻意不走 `bake` 那條路（自我對帳用）。"""
    def ax(t: float, n: int, mode: int) -> int:
        i = math.floor(t * n)
        if mode == CLAMP_TO_EDGE:
            return min(max(i, 0), n - 1)
        if mode == MIRRORED_REPEAT:
            p = i % (2 * n)
            return p if p < n else 2 * n - 1 - p
        return i % n
    return img.getpixel((ax(u, img.size[0], wrap[0]), ax(v, img.size[1], wrap[1])))


# ---- the stage ---------------------------------------------------------------

def run(src: str, out: str | None, edge: int, pad: int, max_draws: int, want_atlases: int = 0, quality: float = 0.45,
        blend_order: bool = True) -> dict:
    from PIL import Image
    import io as _io

    j, b = load(src)
    rows = analyse(j, b)
    before_draws = sum(len(m.get("primitives", [])) for m in j.get("meshes", []))
    elig = [r for r in rows if r["eligible"]]
    def prims_report() -> list[dict]:
        return [{k: r[k] for k in ("mesh", "prim", "material", "image", "uv", "shift", "eligible", "why")} for r in rows]

    report: dict = {"src": src, "beforeDraws": before_draws, "edge": edge, "pad": pad, "prims": prims_report()}
    if len(j.get("meshes", [])) != 1:
        report["skip"] = f"有 {len(j['meshes'])} 個 mesh —— merge_glb_prims 只接單一 mesh（各 mesh 節點的變換不同）"
        return report
    if len(elig) < 2:
        report["skip"] = "少於兩個可併的 primitive"
        return report

    raw: dict[int, "Image.Image"] = {}
    for r in elig:
        im = j["images"][r["image"]]
        if "bufferView" not in im:
            report["skip"] = f"image {r['image']} 不在 buffer 裡（外部 uri）,⛔ 不處理"
            return report
        if r["image"] not in raw:
            raw[r["image"]] = Image.open(_io.BytesIO(view_bytes(j, b, im["bufferView"]))).convert("RGBA")

    mats = j.get("materials", [])

    def is_blend(r: dict) -> bool:
        return isinstance(r["material"], int) and mats[r["material"]].get("alphaMode") == "BLEND"

    def plan_all() -> dict:
        """一次完整的規劃：畫布 → 分組 → 每組幾張圖集 → 誰住哪一格。塞不下時回傳帶 `skip` 的 dict。"""
        elig = [r for r in rows if r["eligible"]]
        if len(elig) < 2:
            return {"skip": "少於兩個可併的 primitive"}
        # 畫布：同一張貼圖（同 wrap）所有 primitive 的包圍盒聯集 ∪ [0,1]²,對齊 texel 格線。
        inst_of: dict[tuple, int] = {}
        canv: list[dict] = []
        for r in elig:
            k = (r["image"], *r["wrap"])
            if k not in inst_of:
                inst_of[k] = len(canv)
                canv.append({"image": r["image"], "wrap": r["wrap"], "rect": [0.0, 1.0, 0.0, 1.0], "area": 0.0})
            c = canv[inst_of[k]]
            c["rect"] = [min(c["rect"][0], r["rect"][0]), max(c["rect"][1], r["rect"][1]),
                         min(c["rect"][2], r["rect"][2]), max(c["rect"][3], r["rect"][3])]
            c["area"] += r["area"]
            r["inst"] = inst_of[k]
        for c in canv:
            w, h = raw[c["image"]].size
            u0, u1, v0, v1 = c["rect"]
            c["px"] = [math.floor(u0 * w + 1e-3), math.ceil(u1 * w - 1e-3), math.floor(v0 * h + 1e-3), math.ceil(v1 * h - 1e-3)]
        imgs = {n: (c["px"][1] - c["px"][0], c["px"][3] - c["px"][2]) for n, c in enumerate(canv)}
        demand = {n: c["area"] for n, c in enumerate(canv)}

        # 不可併的那幾種畫法：材質逐位元組相等的會被 merge 接起來 ⇒ 數「種」,⛔ 不是數「個」。
        fixed = len({state_key(mats[r["material"]]) if isinstance(r["material"], int) else "(none)"
                     for r in rows if not r["eligible"]})

        # 單位：非半透明＝一種畫法一個單位（順序無關,深度測試）；⭐ 半透明＝**連續同畫法的一段**一個單位 ——
        #  merge 把同一個狀態接起來放在第一塊的位置,⛔ 只有「連續的一段」接起來才不會改變半透明的繪製順序。
        prev, seg = None, 0
        for r in rows:
            if is_blend(r):
                if not (r["eligible"] and prev is not None and prev["eligible"] and prev["key"] == r["key"]):
                    seg += 1
                prev = r
            r["unit"] = f"{r['key']}#blend{seg}" if blend_order and is_blend(r) else r["key"]
        # 分組：共用同一塊畫布的單位必須同一組（一塊畫布在圖集裡只有一個位置）。
        parent = {r["unit"]: r["unit"] for r in elig}

        def find(k: str) -> str:
            while parent[k] != k:
                parent[k] = parent[parent[k]]
                k = parent[k]
            return k

        first_key: dict[int, str] = {}
        for r in elig:
            parent[find(r["unit"])] = find(first_key.setdefault(r["inst"], r["unit"]))
        groups: dict[str, list[dict]] = {}
        for r in elig:
            groups.setdefault(find(r["unit"]), []).append(r)
        order = sorted(groups)

        def plan_group(g: str, n: int):
            sub = {r["inst"]: imgs[r["inst"]] for r in groups[g]}          # ⭐ 依第一次被用到的順序
            blend = blend_order and any(is_blend(r) for r in groups[g])
            c, pl = plan_cells(sub, {i: demand[i] for i in sub}, edge, n, ordered=blend)
            if pl is None:
                return None
            # ⛔ 一段半透明的圖集編號必須只往前走（＝每個狀態連續）,否則 merge 會把後面的提前畫 ⇒ 這個 n 不可行
            if blend and any(any(x > y for x, y in zip(seq, seq[1:])) for seq in
                             ([pl[r["inst"]][0] for r in groups[g] if r["unit"] == u] for u in {r["unit"] for r in groups[g]})):
                return None
            cap = sum(math.prod(cap_cell(w, h, edge)) for w, h in sub.values()) or 1
            return {"n": n, "cell": c, "place": pl, "ratio": sum(v[0] * v[1] for v in c.values()) / cap,
                    "draws": len({(r["unit"], pl[r["inst"]][0]) for r in groups[g]})}

        plans: dict[str, dict] = {}
        for g in order:
            p = plan_group(g, 1)
            if p is None:
                return {"skip": f"{edge}² 的圖集連最小格都塞不下"}
            plans[g] = p
        floor = {"fixed": fixed, "groups": len(order), "draws": fixed + sum(p["draws"] for p in plans.values())}
        if floor["draws"] > max_draws:
            return {"drawFloor": floor, "skip": f"畫法下限 {floor['draws']} > {max_draws}：不可併的 {fixed} 種 ＋ "
                                                 f"可併的 {len(order)} 組各一張圖集 ⇒ ⛔ 圖集怎麼排都壓不到線內"}

        # 幾張圖集？ ⭐ 取**還進得了 draw call 預算**的張數,每次加給**品質最差的那一組** —— ⛔ 不是「最少張」。
        #  ⚠️ 少一張圖集省的是 0.33 MB VRAM（額度 4 MB,不缺）,⛔ 代價卻是那一組的貼圖再糊一倍。
        #  到品質底線就停（⛔ 不要為了 0.01 再多燒一個 draw call）；`--atlases` 可以人工指定總張數。
        saturated: set[str] = set()
        while not want_atlases or sum(p["n"] for p in plans.values()) < want_atlases:
            cands = [g for g in order if g not in saturated and (want_atlases or plans[g]["ratio"] < quality)]
            if not cands:
                break
            g = min(cands, key=lambda k: (plans[k]["ratio"], k))
            nxt = plan_group(g, plans[g]["n"] + 1)
            spent = sum(p["draws"] for k, p in plans.items() if k != g)
            if nxt is None or nxt["ratio"] <= plans[g]["ratio"] or fixed + spent + nxt["draws"] > max_draws:
                saturated.add(g)
                continue
            plans[g] = nxt

        place: dict[int, tuple[int, int, int]] = {}
        cell: dict[int, list[int]] = {}
        members: dict[int, list[int]] = {}
        atlas_of: dict[tuple[str, int], int] = {}
        for g in order:
            for i, (a, x, y) in plans[g]["place"].items():
                ga = atlas_of.setdefault((g, a), len(atlas_of))
                place[i], cell[i] = (ga, x, y), plans[g]["cell"][i]
                members.setdefault(ga, []).append(i)
        # ⭐ 只裝一塊畫布的「圖集」＝原貼圖本身：⛔ 不重取樣、UV 不動、REPEAT 照舊（draw call 一樣,畫面逐位元組不變）。
        solo = {ga for ga, ms in members.items() if len(ms) == 1 and max(raw[canv[ms[0]]["image"]].size) <= edge}

        return {"elig": elig, "canv": canv, "imgs": imgs, "fixed": fixed, "groups": groups, "order": order, "plans": plans,
                "place": place, "cell": cell, "members": members, "solo": solo, "drawFloor": floor}

    # ⭐ WC3 多層材質＝**同一份幾何**疊兩層（底層＋Additive 發光層），各自一個半透明 primitive。
    #  渲染器替半透明排序靠「離鏡頭多遠」,而兩層距離一樣 ⇒ **平手,只剩載入順序**決定誰蓋誰。
    #  merge 把其中一層跟別的部位接起來 ⇒ 包圍盒中心變了 ⇒ 平手被打破,誰先畫改由鏡頭位置決定。
    #  ⇒ 疊層若**不是**連續同畫法（會被接成同一塊、索引順序照舊）,那幾層不進圖集（留原貼圖＝不同畫法＝不會被接）。
    #  （ou99_454064 實拍量到：不這樣做,亮像素差 −7.5%、差 >24 的佔亮像素 53%）
    blend_rows = [r for r in rows if is_blend(r)] if blend_order else []
    stacked: dict[bytes, list[int]] = {}
    for n, r in enumerate(blend_rows):
        pr = j["meshes"][r["mesh"]]["primitives"][r["prim"]]
        stacked.setdefault(struct.pack("<%df" % (3 * j["accessors"][pr["attributes"]["POSITION"]]["count"]),
                                       *[c for v in read_acc(j, b, pr["attributes"]["POSITION"]) for c in v]), []).append(n)
    for layer in (ns for ns in stacked.values() if len(ns) > 1):
        span = blend_rows[layer[0]:layer[-1] + 1]
        if len(span) == len(layer) and all(q["eligible"] for q in span) and len({q["key"] for q in span}) == 1:
            continue
        for n in layer:
            r = blend_rows[n]
            if r["eligible"]:
                r["eligible"] = False
                r["why"] = f"WC3 多層材質的一層（與 prim {[blend_rows[m]['prim'] for m in layer if m != n]} 幾何相同、都是 BLEND、不會被接成同一塊）—— ⛔ 合併會打破排序平手"
    # ⭐ 同一張圖集裡兩段**同畫法**的半透明 ⇒ 材質逐位元組相等 ⇒ merge 會把後一段提前接到前一段 ⇒ 後一段留原貼圖,重新規劃。
    while True:
        P = plan_all()
        if "skip" in P:
            report["prims"] = prims_report()
            report.update({k: P[k] for k in ("skip", "drawFloor") if k in P})
            return report
        seen: dict[tuple, str] = {}
        bad = [r for r in rows if blend_order and r["eligible"] and is_blend(r) and P["place"][r["inst"]][0] not in P["solo"]
               and seen.setdefault((r["key"], P["place"][r["inst"]][0]), r["unit"]) != r["unit"]]
        if not bad:
            break
        for r in bad:
            r["eligible"] = False
            r["why"] = "BLEND 繪製順序：與前面一段同畫法的半透明會落在同一張圖集、被 merge 提前 ⇒ ⛔ 留原貼圖"
    elig, canv, imgs, groups, order, plans = P["elig"], P["canv"], P["imgs"], P["groups"], P["order"], P["plans"]
    fixed, place, cell, members, solo = P["fixed"], P["place"], P["cell"], P["members"], P["solo"]
    report["drawFloor"] = P["drawFloor"]

    canvases = {ga: Image.new("RGBA", (edge, edge), (0, 0, 0, 0)) for ga in sorted(members) if ga not in solo}
    uvmap: dict[int, tuple] = {}
    for i, c in enumerate(canv):
        ga, x, y = place[i]
        if ga in solo:
            continue
        x0, x1, y0, y1 = c["px"]
        w, h = raw[c["image"]].size
        cw, ch = cell[i]
        iw, ih = max(1, cw - 2 * pad), max(1, ch - 2 * pad)
        p_eff = min(pad, (cw - iw) // 2, (ch - ih) // 2)
        if CLAMP_TO_EDGE in c["wrap"]:
            cimg = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
            dilate_into(cimg, bake(raw[c["image"]], c["wrap"], x0, x1, y0, y1).resize((iw, ih), Image.LANCZOS), p_eff)
        else:
            # ⭐ 會 wrap 的貼圖：擴邊那一圈填**wrap 過來的真內容**（⛔ 不是複製邊緣像素）——
            #  REPEAT 的雙線性在邊上本來就混到對邊,只複製邊緣會讓貼著邊的細線整條變亮/變粗（ou99_467889 實拍量到）。
            sx, sy = iw / (x1 - x0), ih / (y1 - y0)
            mx, my = math.ceil(p_eff / sx) + 2, math.ceil(p_eff / sy) + 2
            big = bake(raw[c["image"]], c["wrap"], x0 - mx, x1 + mx, y0 - my, y1 + my)
            cimg = big.resize((iw + 2 * p_eff, ih + 2 * p_eff), Image.LANCZOS,
                              box=(mx - p_eff / sx, my - p_eff / sy, mx + (x1 - x0) + p_eff / sx, my + (y1 - y0) + p_eff / sy))
        canvases[ga].paste(cimg, (x, y))
        uvmap[i] = (ga, (x + p_eff) / edge, iw / edge, (y + p_eff) / edge, ih / edge, x0 / w, (x1 - x0) / w, y0 / h, (y1 - y0) / h)

    # 新 image / texture（sampler 一律 CLAMP —— ⛔ 溢出要夾在自己的擴邊裡）
    atlas_tex: dict[int, int] = {}
    if canvases:
        j.setdefault("samplers", []).append({"wrapS": CLAMP_TO_EDGE, "wrapT": CLAMP_TO_EDGE})
        samp = len(j["samplers"]) - 1
    for n_img, (ga, im) in enumerate(canvases.items()):
        buf = _io.BytesIO()
        im.save(buf, format="PNG", optimize=True)
        vi = append_view(j, b, buf.getvalue())
        j.setdefault("images", []).append({"bufferView": vi, "mimeType": "image/png", "name": f"atlas{n_img}"})
        j.setdefault("textures", []).append({"source": len(j["images"]) - 1, "sampler": samp})
        atlas_tex[ga] = len(j["textures"]) - 1

    # UV 重映射（逐 primitive 一份新的 TEXCOORD accessor）＋ 材質改指圖集 ＋ 逐三角形重心自我對帳
    mesh = j["meshes"][0]
    diffs: list[int] = []
    for r in elig:
        prim = mesh["primitives"][r["prim"]]
        mat = json.loads(json.dumps(j["materials"][r["material"]]))
        mat.pop("name", None)
        if r["inst"] in uvmap:
            ga, ox, sw, oy, sh, cu, cwu, cv, chv = uvmap[r["inst"]]
            ku, kv = r["shift"]
            uv = read_acc(j, b, r["uvAccessor"])
            new = [(ox + min(max((u - ku - cu) / cwu, 0.0), 1.0) * sw, oy + min(max((v - kv - cv) / chv, 0.0), 1.0) * sh)
                   for u, v in uv]
            vi = append_view(j, b, b"".join(struct.pack("<ff", *p) for p in new), 34962)
            j["accessors"].append({"bufferView": vi, "componentType": 5126, "count": len(uv), "type": "VEC2"})
            idx = [v[0] for v in read_acc(j, b, prim["indices"])] if "indices" in prim else list(range(len(uv)))
            prim["attributes"][f"TEXCOORD_{r['uvSet']}"] = len(j["accessors"]) - 1
            ref = {"index": atlas_tex[ga], **({"texCoord": r["uvSet"]} if r["uvSet"] else {})}
            mat.setdefault("pbrMetallicRoughness", {})["baseColorTexture"] = dict(ref)
            if r["emissiveShared"]:
                mat["emissiveTexture"] = dict(ref)
            for t in range(0, len(idx) - 2, 3):
                tri = idx[t:t + 3]
                a0 = texel_at(raw[r["image"]], r["wrap"], sum(uv[q][0] for q in tri) / 3, sum(uv[q][1] for q in tri) / 3)
                a1 = texel_at(canvases[ga], [CLAMP_TO_EDGE] * 2, sum(new[q][0] for q in tri) / 3, sum(new[q][1] for q in tri) / 3)
                diffs.append(max(abs(p - q) for p, q in zip(a0, a1)))
        j["materials"].append(mat)
        prim["material"] = len(j["materials"]) - 1

    # 材質去重 ⇒ 畫法相同的 primitive 現在**逐位元組相等**,merge_glb_prims 才接得起來
    dedup: dict[str, int] = {}
    remap: dict[int, int] = {}
    for mi, m in enumerate(j["materials"]):
        remap[mi] = dedup.setdefault(state_key(m), mi)
    for prim in mesh["primitives"]:
        if isinstance(prim.get("material"), int):
            prim["material"] = remap[prim["material"]]

    j["buffers"] = [{"byteLength": len(b)}]
    report["prims"] = prims_report()
    report["atlases"] = len(canvases)
    report["quality"] = round(min(p["ratio"] for p in plans.values()), 3)
    report["groups"] = [{"keys": len({r["key"] for r in groups[g]}), "canvases": len({r["inst"] for r in groups[g]}),
                         "atlases": plans[g]["n"], "quality": round(plans[g]["ratio"], 3)} for g in order]
    report["passthroughImages"] = sorted(canv[members[ga][0]]["image"] for ga in solo)
    # ⭐ 每一格的**線性**縮放（內縮 pad 之後、相對畫布）—— 人審時先看最小的那一格,⛔ 不是只看總品質。
    scale = {i: 1.0 if i not in uvmap else round(min((cell[i][0] - 2 * pad) / imgs[i][0], (cell[i][1] - 2 * pad) / imgs[i][1]), 3)
             for i in imgs}
    report["cells"] = {str(i): {"image": c["image"], "canvasPx": c["px"], "cell": cell[i], "at": list(place[i]), "scale": scale[i]}
                       for i, c in enumerate(canv)}
    report["minCellScale"] = min(scale.values())
    report["sampling"] = {"triangles": len(diffs), "meanMaxChannelDiff": round(sum(diffs) / max(1, len(diffs)), 2),
                          "over24": round(sum(1 for d in diffs if d > 24) / max(1, len(diffs)), 4)}
    report["afterDrawsPredicted"] = fixed + sum(p["draws"] for p in plans.values())
    if out:
        save(out, j, b)
        report["out"] = out
        # ⭐ 併：材質已經逐位元組相等,`merge_glb_prims` 的判準（畫法一不一樣）現在說「一樣」。
        sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[2] / "w3x-import"))
        from merge_glb_prims import merge as _merge  # noqa: E402
        report["merge"] = _merge(out)
        report["gc"] = gc_glb(out)
        report["afterDraws"] = report["gc"]["draws"]
    return report


# ---- garbage collection ------------------------------------------------------

def gc_glb(path: str) -> dict:
    """丟掉沒有人引用的 material / texture / image / accessor / bufferView 並重打包 buffer。

    ⛔ **這一步不是潔癖** —— `measureGlb` 的 VRAM 逐張數 `images[]`（⛔ 不管有沒有人用），
    ⭐ 所以不做 GC 的話「圖集省了 VRAM」這句話是假的：舊的 7 張還躺在檔案裡。
    """
    j, b = load(path)
    keep_mat, keep_acc = set(), set()
    for m in j.get("meshes", []):
        for p in m.get("primitives", []):
            if isinstance(p.get("material"), int):
                keep_mat.add(p["material"])
            keep_acc.update(v for v in p.get("attributes", {}).values())
            if isinstance(p.get("indices"), int):
                keep_acc.add(p["indices"])
            for t in p.get("targets", []) or []:
                keep_acc.update(t.values())
    for s in j.get("skins", []):
        if isinstance(s.get("inverseBindMatrices"), int):
            keep_acc.add(s["inverseBindMatrices"])
    for a in j.get("animations", []):
        for sm in a.get("samplers", []):
            keep_acc.add(sm["input"]); keep_acc.add(sm["output"])
    keep_tex = {t["index"] for mi in keep_mat for t in _tex_refs(j["materials"][mi])}
    keep_img = {j["textures"][t].get("source") for t in keep_tex}
    keep_img.discard(None)
    keep_smp = {j["textures"][t].get("sampler") for t in keep_tex}
    keep_smp.discard(None)

    def compact(name: str, keep: set):
        old = j.get(name, [])
        idx = {o: n for n, o in enumerate(sorted(keep))}
        j[name] = [old[o] for o in sorted(keep)]
        return idx

    mat_i = compact("materials", keep_mat)
    tex_i = compact("textures", keep_tex)
    img_i = compact("images", keep_img)
    smp_i = compact("samplers", keep_smp)
    for t in j["textures"]:
        if "source" in t:
            t["source"] = img_i[t["source"]]
        if "sampler" in t:
            t["sampler"] = smp_i[t["sampler"]]
    for m in j["materials"]:
        for ref in _tex_refs(m):
            ref["index"] = tex_i[ref["index"]]

    keep_bv = {j["accessors"][a]["bufferView"] for a in keep_acc if "bufferView" in j["accessors"][a]}
    keep_bv |= {j["images"][i]["bufferView"] for i in range(len(j["images"])) if "bufferView" in j["images"][i]}
    acc_i = compact("accessors", keep_acc)
    bv_i = compact("bufferViews", keep_bv)
    nb = bytearray()
    for bv in j["bufferViews"]:
        while len(nb) % 4:
            nb.append(0)
        off = bv.get("byteOffset", 0)
        blob = bytes(b[off:off + bv["byteLength"]])
        bv["byteOffset"] = len(nb)
        nb += blob
    for a in j["accessors"]:
        if "bufferView" in a:
            a["bufferView"] = bv_i[a["bufferView"]]
    for im in j["images"]:
        if "bufferView" in im:
            im["bufferView"] = bv_i[im["bufferView"]]
    for m in j.get("meshes", []):
        for p in m.get("primitives", []):
            if isinstance(p.get("material"), int):
                p["material"] = mat_i[p["material"]]
            p["attributes"] = {k: acc_i[v] for k, v in p.get("attributes", {}).items()}
            if isinstance(p.get("indices"), int):
                p["indices"] = acc_i[p["indices"]]
            p["targets"] = [{k: acc_i[v] for k, v in t.items()} for t in p.get("targets", [])] or p.pop("targets", None) or []
            if not p["targets"]:
                p.pop("targets")
    for s in j.get("skins", []):
        if isinstance(s.get("inverseBindMatrices"), int):
            s["inverseBindMatrices"] = acc_i[s["inverseBindMatrices"]]
    for a in j.get("animations", []):
        for sm in a.get("samplers", []):
            sm["input"] = acc_i[sm["input"]]; sm["output"] = acc_i[sm["output"]]
    j["buffers"] = [{"byteLength": len(nb)}]
    save(path, j, nb)
    return {"images": len(j["images"]), "materials": len(j["materials"]),
            "draws": sum(len(m.get("primitives", [])) for m in j.get("meshes", []))}


def _tex_refs(mat: dict):
    pbr = mat.get("pbrMetallicRoughness", {}) or {}
    for r in (pbr.get("baseColorTexture"), pbr.get("metallicRoughnessTexture"),
              mat.get("normalTexture"), mat.get("occlusionTexture"), mat.get("emissiveTexture")):
        if isinstance(r, dict) and isinstance(r.get("index"), int):
            yield r


def main() -> int:
    ap = argparse.ArgumentParser(description="pack a glb's base-colour textures into atlases")
    ap.add_argument("src")
    ap.add_argument("--out", default=None, help="write here (⛔ 沒給就是乾跑)")
    ap.add_argument("--edge", type=int, default=256)
    ap.add_argument("--pad", type=int, default=4)
    ap.add_argument("--max-draws", type=int, default=6)
    ap.add_argument("--quality", type=float, default=0.45,
                    help="⭐ 品質底線：配到的 texel 面積 ÷ 原生（夾在 --edge 內）面積。到線就停加圖集")
    ap.add_argument("--atlases", type=int, default=0, help="⭐ 人工指定總張數（⛔ 0 = 自動）")
    ap.add_argument("--ignore-blend-order", action="store_true",
                    help="⚠️ 回到 GH#1198 之前：半透明也照畫法併、不管繪製順序（draw call 更少,⛔ 疊層/交錯的半透明可能換順序）")
    a = ap.parse_args()
    r = run(a.src, a.out, a.edge, a.pad, a.max_draws, a.atlases, a.quality, not a.ignore_blend_order)
    print(json.dumps(r, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
