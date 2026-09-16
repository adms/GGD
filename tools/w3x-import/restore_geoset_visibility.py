#!/usr/bin/env python3
"""GH#1186 —— 把 MDX 的「逐動作顯示／隱藏」（GEOA 的 KGAO alpha 軌）翻成 glTF。

owner 2026-09-16（逐字）：「拳四郎 站立 跟 奔跑 多餘白光 要處理吧」

⭐ 翻譯，⛔ 不是近似（CLAUDE.md 第〇·五守則）。原作說「第 N 片在這個動作隱藏」，
   而 glTF 沒有「逐動作隱藏網格」這個標籤，蒙皮網格又**忽略自己節點的變換** ⇒
   純核心 glTF 唯一表達得了的地方是**骨頭**：把那一片**專用**的骨頭子樹縮到 0，
   所有頂點塌成同一個點，畫面上就沒有它。

它只做一種形狀，其餘一律拒絕並指名（⛔ 不猜）：
  ① 那一片在 GLB 裡找得到 —— 某個 primitive 裡連續的一段頂點，頂點數、三角形拓撲、
     綁的骨頭名稱三樣都對得上（轉檔器合併 primitive 時保留原本順序）
  ② 那段頂點綁的骨頭**只有它在用**（GLB 裡其他任何頂點都不綁）
  ③ 那組骨頭是**一整棵子樹**：只有一根最上層，底下每個節點都在組裡或完全沒人用、也不掛網格
  ④ alpha 只有 0／1、不內插（interp 0）、不是 global sequence
  ⇒ 在最上層那根骨頭**上面插一個顯示節點**（單位變換），每一個動作加一條 STEP scale 軌。
     ⭐ 插節點而不是直接縮那根骨頭：那根骨頭常常已有自己的 scale 軌（拳四郎 6/6 根都有），
        而 glTF 同一個動作裡同一個 node＋path 只能有一條。

判讀沿用 `geoset_alpha_report.alpha_in_seq`（GH#742）：只看**該動作區間內**的關鍵格；
區間內沒有、或在第一格之前 ⇒ 用 GEOA 的靜態 alpha。⛔ 別的動作的關鍵格不可以漏進來。

⛔ 不動：幾何／貼圖／材質／蒙皮／既有動畫軌的每一個位元組 —— 只追加，而且工具自己驗。

  python3 tools/w3x-import/restore_geoset_visibility.py --mdx <file.mdx|來源.zip> --glb in.glb --out out.glb \\
      [--rest-clip "Stand - 1"] [--require-clips "Stand - 1,Walk"] [--receipt 收據.json]

離開碼：0 成功 · 2 有一片在 --require-clips 的動作裡該隱藏卻轉不了（⛔ 不寫檔：半套修好比沒修更難查）
        · 3 原檔沒有任何一片逐動作隱藏（⛔ 不寫檔）
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import struct
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import geoset_alpha_report as gar  # noqa: E402
from w3xlib.mdx import parse_mdx  # noqa: E402

VIS_PREFIX = "geoa-vis:"
FMT = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
NORM = {5120: 127.0, 5121: 255.0, 5122: 32767.0, 5123: 65535.0}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


class Refused(Exception):
    pass


def read_glb(data: bytes):
    magic, version, length = struct.unpack_from("<4sII", data)
    if (magic, version, length) != (b"glTF", 2, len(data)):
        raise SystemExit("⛔ 不是 GLB 2.0")
    jlen, _ = struct.unpack_from("<II", data, 12)
    gltf = json.loads(data[20:20 + jlen])
    off = 20 + jlen
    blen, btype = struct.unpack_from("<II", data, off)
    if btype != 0x004E4942 or len(gltf.get("buffers", [])) != 1 or "uri" in gltf["buffers"][0]:
        raise SystemExit("⛔ 只支援單一內嵌 BIN buffer")
    return gltf, bytearray(data[off + 8:off + 8 + blen])


def write_glb(gltf, binary: bytearray) -> bytes:
    js = json.dumps(gltf, ensure_ascii=False, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    body = bytes(binary) + b"\0" * (-len(binary) % 4)
    return (struct.pack("<4sII", b"glTF", 2, 28 + len(js) + len(body))
            + struct.pack("<II", len(js), 0x4E4F534A) + js
            + struct.pack("<II", len(body), 0x004E4942) + body)


def read_accessor(gltf, binary, index):
    acc = gltf["accessors"][index]
    if "sparse" in acc or "bufferView" not in acc:
        raise Refused(f"accessor {index} 是 sparse／沒有 bufferView")
    fmt = "<" + FMT[acc["componentType"]] * NCOMP[acc["type"]]
    view = gltf["bufferViews"][acc["bufferView"]]
    stride = view.get("byteStride", struct.calcsize(fmt))
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    rows = [struct.unpack_from(fmt, binary, base + i * stride) for i in range(acc["count"])]
    if acc.get("normalized"):
        rows = [tuple(v / NORM[acc["componentType"]] for v in r) for r in rows]
    return rows


def append_float_accessor(gltf, binary: bytearray, rows, kind: str) -> int:
    binary.extend(b"\0" * (-len(binary) % 4))
    offset = len(binary)
    flat = [float(v) for r in rows for v in r]
    binary.extend(struct.pack("<%df" % len(flat), *flat))
    gltf["bufferViews"].append({"buffer": 0, "byteOffset": offset, "byteLength": len(binary) - offset})
    n = NCOMP[kind]
    gltf["accessors"].append({
        "bufferView": len(gltf["bufferViews"]) - 1, "componentType": 5126, "count": len(rows), "type": kind,
        "min": [min(r[i] for r in rows) for i in range(n)], "max": [max(r[i] for r in rows) for i in range(n)],
    })
    return len(gltf["accessors"]) - 1


def timeline(track, static_alpha: float, seq) -> list[tuple[float, float]]:
    """[(秒, alpha)]，STEP。與 gar.alpha_in_seq 同一個判讀（GH#742）。"""
    out = [(0.0, static_alpha)]
    if track is None:
        return out
    for frame, value in sorted(k for k in track["keys"] if seq["start"] <= k[0] <= seq["end"]):
        t = (frame - seq["start"]) / 1000.0
        if t == 0.0:
            out[0] = (0.0, value)
        elif value != out[-1][1]:
            out.append((t, value))
    return out


