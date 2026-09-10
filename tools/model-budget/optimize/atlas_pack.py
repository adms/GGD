#!/usr/bin/env python3
"""atlas_pack — the ATLAS stage of the offline batch optimiser (GH#1174).

⭐ 它解的是**貼圖 stage 解不掉的那一半**：`optimize.ts` 的 texture stage 只會把每一張
貼圖縮小，⛔ 它一張都不會減少 —— 而 draw call 是**每一種畫法一次**，所以
「7 張不同貼圖」永遠是 7 個 draw call，⛔ 不管每一張多小。

判準與 `merge_glb_prims.py` 是同一條，只是反過來用：那一支問「畫法一不一樣」，
⭐ 這一支**把畫法變成一樣** —— 只差 baseColorTexture 的 primitive，把它們的貼圖
併成一張圖集、重映射 UV，於是它們的材質逐位元組相等 ⇒ 幾何接得起來。

─ ⛔ 什麼**不可以**進同一張圖集（都是驗收條件，⛔ 不是提醒）────────────────────
· **會 tile 的貼圖**（UV 超出 [0,1]）—— WC3 貼圖是 REPEAT，重映射之後 wrap 會跑到
  隔壁格去，畫面整片錯位。⇒ 逐 primitive 量 UV 範圍，超出的**留在自己的貼圖上**。
· **alphaMode / doubleSided / emissive / 其他貼圖槽不同的** —— 那是不同的畫法。
  ⇒ render key = 材質 JSON 去掉 name/extras/baseColorTexture；⛔ key 不同不併。
· **帶第二張貼圖的材質**（normal / MR / occlusion / emissive）—— 那些要跟 baseColor
  **同一份版面**，今天沒有做 ⇒ 一律判定 ineligible，⛔ 不是「順便也搬過去」。

─ mip 滲色 ─────────────────────────────────────────────────────────────────
每一格內縮 `--pad`（預設 4）texel，並把邊緣像素**往外擴**填滿那一圈；圖集的
sampler 一律改成 CLAMP_TO_EDGE ⇒ 就算 UV 有 1e-4 的溢出也只會夾在自己的擴邊裡，
⛔ 不會取樣到鄰格。

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

OTHER_TEX_SLOTS = ("normalTexture", "occlusionTexture", "emissiveTexture")


def render_key(mat: dict) -> str:
    """材質去掉溯源欄位**與 baseColorTexture** —— ⭐ 剩下的就是「畫法」。"""
    m = {k: v for k, v in mat.items() if k not in ("name", "extras")}
    pbr = dict(m.get("pbrMetallicRoughness", {}) or {})
    pbr.pop("baseColorTexture", None)
    if pbr:
        m["pbrMetallicRoughness"] = pbr
    else:
        m.pop("pbrMetallicRoughness", None)
    return json.dumps(m, sort_keys=True)


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


def analyse(j: dict, b: bytes, tol: float = 1e-3) -> list[dict]:
    """逐 primitive：材質、貼圖、UV 範圍、以及**為什麼**它能不能進圖集。"""
    mats = j.get("materials", [])
    texs = j.get("textures", [])
    out: list[dict] = []
    for mi, mesh in enumerate(j.get("meshes", [])):
        for pi, prim in enumerate(mesh.get("primitives", [])):
            m = prim.get("material")
            mat = mats[m] if isinstance(m, int) else {}
            pbr = mat.get("pbrMetallicRoughness", {}) or {}
            bct = pbr.get("baseColorTexture")
            row: dict = {
                "mesh": mi, "prim": pi, "material": m,
                "key": render_key(mat) if isinstance(m, int) else "(none)",
                "image": None, "uvSet": 0, "uv": None, "eligible": False, "why": "",
            }
            if not bct:
                row["why"] = "沒有 baseColorTexture"
                out.append(row)
                continue
            if any(mat.get(s) for s in OTHER_TEX_SLOTS) or pbr.get("metallicRoughnessTexture"):
                row["why"] = "材質有第二張貼圖（normal/MR/occlusion/emissive）—— ⛔ 版面要一起搬,今天不做"
                out.append(row)
                continue
            row["uvSet"] = int(bct.get("texCoord", 0))
            row["image"] = texs[bct["index"]].get("source")
            ua = prim["attributes"].get(f"TEXCOORD_{row['uvSet']}")
            if ua is None:
                row["why"] = "找不到對應的 TEXCOORD"
                out.append(row)
                continue
            uv = read_acc(j, b, ua)
            umin = min(v[0] for v in uv); umax = max(v[0] for v in uv)
            vmin = min(v[1] for v in uv); vmax = max(v[1] for v in uv)
            row["uv"] = [round(umin, 5), round(umax, 5), round(vmin, 5), round(vmax, 5)]
            row["uvAccessor"] = ua
            if umin < -tol or vmin < -tol or umax > 1 + tol or vmax > 1 + tol:
                row["why"] = f"UV 超出 [0,1]（{row['uv']}）⇒ 這張貼圖會 tile,⛔ 不可進圖集"
                out.append(row)
                continue
            row["eligible"] = True
            row["area"] = surface_area(j, b, prim)
            out.append(row)
    return out


# ---- planning: cell sizes + shelf packing ------------------------------------

def pow2_floor(n: int) -> int:
    return 1 << max(0, int(math.floor(math.log2(max(1, n)))))


def shelf_pack(cells: list[tuple[int, int, int]], edge: int, n_atlas: int):
    """cells = [(key, w, h)] 由高到寬排序後逐層鋪。回傳 {key: (atlas, x, y)} 或 None。"""
    order = sorted(cells, key=lambda c: (-c[2], -c[1]))
    place: dict[int, tuple[int, int, int]] = {}
    shelves: list[list[list[int]]] = [[] for _ in range(n_atlas)]  # per atlas: [y, height, usedW]
    used_h = [0] * n_atlas
    for key, w, h in order:
        done = False
        for a in range(n_atlas):
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


def plan_cells(imgs: dict[int, tuple[int, int]], demand: dict[int, float], edge: int, n_atlas: int):
    """每一格從「原生（夾在 edge 內）」出發,塞不下就**砍掉取樣最浪費的那一格**。

    ⭐ 判準是 `格子面積 ÷ 這張貼圖服務的表面積佔比` —— 也就是**每單位表面積分到幾個
    texel**。砍密度最高的那一格 = 砍最看不出來的那一格,⛔ 不是「砍最大的」。
    """
    cell = {}
    for i, (w, h) in imgs.items():
        s = min(1.0, edge / max(w, h))
        cell[i] = [max(MIN_CELL, pow2_floor(int(w * s))), max(MIN_CELL, pow2_floor(int(h * s)))]
    total = sum(demand.values()) or 1.0
    cap = {i: [max(MIN_CELL, pow2_floor(int(w * min(1.0, edge / max(w, h))))),
               max(MIN_CELL, pow2_floor(int(h * min(1.0, edge / max(w, h)))))]
           for i, (w, h) in imgs.items()}

    def density(i, c):
        return (c[0] * c[1]) / max(1e-9, demand.get(i, 0.0) / total)

    def fit():
        return shelf_pack([(i, c[0], c[1]) for i, c in cell.items()], edge, n_atlas)

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


# ---- the stage ---------------------------------------------------------------

def run(src: str, out: str | None, edge: int, pad: int, max_draws: int, want_atlases: int = 0, quality: float = 0.45) -> dict:
    from PIL import Image
    import io as _io

    j, b = load(src)
    rows = analyse(j, b)
    before_draws = sum(len(m.get("primitives", [])) for m in j.get("meshes", []))
    elig = [r for r in rows if r["eligible"]]
    report: dict = {
        "src": src, "beforeDraws": before_draws, "edge": edge, "pad": pad,
        "prims": [{k: r[k] for k in ("mesh", "prim", "material", "image", "uv", "eligible", "why")} for r in rows],
    }
    if len(j.get("meshes", [])) != 1 or len(elig) < 2:
        report["skip"] = "少於兩個可併的 primitive（或多個 mesh,變換不同）"
        return report

    imgs: dict[int, tuple[int, int]] = {}
    raw: dict[int, "Image.Image"] = {}
    for r in elig:
        i = r["image"]
        if i in raw:
            continue
        im = j["images"][i]
        if "bufferView" not in im:
            report["skip"] = f"image {i} 不在 buffer 裡（外部 uri）,⛔ 不處理"
            return report
        p = Image.open(_io.BytesIO(view_bytes(j, b, im["bufferView"]))).convert("RGBA")
        raw[i] = p
        imgs[i] = (p.width, p.height)

    demand: dict[int, float] = {}
    for r in elig:
        demand[r["image"]] = demand.get(r["image"], 0.0) + r["area"]

    # 幾張圖集？ ⭐ 取**還進得了 draw call 預算的最多張** —— ⛔ 不是「最少張」。
    #  ⚠️ 少一張圖集省的是 0.33 MB VRAM（額度 4 MB,不缺）,⛔ 代價卻是每一格的貼圖
    #  再糊一倍。⇒ 在預算之內,多一張圖集永遠比較好；`--atlases` 可以人工壓回去。
    cap_area = sum(min(w, edge) * min(h, edge) for w, h in imgs.values()) or 1
    best: tuple | None = None
    for n in range(1, max(1, max_draws) + 1):
        if want_atlases and n != want_atlases:
            continue
        c, pl = plan_cells(imgs, demand, edge, n)
        if pl is None:
            continue
        draws = len({(r["key"], pl[r["image"]][0]) for r in elig}) + (len(rows) - len(elig))
        if draws > max_draws:
            break
        ratio = sum(v[0] * v[1] for v in c.values()) / cap_area
        best = (ratio, n, c, pl)       # ⭐ 保留**最後一個**可行的 —— 品質隨 N 單調上升
        if ratio >= quality:
            break                      # 到品質底線就停,⛔ 不要為了 0.01 再多燒一張圖集
    n_atlas, cell, place = (best[1], best[2], best[3]) if best else (0, None, None)
    if best:
        report["quality"] = round(best[0], 3)
    if place is None:
        report["skip"] = f"{edge}² × {max_draws} 張圖集也塞不下"
        return report

    atlases = [Image.new("RGBA", (edge, edge), (0, 0, 0, 0)) for _ in range(n_atlas)]
    uvmap: dict[int, tuple[int, float, float, float, float]] = {}
    for i, p in raw.items():
        a, x, y = place[i]
        cw, ch = cell[i]
        iw, ih = max(1, cw - 2 * pad), max(1, ch - 2 * pad)
        cimg = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        dilate_into(cimg, p.resize((iw, ih), Image.LANCZOS), min(pad, (cw - iw) // 2))
        atlases[a].paste(cimg, (x, y))
        uvmap[i] = (a, (x + pad) / edge, iw / edge, (y + pad) / edge, ih / edge)

    # 新 image / texture（sampler 一律 CLAMP —— ⛔ 溢出要夾在自己的擴邊裡）
    j.setdefault("samplers", []).append({"wrapS": CLAMP_TO_EDGE, "wrapT": CLAMP_TO_EDGE})
    samp = len(j["samplers"]) - 1
    atlas_tex = []
    for a, im in enumerate(atlases):
        buf = _io.BytesIO()
        im.save(buf, format="PNG", optimize=True)
        vi = append_view(j, b, buf.getvalue())
        j.setdefault("images", []).append({"bufferView": vi, "mimeType": "image/png", "name": f"atlas{a}"})
        j.setdefault("textures", []).append({"source": len(j["images"]) - 1, "sampler": samp})
        atlas_tex.append(len(j["textures"]) - 1)

    # UV 重映射（逐 primitive 一份新的 TEXCOORD accessor）＋ 材質改指圖集
    mesh = j["meshes"][0]
    for r in elig:
        a, ox, sw, oy, sh = uvmap[r["image"]]
        uv = read_acc(j, b, r["uvAccessor"])
        blob = b"".join(struct.pack("<ff", ox + min(max(u, 0.0), 1.0) * sw, oy + min(max(v, 0.0), 1.0) * sh) for u, v in uv)
        vi = append_view(j, b, blob, 34962)
        j["accessors"].append({"bufferView": vi, "componentType": 5126, "count": len(uv), "type": "VEC2"})
        prim = mesh["primitives"][r["prim"]]
        prim["attributes"][f"TEXCOORD_{r['uvSet']}"] = len(j["accessors"]) - 1
        mat = json.loads(json.dumps(j["materials"][r["material"]]))
        mat.pop("name", None)
        mat.setdefault("pbrMetallicRoughness", {})["baseColorTexture"] = {"index": atlas_tex[a]}
        if r["uvSet"]:
            mat["pbrMetallicRoughness"]["baseColorTexture"]["texCoord"] = r["uvSet"]
        j["materials"].append(mat)
        prim["material"] = len(j["materials"]) - 1

    # 材質去重 ⇒ 畫法相同的 primitive 現在**逐位元組相等**,merge_glb_prims 才接得起來
    dedup: dict[str, int] = {}
    remap: dict[int, int] = {}
    for mi, m in enumerate(j["materials"]):
        k = json.dumps({kk: vv for kk, vv in m.items() if kk not in ("name", "extras")}, sort_keys=True)
        remap[mi] = dedup.setdefault(k, mi)
    for prim in mesh["primitives"]:
        if isinstance(prim.get("material"), int):
            prim["material"] = remap[prim["material"]]

    j["buffers"] = [{"byteLength": len(b)}]
    report["atlases"] = n_atlas
    report["cells"] = {str(i): {"cell": cell[i], "at": list(place[i]), "from": list(imgs[i])} for i in imgs}
    report["afterDrawsPredicted"] = len({(r["key"], uvmap[r["image"]][0]) for r in elig}) + (len(rows) - len(elig))
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
    ap.add_argument("--atlases", type=int, default=0, help="⭐ 人工指定張數（⛔ 0 = 自動取預算內最多張）")
    a = ap.parse_args()
    r = run(a.src, a.out, a.edge, a.pad, a.max_draws, a.atlases, a.quality)
    print(json.dumps(r, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
