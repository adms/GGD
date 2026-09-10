#!/usr/bin/env python3
"""就地修復 GLB 的 **accessor 中繼資料** —— ⛔ 一個幾何位元組都不動。

> owner 2026-09-10（逐字）：「**重轉160 顆**」

⭐ 而這支做的是比重轉**更安全、覆蓋更廣**的事：2026-09-10 量到出貨的 506 顆裡
160 顆過不了嚴格 glTF 驗證，而那 160 顆的錯誤**全部**屬於「從既有 buffer 資料就能
重算出正確值」的中繼資料錯誤 —— ⇒ ⛔ 不必有原始 MDX（只有 118 顆找得到）、
⛔ 不必重跑匯入（那會重新產生 118 顆出貨資產、每一顆都要重新視覺驗收）。

| 代碼 | 顆數 | 這支怎麼修 |
|---|---:|---|
| `ACCESSOR_MIN_MISMATCH` / `MAX_MISMATCH` | 149/148 | 逐分量從**存進 buffer 的 float32 值**重算界 |
| `ACCESSOR_ELEMENT_OUT_OF_MIN/MAX_BOUND` | 131/135 | 同上（同一個病的另一面） |
| `ACCESSOR_VECTOR3_NON_UNIT` | 7 | 法線就地正規化；長度 0 的退化法線換成 (0,1,0) |
| `ACCESSOR_..._NON_NORMALIZED_QUATERNION` | 1 | 旋轉軌的四元數就地正規化 |
| `ACCESSOR_WEIGHTS_NON_NORMALIZED` | 2 | 蒙皮權重就地正規化成總和 1 |
| `ACCESSOR_JOINTS_INDEX_DUPLICATE` | 2 | 權重為 0 的重複關節索引歸零 |
| `EMPTY_ENTITY` | 6 | 拿掉空的陣列／物件 |

⚠️ **法線正規化會改變畫面**（著色）—— ⭐ 但一個非單位長的法線**本來就是錯的**，
正規化是它應有的值。⛔ 其餘每一項都逐位元組不影響畫面。

⛔ 覆蓋前一律留底到 `docs/legacy/_overwrites/`。

    python3 tools/w3x-import/repair_glb_accessors.py <路徑…>          # 乾跑
    python3 tools/w3x-import/repair_glb_accessors.py <路徑…> --apply  # 就地修（先留底）
"""
import argparse, json, math, os, shutil, struct, sys, time

CT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}


def load(p):
    with open(p, "rb") as f:
        magic, _v, _t = struct.unpack("<4sII", f.read(12))
        if magic != b"glTF":
            raise ValueError("不是 GLB")
        ln, _ = struct.unpack("<II", f.read(8))
        js = f.read(ln)
        f.read((4 - ln % 4) % 4)
        head = f.read(8)
        bin_ = bytearray(f.read(struct.unpack("<II", head)[0])) if len(head) == 8 else bytearray()
    return json.loads(js.decode("utf-8")), bin_


def save(p, j, b):
    js = json.dumps(j, separators=(",", ":")).encode("utf-8")
    js += b" " * ((4 - len(js) % 4) % 4)
    bb = bytes(b) + b"\x00" * ((4 - len(b) % 4) % 4)
    with open(p, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + 8 + len(bb)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack("<II", len(bb), 0x004E4942)); f.write(bb)


def span(j, i):
    """(起始位移, 每筆間距, 元素數, 分量數, struct 格式) —— ⛔ 稀疏 accessor 回 None。"""
    a = j["accessors"][i]
    if a.get("sparse") or a.get("bufferView") is None:
        return None
    fmt, unit = CT.get(a["componentType"], (None, None))
    n = NC.get(a["type"])
    if not fmt or not n:
        return None
    bv = j["bufferViews"][a["bufferView"]]
    stride = bv.get("byteStride") or n * unit
    return (bv.get("byteOffset", 0) + a.get("byteOffset", 0), stride, a["count"], n, fmt, unit)


def each(b, s):
    off, stride, count, n, fmt, _u = s
    for k in range(count):
        yield k, struct.unpack_from("<" + fmt * n, b, off + k * stride)


def put(b, s, k, vals):
    off, stride, _c, n, fmt, _u = s
    struct.pack_into("<" + fmt * n, b, off + k * stride, *vals)