def convert(gltf, binary: bytearray, geosets, seqs, geoas, rest_clip: str | None, require_clips=()):
    """geosets[i] = {vertices, faces, bones:set[str]}；seqs = gar.parse_seqs；geoas = {geoset: gar GEOA}。

    回傳 (report, changed)。只追加 nodes／accessors／bufferViews／animation samplers+channels。
    """
    original = copy.deepcopy(gltf)
    old_binary = bytes(binary)
    anims = gltf.get("animations", [])
    if len(anims) != len(seqs):
        raise Refused(f"GLB 動作 {len(anims)} 個 ≠ MDX 序列 {len(seqs)} 個（⛔ 對不上就不猜哪個是哪個）")
    durations = []
    for a, s in zip(anims, seqs):
        d = max(r[0] for smp in a["samplers"] for r in read_accessor(gltf, binary, smp["input"]))
        if abs(d - (s["end"] - s["start"]) / 1000.0) > 2e-3:
            raise Refused(f"動作「{a['name']}」長度 {d:.3f}s ≠ 序列「{s['name']}」{(s['end'] - s['start']) / 1000:.3f}s")
        durations.append(d)
    if len(gltf.get("skins", [])) != 1:
        raise Refused("只支援剛好一個 skin")
    joints = gltf["skins"][0]["joints"]
    nodes = gltf["nodes"]
    parent = {c: i for i, n in enumerate(nodes) for c in n.get("children", [])}

    # 每個 primitive：每個頂點綁到的骨頭（w>0）、三角形
    prims = []
    usage = [0] * len(joints)
    for mi, mesh in enumerate(gltf["meshes"]):
        for pi, p in enumerate(mesh["primitives"]):
            a = p["attributes"]
            if "JOINTS_1" in a:
                raise Refused(f"mesh {mi} prim {pi} 有 JOINTS_1（不支援）")
            vj = []
            if "JOINTS_0" in a:
                for jr, wr in zip(read_accessor(gltf, binary, a["JOINTS_0"]), read_accessor(gltf, binary, a["WEIGHTS_0"])):
                    used = frozenset(j for j, w in zip(jr, wr) if w > 0)
                    vj.append(used)
                    for j in used:
                        usage[j] += 1
            idx = [r[0] for r in read_accessor(gltf, binary, p["indices"])] if "indices" in p else list(range(len(vj)))
            tris = [tuple(sorted(idx[i:i + 3])) for i in range(0, len(idx) - len(idx) % 3, 3)]
            names = [frozenset(nodes[joints[j]].get("name") for j in s) for s in vj]
            prims.append({"mesh": mi, "prim": pi, "vj": vj, "names": names, "tris": tris})

    report = {"converted": [], "refused": [], "absent": [], "unconditional": 0}
    plan = {}  # top node -> {"geosets": [...], "lines": [...]}
    for g, geo in enumerate(geosets):
        entry = geoas.get(g)
        track = entry["tracks"].get("KGAO") if entry else None
        static = entry["static_alpha"] if entry else 1.0
        lines = [timeline(track, static, s) for s in seqs]
        hidden_in = [s["name"] for s, line in zip(seqs, lines) if any(v <= 0 for _, v in line)]
        if not hidden_in:
            report["unconditional"] += 1
            continue
        row = {"geoset": g, "hiddenIn": hidden_in}
        try:
            if track and (track["interp"] != 0 or track["gseq"] != -1):
                raise Refused(f"KGAO interp={track['interp']} gseq={track['gseq']}（只轉不內插、非 global sequence）")
            if any(v not in (0.0, 1.0) for line in lines for _, v in line):
                raise Refused("alpha 不是只有 0／1")
            n, faces = len(geo["vertices"]), geo["faces"]
            want = sorted(tuple(sorted(faces[i:i + 3])) for i in range(0, len(faces), 3))
            hits = []
            for p in prims:
                vj, names = p["vj"], p["names"]
                if len(vj) < n:
                    continue
                bad = [0]
                for s in names:
                    bad.append(bad[-1] + (0 if s and s <= geo["bones"] else 1))
                for o in range(len(vj) - n + 1):
                    if bad[o + n] - bad[o] or frozenset().union(*names[o:o + n]) != geo["bones"]:
                        continue
                    inside, crossing = [], False
                    for t in p["tris"]:
                        k = sum(1 for x in t if o <= x < o + n)
                        if k == 3:
                            inside.append(tuple(x - o for x in t))
                        elif k:
                            crossing = True
                            break
                    if not crossing and sorted(inside) == want:
                        hits.append((p, o))
            if not hits:
                report["absent"].append(row)
                continue
            if len(hits) > 1:
                raise Refused(f"GLB 裡有 {len(hits)} 段都對得上（⛔ 不猜是哪一段）")
            p, o = hits[0]
            mine = {}
            for s in p["vj"][o:o + n]:
                for j in s:
                    mine[j] = mine.get(j, 0) + 1
            shared = sorted(nodes[joints[j]].get("name") for j, c in mine.items() if usage[j] != c)
            if shared:
                raise Refused(f"骨頭 {shared} 也綁著別的頂點（縮它會連別的一起縮）")
            group = {joints[j] for j in mine}
            tops = [x for x in group if parent.get(x) not in group]
            if len(tops) != 1:
                raise Refused(f"那組骨頭有 {len(tops)} 根最上層（要剛好一棵子樹）")
            top = tops[0]
            stack, joint_index = [top], {node: i for i, node in enumerate(joints)}
            while stack:
                x = stack.pop()
                if x not in group and (joint_index.get(x) is None or usage[joint_index[x]] or "mesh" in nodes[x]):
                    raise Refused(f"子樹裡的「{nodes[x].get('name')}」不屬於這一片（有人在用或掛著網格）")
                stack.extend(nodes[x].get("children", []))
            if top in parent and str(nodes[parent[top]].get("name", "")).startswith(VIS_PREFIX):
                raise Refused("已經轉過了（最上層骨頭上面已有顯示節點）")
            row.update(primitive=[p["mesh"], p["prim"]], vertexOffset=o, vertices=n, triangles=len(want),
                       bones=sorted(geo["bones"]), top={"node": top, "name": nodes[top].get("name")})
            slot = plan.setdefault(top, {"rows": [], "lines": lines})
            if slot["lines"] != lines:
                raise Refused(f"與 geoset {[r['geoset'] for r in slot['rows']]} 共用同一棵子樹但顯示時間不同")
            slot["rows"].append(row)
        except Refused as why:
            row["reason"] = str(why)
            report["refused"].append(row)

    required = set(require_clips)
    blocking = [r for r in report["refused"] if required & set(r["hiddenIn"])]
    report["blocking"] = blocking
    if blocking or not plan:
        return report, False

    names = [s["name"] for s in seqs]
    rest = names.index(rest_clip) if rest_clip in names else next(
        (i for i, s in enumerate(names) if s.lower().startswith("stand")), 0)
    report["restClip"] = names[rest]
    cache = {}
    for top, slot in sorted(plan.items()):
        vis = len(nodes)
        rest_value = slot["lines"][rest][0][1]
        nodes.append({"name": f"{VIS_PREFIX}geoset{'+'.join(str(r['geoset']) for r in slot['rows'])}",
                      "children": [top], "scale": [rest_value] * 3})
        if top in parent:
            kids = nodes[parent[top]]["children"]
            kids[kids.index(top)] = vis
        else:
            for scene in gltf.get("scenes", []):
                if top in scene["nodes"]:
                    scene["nodes"][scene["nodes"].index(top)] = vis
        for a, line, d in zip(anims, slot["lines"], durations):
            # ⚠️ 時間要**嚴格遞增**（glTF 驗證 ACCESSOR_ANIMATION_INPUT_NON_INCREASING）。
            #    拳四郎「Spell - 1」最後一格剛好切換：0.939 與 GLB 的 0.9390000104904175 差 1e-8，
            #    存成 float32 之後是同一個數 ⇒ 同一刻只留一格，後寫的贏（STEP）。
            keys: list[tuple[float, float]] = []
            for t, v in line:
                t = min(t, d)
                if keys and t - keys[-1][0] < 1e-6:
                    keys[-1] = (keys[-1][0], v)
                else:
                    keys.append((t, v))
            if d - keys[-1][0] >= 1e-6:
                keys.append((d, keys[-1][1]))
            f32 = [struct.unpack("<f", struct.pack("<f", t))[0] for t, _ in keys]
            assert all(x < y for x, y in zip(f32, f32[1:])), (a.get("name"), keys)
            key = tuple(keys)
            if key not in cache:
                cache[key] = (append_float_accessor(gltf, binary, [(t,) for t, _ in keys], "SCALAR"),
                              append_float_accessor(gltf, binary, [(v, v, v) for _, v in keys], "VEC3"))
            a["samplers"].append({"input": cache[key][0], "output": cache[key][1], "interpolation": "STEP"})
            a["channels"].append({"sampler": len(a["samplers"]) - 1, "target": {"node": vis, "path": "scale"}})
        for r in slot["rows"]:
            r["visNode"] = vis
            r["visibleIn"] = [s["name"] for s, line in zip(seqs, slot["lines"]) if any(v > 0 for _, v in line)]
            report["converted"].append(r)
    gltf["buffers"][0]["byteLength"] = len(binary)

    # ⭐ 工具自己驗「只追加」—— ⛔ 不靠呼叫端記得去比
    assert bytes(binary[:len(old_binary)]) == old_binary
    for key in ("meshes", "skins", "materials", "textures", "images", "samplers"):
        assert gltf.get(key) == original.get(key), key
    assert gltf["accessors"][:len(original["accessors"])] == original["accessors"]
    assert gltf["bufferViews"][:len(original["bufferViews"])] == original["bufferViews"]
    for old, new in zip(original["animations"], anims):
        assert new["samplers"][:len(old["samplers"])] == old["samplers"]
        assert new["channels"][:len(old["channels"])] == old["channels"]
    for i, (old, new) in enumerate(zip(original["nodes"], nodes)):
        if old != new:
            assert {k: v for k, v in old.items() if k != "children"} == {k: v for k, v in new.items() if k != "children"}, i
    return report, True


