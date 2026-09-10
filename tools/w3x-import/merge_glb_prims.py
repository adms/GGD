#!/usr/bin/env python3
"""把一顆 **已經是 GLB** 的模型裡「畫起來一樣」的 primitive 合併成一個。

⭐ 為什麼需要它：`w3xlib/gltf.py` 的合併只服務**從 MDX 轉出來**的模型，
⛔ 而有些 ou99 貼文直接發 `.glb`（`ou99.287871` 洛克人 · `ou99.457594` 幸運超人）
—— 那些檔案沒有 MDX 可以重轉，於是它們**永遠停在未合併的版面**。

⛔ 不要用「豁免名單」處理它們：一份靠散文守著的例外會活過它的保存期限，
⭐ 正解是讓不變量對**每一顆出貨模型**都成立。

判準與轉換器同一條：材質 JSON 去掉 `name` 與 `extras`（那兩格是溯源資料，
⛔ 不是渲染狀態）之後相等 ⇒ 同一份材質 ⇒ 幾何接起來，draw call 才真的變少。
"""
import json, struct, sys, os

CT = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def load(p):
    with open(p, "rb") as f:
        f.read(12)
        ln, _ = struct.unpack("<II", f.read(8))
        js = f.read(ln)
        f.read((4 - ln % 4) % 4)
        bl, _ = struct.unpack("<II", f.read(8))
        return json.loads(js.decode("utf-8")), bytearray(f.read(bl))


def save(p, j, b):
    js = json.dumps(j, separators=(",", ":")).encode("utf-8")
    js += b" " * ((4 - len(js) % 4) % 4)
    bb = bytes(b) + b"\x00" * ((4 - len(b) % 4) % 4)
    with open(p, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + 8 + len(bb)))
        f.write(struct.pack("<II", len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack("<II", len(bb), 0x004E4942)); f.write(bb)


def read_acc(j, b, i):
    a = j["accessors"][i]; bv = j["bufferViews"][a["bufferView"]]
    fmt = CT[a["componentType"]]; n = NC[a["type"]]
    stride = bv.get("byteStride") or struct.calcsize(fmt) * n
    off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    return [struct.unpack_from("<" + fmt * n, b, off + k * stride) for k in range(a["count"])]


def render_key(j, mi):
    m = j.get("materials", [])[mi] if mi is not None and mi < len(j.get("materials", [])) else {}
    return json.dumps({k: v for k, v in m.items() if k not in ("name", "extras")}, sort_keys=True)


def merge(path: str) -> str:
    j, b = load(path)
    prim_of = [(ni, pi) for ni, n in enumerate(j.get("nodes", []))
               if n.get("mesh") is not None
               for pi in range(len(j["meshes"][n["mesh"]]["primitives"])) ]
    if len(prim_of) <= 1:
        return "⭐ 只有一個 primitive,不用合併"
    # 只處理「單一 mesh」的常見形狀 —— ⛔ 多 mesh 節點各有自己的變換,接起來會跑位
    meshes = {j["nodes"][ni]["mesh"] for ni, _ in prim_of}
    if len(meshes) != 1:
        return f"⏭ 有 {len(meshes)} 個 mesh 節點,⛔ 不合併（變換不同）"
    mesh = j["meshes"][next(iter(meshes))]
    groups: dict[str, list[dict]] = {}
    order: list[str] = []
    for pr in mesh["primitives"]:
        k = render_key(j, pr.get("material"))
        if k not in groups: groups[k] = []; order.append(k)
        groups[k].append(pr)
    if len(order) == len(mesh["primitives"]):
        return "⭐ 每個 primitive 畫法都不同,已經是最少的 draw call"
    new_prims = []
    tail = len(b)
    for k in order:
        prs = groups[k]
        if len(prs) == 1: new_prims.append(prs[0]); continue
        attr_names = sorted(set().union(*[set(p["attributes"]) for p in prs]))
        attrs = {}
        base_counts = []
        for name in attr_names:
            rows = []
            for p in prs:
                ai = p["attributes"].get(name)
                if ai is None:
                    return f"⛔ primitive 缺屬性 {name},未合併"
                rows.append(read_acc(j, b, ai))
            a0 = j["accessors"][prs[0]["attributes"][name]]
            fmt = CT[a0["componentType"]]; n = NC[a0["type"]]
            blob = b"".join(struct.pack("<" + fmt * n, *v) for r in rows for v in r)
            while len(b) % 4: b.append(0)
            off = len(b); b += blob
            j["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": len(blob), "target": 34962})
            acc = {"bufferView": len(j["bufferViews"]) - 1, "componentType": a0["componentType"],
                   "count": sum(len(r) for r in rows), "type": a0["type"]}
            if name == "POSITION":
                flat = [v for r in rows for v in r]
                acc["min"] = [min(v[c] for v in flat) for c in range(3)]
                acc["max"] = [max(v[c] for v in flat) for c in range(3)]
            j["accessors"].append(acc)
            attrs[name] = len(j["accessors"]) - 1
            if not base_counts: base_counts = [len(r) for r in rows]
        faces = []; base = 0
        for p, cnt in zip(prs, base_counts):
            faces += [v[0] + base for v in read_acc(j, b, p["indices"])]
            base += cnt
        ctype, fmt = (5125, "I") if base > 0xFFFF else (5123, "H")
        blob = struct.pack("<" + fmt * len(faces), *faces)
        while len(b) % 4: b.append(0)
        off = len(b); b += blob
        j["bufferViews"].append({"buffer": 0, "byteOffset": off, "byteLength": len(blob), "target": 34963})
        j["accessors"].append({"bufferView": len(j["bufferViews"]) - 1, "componentType": ctype,
                               "count": len(faces), "type": "SCALAR"})
        new_prims.append({"attributes": attrs, "indices": len(j["accessors"]) - 1,
                          "material": prs[0].get("material")})
    before = len(mesh["primitives"])
    mesh["primitives"] = new_prims
    j["buffers"] = [{"byteLength": len(b)}]
    save(path, j, b)
    return f"⭐ draw call {before} → {len(new_prims)}"


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(f"{os.path.basename(p):<32}{merge(p)}")