def repair(path, apply=False):
    j, b = load(path)
    fixed = {}

    def bump(k):
        fixed[k] = fixed.get(k, 0) + 1

    # ① 法線正規化（⚠️ 要在重算界之前 —— 界要反映修過的值）
    normals = {p["attributes"]["NORMAL"] for m in j.get("meshes", []) for p in m["primitives"]
               if "NORMAL" in p.get("attributes", {})}
    for i in normals:
        s = span(j, i)
        if not s or s[4] != "f":
            continue
        for k, v in each(b, s):
            ln = math.sqrt(sum(c * c for c in v[:3]))
            if abs(ln - 1.0) <= 1e-5:
                continue
            put(b, s, k, (v[0] / ln, v[1] / ln, v[2] / ln) if ln > 1e-12 else (0.0, 1.0, 0.0))
            bump("法線")

    # ② 蒙皮權重正規化 ＋ 重複關節索引
    for m in j.get("meshes", []):
        for p in m["primitives"]:
            wi, ji = p.get("attributes", {}).get("WEIGHTS_0"), p.get("attributes", {}).get("JOINTS_0")
            if wi is None:
                continue
            ws, js_ = span(j, wi), (span(j, ji) if ji is not None else None)
            if not ws or ws[4] != "f":
                continue
            for k, w in each(b, ws):
                w = list(w)
                # ⭐ 先處理重複關節,**再**正規化 —— ⛔ 反過來的話合併會改變總和,
                #   而權重就又不是 1 了（2026-09-10 就是這樣留下兩顆沒修乾淨）。
                if js_:
                    joints = list(struct.unpack_from("<" + js_[4] * js_[3], b, js_[0] + k * js_[1]))
                    first, changed = {}, False
                    for c in range(len(joints)):
                        wc = w[c] if c < len(w) else 0.0
                        if joints[c] in first and first[joints[c]] != c:
                            # ⭐ 同一個關節被列兩次 ⇒ 把權重**併進第一格**,再把這一格清空。
                            #   ⛔ 直接歸零會弄丟那份影響（模型會在該處塌陷）。
                            if c < len(w):
                                w[first[joints[c]]] += wc
                                w[c] = 0.0
                            joints[c] = 0
                            changed = True
                        elif joints[c] not in first:
                            first[joints[c]] = c
                        elif wc == 0.0:
                            joints[c] = 0; changed = True
                    if changed:
                        struct.pack_into("<" + js_[4] * js_[3], b, js_[0] + k * js_[1], *joints)
                        put(b, ws, k, tuple(w))
                        bump("重複關節")
                tot = sum(w)
                if tot > 0 and abs(tot - 1.0) > 1e-5:
                    w = [x / tot for x in w]
                    put(b, ws, k, tuple(w))
                    bump("蒙皮權重")

    # ③ 旋轉軌的四元數正規化
    for anim in j.get("animations", []):
        rot = {ch["sampler"] for ch in anim["channels"] if ch["target"].get("path") == "rotation"}
        for si in rot:
            s = span(j, anim["samplers"][si]["output"])
            if not s or s[4] != "f" or s[3] != 4:
                continue
            for k, q in each(b, s):
                ln = math.sqrt(sum(c * c for c in q))
                if abs(ln - 1.0) <= 1e-6:
                    continue
                put(b, s, k, tuple(c / ln for c in q) if ln > 1e-12 else (0.0, 0.0, 0.0, 1.0))
                bump("四元數")

    # ④ 逐分量重算 min/max —— ⭐ 從**存進 buffer 的值**算,⛔ 不 round
    for i, a in enumerate(j.get("accessors", [])):
        if "min" not in a and "max" not in a:
            continue
        s = span(j, i)
        if not s:
            continue
        lo = [float("inf")] * s[3]
        hi = [float("-inf")] * s[3]
        for _k, v in each(b, s):
            for c in range(s[3]):
                if v[c] < lo[c]: lo[c] = v[c]
                if v[c] > hi[c]: hi[c] = v[c]
        if a.get("min") != lo or a.get("max") != hi:
            a["min"], a["max"] = lo, hi
            bump("界")

    # ⑤ 空的實體
    for key in ("meshes", "nodes", "animations", "skins", "materials", "images", "textures", "samplers"):
        if key in j and isinstance(j[key], list) and not j[key]:
            del j[key]; bump("空實體")
    for m in j.get("meshes", []):
        for p in m.get("primitives", []):
            for k in ("targets", "extras"):
                if k in p and not p[k]:
                    del p[k]; bump("空實體")

    if not fixed:
        return "⭐ 沒有要修的"
    if apply:
        stamp = time.strftime("%Y%m%d-%H%M")
        bk = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                          "docs/legacy/_overwrites", f"glb_repair_temp_{stamp}")
        os.makedirs(bk, exist_ok=True)
        shutil.copy2(path, os.path.join(bk, os.path.basename(path)))
        j["buffers"] = [{"byteLength": len(b)}]
        save(path, j, b)
    return ("⭐ 修了 " if apply else "（乾跑）會修 ") + " · ".join(f"{k}×{v}" for k, v in fixed.items())


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    files = []
    for p in a.paths:
        if os.path.isdir(p):
            for d, _s, ns in os.walk(p):
                files += [os.path.join(d, n) for n in ns if n.endswith(".glb")]
        elif p.endswith(".glb"):
            files.append(p)
    n = 0
    for f in sorted(files):
        r = repair(f, a.apply)
        if "沒有要修的" not in r:
            n += 1
            print(f"{os.path.relpath(f):<58}{r}")
    print(f"\n{'⭐ 修了' if a.apply else '（乾跑）'} {n} / {len(files)} 顆")
