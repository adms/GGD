#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
beam-orient —— 從**真的 .glb 位元組**推導每一份 `model@1` 的**長軸**（#555）。

── owner 2026-08-22 ────────────────────────────────────────────────────────────
「翻滾光束應該包含 **90 度橫放的 beam** 吧」「許多角色的**衝擊波特效橫放 beam**」

⚠️ 缺陷：原作的 beam 模型多半沿**自己的長軸**建，而 `spawnModelFx` 只給了模型一個
繞世界 Y 的偏航 —— 偏航轉不動「立著的東西」。於是 Saber 的翻滾光束
（`imported.netherstrike`，一根 30.7 高的柱子）在畫面上是**一根直立的柱子平移過去**，
莉娜的龍破斬（`imported.fireblast`，沿 X 建的火焰）則是**橫著**飛。

── ⭐ 為什麼答案住在 `model@1` 而不是每一支技能 ────────────────────────────────
「這一份 mdx 當初朝哪一軸建」是**這份網格自己的性質**。同一份 `netherstrike.glb`
今天被 `godie-e002.e` 與 `godie-e00l.e` 兩支技能引用；寫在技能上 = 同一個事實有 N 個
住處（第〇·四守則），而第三支技能一定會有人忘了填。

── ⭐ 為什麼可以用 bbox 推導（而 `yawOffsetDeg` 不行） ─────────────────────────
長軸是一條**線**，⛔ 不是一個箭頭。所以：
  · glTF 載入器那個 X 鏡射（`__root__` 180° + scale(1,1,−1)）不影響結論；
  · ⛔ 不需要 `modelFacing.test.ts` 那一套骨架對稱性／腳尖偏移的前後線索。

── ⛔ 兩條**拒絕提案**的規則（都是量出來的，不是保守） ─────────────────────────
① **會走路的模型不可以被放倒。** glb 裡有 `walk`/`run` 動畫 ⇒ 它是站著的東西。
   實測：`imported.herocloudstrife`（克勞德幻影）、`imported.azunyan`、`imported.ritsu`
   這一族長軸全是 Y 且都被當成「移動的模型 dummy」用過 —— 把它們的長軸對齊行進方向
   就是**把一個角色摔在地上**，⛔ 不是做出一道光束。
② **`z` 不寫進文件。** Babylon 的前方就是 +Z ⇒ `"z"` 是恆等變換，寫了是一句
   「說了但不會發生」的宣稱（第一·五守則）。ABSENT 已經是它的意思。

用法
    python3 tools/beam-orient/scan.py                # 印普查表
    python3 tools/beam-orient/scan.py --json         # 重寫 census.json
    python3 tools/beam-orient/scan.py --write        # 把提案寫進 content/models/*.json
    python3 tools/beam-orient/scan.py --check        # 出貨文件 vs 現場重解（閘，非零離開）

⚠️ `--write` 預設**只動正在被 `spawnModelFx` 引用的模型**（今天 3 份）——
一個沒有人用的欄位就是一句沒有人驗過的宣稱。`--all` 才會寫進每一個提案。
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import os
import re
import struct
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS = os.path.join(ROOT, "content", "models")
CENSUS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "census.json")

#: 最長邊 / 第二長邊低於這個值 ⇒ 長軸是一次擲硬幣,標成 ambiguous。
#: ⚠️ 它**不是**「夠不夠細長」的門檻(那會把 netherstrike 27×31×27 這種
#: 「粗但真的是立著的」柱子誤殺),只是「這個排名穩不穩」的提醒。
AMBIGUOUS_RATIO = 1.20

LOCOMOTION = re.compile(r"walk|run|move", re.I)
IDENT4 = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]


# ── glb 解析(⛔ 不解頂點:accessor 的 min/max 就是 bbox) ────────────────────────
def read_glb_json(path: str) -> dict:
    with open(path, "rb") as fh:
        data = fh.read()
    magic, _ver, _len = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        raise ValueError(f"not a glb: {path}")
    off, gltf = 12, None
    while off < len(data):
        clen, ctype = struct.unpack_from("<II", data, off)
        if ctype == 0x4E4F534A:
            gltf = json.loads(data[off + 8 : off + 8 + clen].decode("utf-8"))
        off += 8 + clen + ((4 - clen % 4) % 4 if clen % 4 else 0)
    if gltf is None:
        raise ValueError(f"no JSON chunk: {path}")
    return gltf