def read_mdx(path: str) -> tuple[bytes, str]:
    if not path.lower().endswith(".zip"):
        return open(path, "rb").read(), os.path.basename(path)
    with zipfile.ZipFile(path) as z:
        members = [m for m in z.namelist() if m.lower().endswith(".mdx")]
        if len(members) != 1:
            raise SystemExit(f"⛔ {path} 裡有 {len(members)} 個 .mdx（要剛好一個）")
        return z.read(members[0]), members[0]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mdx", required=True)
    ap.add_argument("--glb", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--rest-clip")
    ap.add_argument("--require-clips", default="")
    ap.add_argument("--receipt")
    args = ap.parse_args()

    raw, member = read_mdx(args.mdx)
    model = parse_mdx(raw)
    table = gar.chunks(raw)
    seqs = gar.parse_seqs(raw, *table["SEQS"][0])
    geoas = {x["geoset"]: x for x in gar.parse_geoa(raw, *table["GEOA"][0])} if "GEOA" in table else {}
    geosets = [{"vertices": g.vertices, "faces": g.faces,
                "bones": frozenset(model.nodes[b].name for grp in g.matrix_groups for b in grp if b in model.nodes)}
               for g in model.geosets]
    source = open(args.glb, "rb").read()
    gltf, binary = read_glb(source)
    try:
        report, changed = convert(gltf, binary, geosets, seqs, geoas, args.rest_clip,
                                  [c for c in args.require_clips.split(",") if c])
    except Refused as why:
        print(f"⛔ {why}")
        return 2
    receipt = {"schema": "ggd-geoset-visibility@1", "ticket": "GH#1186",
               "method": "STEP scale 動畫掛在插入的顯示節點上（該片專用骨頭子樹的上層），只追加",
               "mdx": {"source": os.path.abspath(args.mdx), "member": member, "sha256": hashlib.sha256(raw).hexdigest()},
               "sourceGlbSha256": hashlib.sha256(source).hexdigest(), **report}
    status = 0
    if changed:
        out = write_glb(gltf, binary)
        os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
        with open(args.out, "wb") as f:
            f.write(out)
        receipt.update(outputSha256=hashlib.sha256(out).hexdigest(), bytes=len(out))
    else:
        status = 2 if report["blocking"] else 3
    if args.receipt:
        with open(args.receipt, "w", encoding="utf-8") as f:
            json.dump(receipt, f, ensure_ascii=False, indent=1)
            f.write("\n")
    print(f"轉換 {len(report['converted'])} 片 · 拒絕 {len(report['refused'])} 片（擋住 {len(report['blocking'])}）"
          f" · GLB 裡沒有 {len(report['absent'])} 片 · 不需要 {report['unconditional']} 片")
    for r in report["converted"]:
        print(f"  ✓ geoset {r['geoset']} → 顯示節點 {r['visNode']}（{r['top']['name']} 之上）· 顯示於 {r['visibleIn'][:6]}")
    for r in report["refused"]:
        print(f"  ⛔ geoset {r['geoset']}：{r['reason']} · 隱藏於 {r['hiddenIn'][:4]}")
    return status


if __name__ == "__main__":
    sys.exit(main())