def node_matrix(node: dict) -> list[list[float]]:
    """回傳 column-major 4×4(每一格是一個 column)。"""
    if "matrix" in node:
        m = node["matrix"]
        return [m[0:4], m[4:8], m[8:12], m[12:16]]
    tx, ty, tz = node.get("translation", [0, 0, 0])
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    sx, sy, sz = node.get("scale", [1, 1, 1])
    rot = [
        [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
        [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
        [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)],
    ]
    scale = (sx, sy, sz)
    cols = [[rot[i][k] * scale[i] for k in range(3)] + [0.0] for i in range(3)]
    cols.append([tx, ty, tz, 1.0])
    return cols


def mat_mul(a, b):
    return [[sum(a[k][r] * b[c][k] for k in range(4)) for r in range(4)] for c in range(4)]


def mat_apply(m, p):
    return [sum(m[k][r] * p[k] for k in range(3)) + m[3][r] for r in range(3)]


def glb_extents(path: str) -> tuple[list[float], list[float]] | None:
    """rest-pose bbox（世界＝glb 檔案空間）。沒有任何網格 ⇒ None。"""
    gltf = read_glb_json(path)
    nodes, meshes, accs = gltf.get("nodes", []), gltf.get("meshes", []), gltf.get("accessors", [])
    lo, hi = [math.inf] * 3, [-math.inf] * 3

    def visit(idx: int, parent):
        node = nodes[idx]
        mat = mat_mul(parent, node_matrix(node))
        if "mesh" in node:
            for prim in meshes[node["mesh"]].get("primitives", []):
                ai = prim.get("attributes", {}).get("POSITION")
                if ai is None:
                    continue
                acc = accs[ai]
                if "min" not in acc or "max" not in acc:
                    continue
                mn, mx = acc["min"], acc["max"]
                for corner in range(8):
                    pt = [mx[k] if (corner >> k) & 1 else mn[k] for k in range(3)]
                    world = mat_apply(mat, pt)
                    for k in range(3):
                        lo[k] = min(lo[k], world[k])
                        hi[k] = max(hi[k], world[k])
        for child in node.get("children", []):
            visit(child, mat)

    scenes = gltf.get("scenes", [])
    roots = scenes[gltf.get("scene", 0)]["nodes"] if scenes else range(len(nodes))
    for r in roots:
        visit(r, IDENT4)
    if math.isinf(lo[0]):
        return None
    return lo, hi


def glb_walks(path: str) -> bool:
    return any(LOCOMOTION.search(a.get("name", "")) for a in read_glb_json(path).get("animations", []))


# ── content 側的兩張表 ─────────────────────────────────────────────────────────
def champion_body_keys() -> set[str]:
    keys: set[str] = set()
    for path in glob.glob(os.path.join(ROOT, "content", "champions", "*.json")):
        if os.path.basename(path).startswith("_"):
            continue
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
        if isinstance(doc.get("modelKey"), str):
            keys.add(doc["modelKey"])
        for form in doc.get("forms") or []:
            if isinstance(form, dict) and isinstance(form.get("modelKey"), str):
                keys.add(form["modelKey"])
    return keys


def spawn_model_fx_keys() -> dict[str, list[str]]:
    """modelKey → 引用它的技能文件（`spawnModelFx` 節點）。"""
    used: dict[str, list[str]] = {}
    for path in glob.glob(os.path.join(ROOT, "content", "abilities", "*.json")):
        if os.path.basename(path).startswith("_"):
            continue
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)

        def walk(node):
            if isinstance(node, dict):
                if node.get("kind") == "spawnModelFx" and isinstance(node.get("modelKey"), str):
                    used.setdefault(node["modelKey"], []).append(os.path.basename(path)[:-5])
                for value in node.values():
                    walk(value)
            elif isinstance(node, list):
                for value in node:
                    walk(value)

        walk(doc)
    return used


def survey() -> list[dict]:
    bodies, used = champion_body_keys(), spawn_model_fx_keys()
    rows: list[dict] = []
    for path in sorted(glob.glob(os.path.join(MODELS, "*.json"))):
        if os.path.basename(path).startswith("_"):
            continue
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
        mid = doc["id"]
        glb = os.path.join(ROOT, "content", doc["glbPath"])
        row: dict = {
            "id": mid,
            "glbPath": doc["glbPath"],
            "declared": doc.get("fxLongAxis"),
            "usedBy": used.get(mid, []),
            "proposed": None,
            "skip": None,
        }
        rows.append(row)
        if mid in bodies or mid.startswith("champ.") or mid.startswith("prop."):
            row["skip"] = "body"          # 角色/魔物/場景物件永遠不對齊行進方向
            continue
        if not os.path.exists(glb):
            row["skip"] = "missing-glb"
            continue
        box = glb_extents(glb)
        if box is None:
            row["skip"] = "no-mesh"       # 純粒子/純骨架的 .glb,沒有幾何可以量
            continue
        lo, hi = box
        ext = [round(hi[k] - lo[k], 4) for k in range(3)]
        order = sorted(range(3), key=lambda k: -ext[k])
        row["extents"] = ext
        row["ratio"] = round(ext[order[0]] / ext[order[1]], 3) if ext[order[1]] > 1e-9 else None
        row["longAxis"] = "xyz"[order[0]]
        row["ambiguous"] = row["ratio"] is not None and row["ratio"] < AMBIGUOUS_RATIO
        if glb_walks(glb):
            row["skip"] = "walks"         # ⛔ 會走路的東西不可以被放倒
            continue
        row["proposed"] = row["longAxis"]
    return rows


# ── 三種模式 ───────────────────────────────────────────────────────────────────
def cmd_print(rows: list[dict]) -> int:
    print(f"{'model':38s} {'axis':4s} {'ratio':>6s}  {'extents':26s} {'狀態'}")
    for row in sorted(rows, key=lambda r: (r["skip"] is not None, -(r.get("ratio") or 0))):
        ext = row.get("extents")
        ext_s = "(%7.2f,%7.2f,%7.2f)" % tuple(ext) if ext else ""
        note = row["skip"] or ("★ 使用中: " + ", ".join(row["usedBy"]) if row["usedBy"] else "")
        if row.get("ambiguous") and not row["skip"]:
            note = ("⚠️ 長軸接近平手 " + note).strip()
        print(
            f"{row['id']:38s} {str(row.get('longAxis') or '-'):4s} "
            f"{(row.get('ratio') or 0):6.2f}  {ext_s:26s} {note}"
        )
    props = [r for r in rows if r["proposed"] and r["proposed"] != "z"]
    print(f"\n提案 {len(props)} / 量到 {len([r for r in rows if r.get('extents')])} / 總數 {len(rows)}")
    print("使用中: " + ", ".join(f"{r['id']}→{r['proposed'] or r['longAxis']}" for r in rows if r["usedBy"]))
    return 0


def cmd_json(rows: list[dict]) -> int:
    with open(CENSUS, "w", encoding="utf-8") as fh:
        json.dump({"ambiguousRatio": AMBIGUOUS_RATIO, "rows": rows}, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print(f"wrote {CENSUS}")
    return 0


def cmd_write(rows: list[dict], every: bool) -> int:
    changed = 0
    for row in rows:
        want = row["proposed"]
        # ⛔ `z` 是恆等 ⇒ 不寫(第一·五守則);⛔ 沒有人用的模型不寫(除非 --all)
        if not want or want == "z" or (not every and not row["usedBy"]):
            continue
        if row["declared"] == want:
            continue
        path = os.path.join(MODELS, f"{row['id']}.json")
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
        doc["fxLongAxis"] = want
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, ensure_ascii=False, indent=2)
        print(f"{row['id']}: fxLongAxis = {want}")
        changed += 1
    print(f"changed {changed}")
    return 0


def cmd_check(rows: list[dict]) -> int:
    bad = []
    for row in rows:
        declared = row["declared"]
        if declared is None:
            continue
        if row["skip"]:
            bad.append(f"{row['id']}: 宣告了 {declared}，但這份模型被判為 `{row['skip']}` ⇒ ⛔ 不該有長軸")
        elif declared != row["longAxis"]:
            bad.append(
                f"{row['id']}: 宣告 {declared}，.glb 現場重解是 {row['longAxis']} "
                f"(extents={row['extents']}) ⇒ 模型重匯出過了，跑 --write"
            )
    for line in bad:
        print("⛔ " + line, file=sys.stderr)
    declared_n = len([r for r in rows if r["declared"]])
    print(f"beam-orient --check: {declared_n} 份宣告，{len(bad)} 份對不上")
    return 1 if bad else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--json", action="store_true", help="重寫 census.json")
    ap.add_argument("--write", action="store_true", help="把提案寫進 content/models/*.json")
    ap.add_argument("--all", action="store_true", help="--write 時連沒有人引用的模型也寫")
    ap.add_argument("--check", action="store_true", help="出貨文件 vs 現場重解（閘）")
    args = ap.parse_args()
    rows = survey()
    if args.check:
        return cmd_check(rows)
    if args.write:
        return cmd_write(rows, args.all)
    if args.json:
        return cmd_json(rows)
    return cmd_print(rows)


if __name__ == "__main__":
    raise SystemExit(main())
