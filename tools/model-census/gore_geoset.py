#!/usr/bin/env python3
"""普查：所有**champion 真的會掛上**的 .glb 裡，殘留的屍體/血泥/第二身體幾何。

⛔ 這一支不是 ``tools/w3x-import/gore_geoset_census.py`` 的複本，它補的是那一支
**結構上看不到**的東西。

為什麼需要第二支（第三守則：去驗證，不要相信註解）
--------------------------------------------------
既有的三支工具各自漏掉一整類，而三個漏洞是**同一個形狀**：它們都在問「這塊幾何
叫什麼名字 / 用什麼材質」，⛔ 沒有一支在問「**它長什麼樣子、擺在哪裡**」。

  · ``strip_geoset_prims.py``      → ``GLB_DIR`` 寫死 imported/，overlay 樹不在射程
  · ``invisible_prim_census.py``   → 選 ``baseColorFactor[3] == 0``；血泥圖元根本
                                     沒有 baseColorFactor，結構上必然綠
  · ``gore_geoset_census.py``      → 選 joint 名字含 ``gutz``。⭐ 這一條是對的，
                                     但它只認得**暴雪自己**的命名慣例：
                                     ``Efur.glb``（揍敵客）整份模型連一個 gutz
                                     joint 都沒有，而 ``imported/`` 那 200+ 顆是
                                     第三方轉檔，命名慣例完全不同。

⇒ 本工具改成**從幾何推導**（owner 點名兩位英雄，但 16/40 的密度說明還有沒被發現的）：

  A. ``gore-joint``  —— ≥50% 蒙皮權重壓在 ``gutz*`` joint 上（沿用既有判準，最高信心）
  B. ``second-skeleton`` —— 圖元離身體很遠（XZ bbox 完全不重疊），**而且**它的蒙皮
                        掛在**另一具骨架根**上（``Umal.glb`` 的 ``Bone_Root01``：
                        107 頂點，13 個動畫全部驅動它，跟著走跟著打跟著死）

     ⚠️ 「離得遠」單獨**不是**訊號 —— 量過：``E015`` 的 ``1throw``/``1axe-hide``、
     ``H02Y`` 的 ``axe``、``Ubal`` 的 ``skull``/``staff01``、``herolight`` 的
     ``Sword`` 全都是伸在身體外面的**武器**，六個全部只有這一個訊號。所以本工具
     額外要求「**另一具骨架根**」，⛔ 否則這條判準會叫人去藏掉英雄的劍。
  C. ``floor-slab``  —— 又扁又貼地又比身體還寬的板子
                        ⇒ 躺在腳邊的那攤血泥（``Umal.glb`` prim4：1.66×1.23u 的板子
                        壓在 y 0.04…0.21，而身體只有 0.53×1.08u 寬）
  D. ``airborne-clone`` —— 2026-08-22 補（GH#540 的第二輪）。⭐ A/B/C 三條**全部**量
                        bind pose，所以「分身**疊在頭頂正上方**」對它們結構上必然是
                        綠的：XZ 完全重合 ⇒ B 的「不重疊」不成立，Y 又高得不可能是
                        貼地板 ⇒ C 不成立。owner 看到的正是這一種：
                        「揍敵客阿福3d modal 根本還沒修好 戰鬥中 一直看到一個分身
                        飛上天的阿福」。⇒ 這一條改量**動畫中的 Y**（見 census_airborne）。

⚠️ 判定刻意**保守**：藏錯 = 英雄缺一塊，比屍體更嚴重。所以
  · A 是 ``confirmed``（名字與幾何互相佐證時）
  · B/C 單獨成立時只給 ``suspect``，⛔ 不自動填進出貨文件 —— 列進報告讓 owner 決定
  · 圖元總數 ≤1 的模型一律跳過（藏掉唯一一塊 = 整隻消失）

⭐ 涵蓋範圍是「**champion 真的會掛的那些**」，不是「所有 .glb」：
  · ``content/models/*.json`` 的 ``glbPath``（出貨樹，git 追蹤）
  · ``content/models/_overlay-hidden-geometry.json`` + overlay MANIFEST 的 40 隻
    （``data/blizzard-overlay/``，gitignore 的執行期資產）
道具/場景/特效的 .glb 不是身體，藏不藏都不會有人看到屍體。

用法
----
    python3 tools/model-census/gore_geoset.py                 # 人看的表
    python3 tools/model-census/gore_geoset.py --json          # 機器讀的
    python3 tools/model-census/gore_geoset.py --check         # 反向閘（pnpm models:check）
    python3 tools/model-census/gore_geoset.py --fixture PATH  # 寫 overlay 指紋
        ⭐ 同一趟也會寫 tools/model-census/airborne.fixture.json（D 那一條的指紋，
        ⛔ 路徑不可指定：它跟工具住在一起，⛔ 不與 C 的指紋共用一個檔）。

⛔ 無外部相依：直接讀 glTF 的 JSON + BIN chunk。
"""

from __future__ import annotations

import argparse
import json
import os
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

OVERLAY_MODELS_DIR = os.path.join(REPO, "data", "blizzard-overlay", "models")
OVERLAY_GLB_PREFIX = "assets/blizzard-local/models/"
MODELS_DIR = os.path.join(REPO, "content", "models")
OVERLAY_DECL = os.path.join(MODELS_DIR, "_overlay-hidden-geometry.json")

#: 暴雪血泥 geoset 的 joint 名字標記（沿用 gore_geoset_census.py，兩邊必須一致）。
GORE_JOINT_MARKER = "gutz"
#: 一個圖元有這麼多蒙皮權重壓在血泥 joint 上就算血泥。
GORE_WEIGHT_SHARE = 0.5

# ── 幾何門檻（保守側）──────────────────────────────────────────────────────
#: 「扁」：圖元的 y 厚度不超過身高的這個比例。
SLAB_THICKNESS_OF_HEIGHT = 0.20
#: 「貼地」：圖元的頂端不超過身高的這個比例。
SLAB_TOP_OF_HEIGHT = 0.35
#: 「比身體寬」：圖元的 XZ 佔地至少是身體 XZ 佔地的這個倍數。
SLAB_FOOTPRINT_RATIO = 1.5
#: 「躺在旁邊」：圖元的 XZ 重心離身體 XZ 重心至少這麼遠（單位 = 身高比例）。
#: ⭐ 這一條補的是 SLAB_FOOTPRINT_RATIO 漏掉的形狀 —— `E00R.glb` 的血泥板
#: （x −0.03…1.64）並不比身體「寬」多少，它是**整片歪到一邊去**。
OFFSET_CENTROID_OF_HEIGHT = 0.35
#: 「分離」：XZ 上兩個 bbox 之間要留這麼多空隙才算真的沒有重疊（單位 = 身高比例）。
DETACH_GAP_OF_HEIGHT = 0.02
#: 太小的碎片不值得判（武器尖端、飾品）。
MIN_VERTICES = 20
#: 第二具身體至少要有這麼多頂點才算「一具身體」而不是一件道具。
SECOND_SKELETON_MIN_VERTICES = 100
#: 而且它的骨架根底下至少要有這麼多個 joint 真的被動畫驅動。
SECOND_SKELETON_MIN_ANIMATED_JOINTS = 2

# ── 「分身飛上天」（GH#540）────────────────────────────────────────────────
#: ⚠️ 上面 B（second-skeleton）要求 **XZ bbox 完全不重疊**，所以它對「分身**疊在
#: 頭頂正上方**」結構上必然是綠的 —— XZ 完全重合。owner 2026-08-22 看到的正是這一種：
#:「揍敵客阿福3d modal 根本還沒修好 戰鬥中 一直看到一個分身飛上天的阿福」。
#: ⇒ 這一組判準改量**動畫中的 Y**，⛔ 不是 bind pose 的 bbox。
#: 「整塊圖元的**最低**骨頭都高過身體頂端」才算飛 —— 舉高的手臂、揮起的武器不算。
FLY_CLEARANCE_OF_HEIGHT = 0.25
#: 太小的碎片不判（同 MIN_VERTICES 的理由）。
FLY_MIN_VERTICES = 20
#: 每個動作取樣幾個時間點（動作本身的關鍵影格，⛔ 不是等距時間）。
FLY_SAMPLES_PER_CLIP = 6
#: ⛔ `death` 不算：它播一次然後實體就消失了，而 owner 講的是「**一直**看到」。
#: ⚠️ 這裡讀的是 clipMap 的 **key**，⛔ 不是動作名字 —— 名字是每顆模型自己的。
FLY_SKIP_CLIP_ROLES = ("death",)

_COMPONENT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2),
              5125: ("I", 4), 5126: ("f", 4)}
_NUM_COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_glb(path: str):
    """(gltf-json, bin-chunk)。⛔ 刻意不 import 另一支工具：兩份獨立的讀取器
    互相對帳，抄過來只會讓兩邊一起錯（hiddenPrimitives.test.ts 的 TS 版同理）。"""
    with open(path, "rb") as fh:
        data = fh.read()
    magic, _ver, total = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67:
        raise ValueError(f"not a .glb: {path}")
    off, gltf, binc = 12, None, None
    while off < total:
        clen, ctype = struct.unpack_from("<II", data, off)
        off += 8
        chunk = data[off:off + clen]
        off += clen
        if ctype == 0x4E4F534A:
            gltf = json.loads(chunk.decode("utf-8"))
        elif ctype == 0x004E4942:
            binc = chunk
    if gltf is None:
        raise ValueError(f"no JSON chunk: {path}")
    return gltf, binc


def read_accessor(gltf, binc, index):
    acc = gltf["accessors"][index]
    ncomp = _NUM_COMPONENTS[acc["type"]]
    fmt, size = _COMPONENT[acc["componentType"]]
    view = gltf["bufferViews"][acc["bufferView"]]
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = view.get("byteStride") or (ncomp * size)
    return [struct.unpack_from("<" + fmt * ncomp, binc, base + i * stride)
            for i in range(acc["count"])]


def _bbox(points):
    return ([min(p[i] for p in points) for i in range(3)],
            [max(p[i] for p in points) for i in range(3)])


def _union(a, b):
    return ([min(a[0][i], b[0][i]) for i in range(3)],
            [max(a[1][i], b[1][i]) for i in range(3)])


def _xz_overlap(a, b, gap):
    """XZ 平面上兩個 bbox 有沒有重疊（留 gap 餘裕）。"""
    for i in (0, 2):
        if a[1][i] + gap < b[0][i] or b[1][i] + gap < a[0][i]:
            return False
    return True


def _xz_centroid_gap(a, b):
    """兩個 bbox 的 XZ 中心距離 —— 「這塊東西整片歪到旁邊去了」的量。"""
    d = [((a[0][i] + a[1][i]) - (b[0][i] + b[1][i])) / 2.0 for i in (0, 2)]
    return (d[0] * d[0] + d[1] * d[1]) ** 0.5


def _material_alpha(gltf, prim):
    mi = prim.get("material")
    if mi is None:
        return 1.0
    pbr = gltf.get("materials", [])[mi].get("pbrMetallicRoughness", {})
    bcf = pbr.get("baseColorFactor")
    return 1.0 if not bcf or len(bcf) < 4 else float(bcf[3])


def census_one(path: str) -> dict:
    """一顆 .glb 的逐圖元判定。⛔ 不下「要藏」的最終決定，只給訊號與信心。"""
    gltf, binc = read_glb(path)
    names = [n.get("name", "") for n in gltf.get("nodes", [])]
    skins = gltf.get("skins", [])
    prims: list[dict] = []

    # joint → 它所屬的骨架根（往上走到第一個「父親不是 joint」的節點）。
    parent: dict[int, int] = {}
    for i, node in enumerate(gltf.get("nodes", [])):
        for child in node.get("children", []):
            parent[child] = i
    all_joints = {j for s in skins for j in s["joints"]}

    def root_of(j: int) -> int:
        cur = j
        while parent.get(cur) in all_joints:
            cur = parent[cur]
        return cur

    joint_root = {j: root_of(j) for j in all_joints}
    driven = {ch["target"]["node"] for a in gltf.get("animations", [])
              for ch in a.get("channels", []) if ch.get("target", {}).get("node") is not None}
    animated_under = {r: sum(1 for j in all_joints if joint_root[j] == r and j in driven)
                      for r in set(joint_root.values())}

    for node in gltf.get("nodes", []):
        if "mesh" not in node:
            continue
        mesh = gltf["meshes"][node["mesh"]]
        jl = skins[node["skin"]]["joints"] if node.get("skin") is not None and skins else []
        for pi, prim in enumerate(mesh.get("primitives", [])):
            attrs = prim["attributes"]
            if "POSITION" not in attrs:
                continue
            P = read_accessor(gltf, binc, attrs["POSITION"])
            if not P:
                continue
            mn, mx = _bbox(P)
            gore_share = 0.0
            root = None
            if jl and "JOINTS_0" in attrs and "WEIGHTS_0" in attrs:
                J = read_accessor(gltf, binc, attrs["JOINTS_0"])
                W = read_accessor(gltf, binc, attrs["WEIGHTS_0"])
                wnorm = {5121: 255.0, 5123: 65535.0}.get(
                    gltf["accessors"][attrs["WEIGHTS_0"]]["componentType"], 1.0)
                gore_w = total_w = 0.0
                by_root: dict[int, float] = {}
                for jv, wv in zip(J, W):
                    for k in range(4):
                        w = wv[k] / wnorm
                        if w <= 1e-4:
                            continue
                        total_w += w
                        gj = jl[jv[k]]
                        if GORE_JOINT_MARKER in names[gj].lower():
                            gore_w += w
                        r = joint_root[gj]
                        by_root[r] = by_root.get(r, 0.0) + w
                gore_share = gore_w / total_w if total_w > 0 else 0.0
                if by_root:
                    root = max(by_root, key=by_root.get)
            prims.append({
                "primitive": pi, "vertices": len(P), "min": mn, "max": mx,
                "goreWeightShare": round(gore_share, 4),
                "materialAlpha": _material_alpha(gltf, prim),
                "root": root, "rootName": names[root] if root is not None else None,
            })

    out = {"file": os.path.basename(path), "primitiveCount": len(prims), "findings": []}
    if len(prims) <= 1:
        # 藏掉唯一一塊 = 整隻消失。這種模型 `hiddenPrimitives` 無能為力，
        # ⛔ 不是「沒問題」——若真的有屍體，修法是重新轉檔（報告會標出來）。
        out["singlePrimitive"] = True
        return out

    # ── 身體 = 頂點最多的那一塊，再把所有跟它 XZ 相交的併進來 ──────────────
    body = max(prims, key=lambda p: p["vertices"])
    body_box = (body["min"], body["max"])
    for _ in range(len(prims)):
        grown = False
        for p in prims:
            box = (p["min"], p["max"])
            if p["goreWeightShare"] >= GORE_WEIGHT_SHARE:
                continue  # 血泥不可以把身體 bbox 撐大
            # ⚠️ alpha=0 的圖元也不可以 —— `Efur.glb` 的兩片 `TeamGlow2` 平面
            # （2.3u 寬，貼在 1.43u 高的身體上）會把身體佔地灌水成 5.5 倍，
            # 於是任何「比身體寬」的判準對這顆模型結構上必然是綠的。
            if p["materialAlpha"] <= 0.0:
                continue
            if box is not body_box and _xz_overlap(body_box, box, 0.0):
                merged = _union(body_box, box)
                if merged != body_box:
                    body_box, grown = merged, True
        if not grown:
            break
    height = max(body_box[1][1] - body_box[0][1], 1e-6)
    body_area = max((body_box[1][0] - body_box[0][0]) * (body_box[1][2] - body_box[0][2]), 1e-6)
    out["bodyHeight"] = round(height, 4)

    for p in prims:
        box = (p["min"], p["max"])
        signals: list[str] = []
        if p["goreWeightShare"] >= GORE_WEIGHT_SHARE:
            signals.append("gore-joint")
        if p["vertices"] >= MIN_VERTICES and p["materialAlpha"] > 0.0:
            detached = not _xz_overlap(body_box, box, DETACH_GAP_OF_HEIGHT * height)
            if (detached and p["root"] is not None and p["root"] != body["root"]
                    and p["vertices"] >= SECOND_SKELETON_MIN_VERTICES
                    and animated_under.get(p["root"], 0) >= SECOND_SKELETON_MIN_ANIMATED_JOINTS):
                signals.append("second-skeleton")
            elif detached:
                # 情報，⛔ 不是缺陷：伸在身體外面的武器長得跟這一樣（量過六件）。
                out.setdefault("detachedProps", []).append(
                    {"primitive": p["primitive"], "vertices": p["vertices"],
                     "root": p["rootName"]})
            thickness = box[1][1] - box[0][1]
            area = (box[1][0] - box[0][0]) * (box[1][2] - box[0][2])
            low = box[1][1] <= body_box[0][1] + SLAB_TOP_OF_HEIGHT * height
            if thickness <= SLAB_THICKNESS_OF_HEIGHT * height and low:
                if area >= SLAB_FOOTPRINT_RATIO * body_area:
                    signals.append("floor-slab")
                elif _xz_centroid_gap(body_box, box) >= OFFSET_CENTROID_OF_HEIGHT * height:
                    signals.append("offset-floor")
        if not signals:
            continue
        # 名字與幾何互相佐證 ⇒ confirmed；只有幾何 ⇒ suspect（交給 owner）。
        confirmed = "gore-joint" in signals
        out["findings"].append({
            "primitive": p["primitive"], "vertices": p["vertices"],
            "signals": signals, "confidence": "confirmed" if confirmed else "suspect",
            "min": [round(v, 4) for v in p["min"]], "max": [round(v, 4) for v in p["max"]],
        })
    return out


# ── 「分身飛上天」——————————————————————————————————————————————————
def _quat_trs(t, r, s):
    """(3x3, translation) —— glTF 的 TRS 攤成一個仿射轉換。"""
    x, y, z, w = r
    xx, yy, zz = x * x, y * y, z * z
    m = ((1 - 2 * (yy + zz), 2 * (x * y - z * w), 2 * (x * z + y * w)),
         (2 * (x * y + z * w), 1 - 2 * (xx + zz), 2 * (y * z - x * w)),
         (2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (xx + yy)))
    return [[m[i][j] * s[j] for j in range(3)] for i in range(3)], list(t)


def _compose(a, b):
    ma, ta = a
    mb, tb = b
    return ([[ma[i][0] * mb[0][j] + ma[i][1] * mb[1][j] + ma[i][2] * mb[2][j]
              for j in range(3)] for i in range(3)],
            [ma[i][0] * tb[0] + ma[i][1] * tb[1] + ma[i][2] * tb[2] + ta[i] for i in range(3)])


def played_clips() -> dict[str, set[str]]:
    """glbPath → 遊戲**真的會一直播**的動作名。

    ⭐ 從資料推導（出貨 model doc 的 `clipMap` + overlay `MANIFEST.json` 的 `clipMap`），
    ⛔ 不在這裡抄一份動作名清單 —— 抄一份就是第二個住處，而每顆模型的動作名都不一樣
    （`Stand -1` / `stand ready` / `Armature|Triceratops_Idle` 都在出貨資料裡）。
    """
    out: dict[str, set[str]] = {}

    def take(glb, clip_map):
        if not glb or not isinstance(clip_map, dict):
            return
        for role, name in clip_map.items():
            if role in FLY_SKIP_CLIP_ROLES or not name:
                continue
            out.setdefault(glb, set()).add(str(name))

    for name in sorted(os.listdir(MODELS_DIR)):
        if not name.endswith(".json") or name.startswith("_"):
            continue
        doc = json.load(open(os.path.join(MODELS_DIR, name), encoding="utf-8"))
        take(doc.get("glbPath"), doc.get("clipMap"))
    manifest = os.path.join(REPO, "data", "blizzard-overlay", "MANIFEST.json")
    if os.path.isfile(manifest):
        for unit in json.load(open(manifest, encoding="utf-8")).get("units", {}).values():
            take(unit.get("glb"), unit.get("clipMap"))
    return out


def census_airborne(path: str, clips: set[str]) -> list[dict]:
    """一顆 .glb 裡「**整塊浮在身體上方**、而且掛在另一具會動的骨架上」的圖元。

    ⚠️ 兩個條件缺一不可：
      · **整塊**在上面（最低的骨頭都高過身體頂端）⇒ 舉高的手、揮起的劍不會中
      · **另一具骨架**（沿用 B 的判準）⇒ 那是一個**分身**，不是身體的一部分
    """
    gltf, binc = read_glb(path)
    nodes = gltf.get("nodes", [])
    skins = gltf.get("skins", [])
    anims = [a for a in gltf.get("animations", []) if a.get("name") in clips]
    if not skins or not anims:
        return []

    parent: dict[int, int] = {}
    for i, node in enumerate(nodes):
        for child in node.get("children", []):
            parent[child] = i
    all_joints = {j for s in skins for j in s["joints"]}

    def root_of(j: int) -> int:
        cur = j
        while parent.get(cur) in all_joints:
            cur = parent[cur]
        return cur

    joint_root = {j: root_of(j) for j in all_joints}
    driven = {ch["target"]["node"] for a in gltf.get("animations", [])
              for ch in a.get("channels", []) if ch.get("target", {}).get("node") is not None}
    animated_under = {r: sum(1 for j in all_joints if joint_root[j] == r and j in driven)
                      for r in set(joint_root.values())}

    prims: list[dict] = []
    for node in nodes:
        if "mesh" not in node:
            continue
        jl = skins[node["skin"]]["joints"] if node.get("skin") is not None else []
        for pi, prim in enumerate(gltf["meshes"][node["mesh"]].get("primitives", [])):
            attrs = prim["attributes"]
            if "POSITION" not in attrs or not jl or "JOINTS_0" not in attrs:
                continue
            P = read_accessor(gltf, binc, attrs["POSITION"])
            J = read_accessor(gltf, binc, attrs["JOINTS_0"])
            W = read_accessor(gltf, binc, attrs["WEIGHTS_0"])
            wnorm = {5121: 255.0, 5123: 65535.0}.get(
                gltf["accessors"][attrs["WEIGHTS_0"]]["componentType"], 1.0)
            used, by_root = set(), {}
            for jv, wv in zip(J, W):
                for k in range(4):
                    w = wv[k] / wnorm
                    if w <= 1e-4:
                        continue
                    gj = jl[jv[k]]
                    by_root[joint_root[gj]] = by_root.get(joint_root[gj], 0.0) + w
                    if w > 0.2:
                        used.add(gj)
            mn, mx = _bbox(P)
            prims.append({"primitive": pi, "vertices": len(P), "min": mn, "max": mx,
                          "joints": sorted(used), "alpha": _material_alpha(gltf, prim),
                          "root": max(by_root, key=by_root.get) if by_root else None})
    if len(prims) <= 1:
        return []
    body = max(prims, key=lambda p: p["vertices"])
    height = max(body["max"][1] - body["min"][1], 1e-6)
    if not body["joints"]:
        return []

    defaults = [(list(n.get("translation", [0, 0, 0])), list(n.get("rotation", [0, 0, 0, 1])),
                 list(n.get("scale", [1, 1, 1]))) for n in nodes]
    candidates = [p for p in prims
                  if p is not body and p["joints"] and p["alpha"] > 0.0
                  and p["vertices"] >= FLY_MIN_VERTICES and p["root"] is not None
                  and p["root"] != body["root"]
                  and animated_under.get(p["root"], 0) >= SECOND_SKELETON_MIN_ANIMATED_JOINTS]
    if not candidates:
        return []

    hits: dict[int, dict] = {}
    for anim in anims:
        chans, stamps = [], set()
        for ch in anim["channels"]:
            tgt = ch.get("target", {}).get("node")
            if tgt is None:
                continue
            smp = anim["samplers"][ch["sampler"]]
            times = [v[0] for v in read_accessor(gltf, binc, smp["input"])]
            chans.append((tgt, ch["target"]["path"], times,
                          read_accessor(gltf, binc, smp["output"])))
            stamps.update(times)
        stamps = sorted(stamps)
        if not stamps:
            continue
        for when in stamps[::max(1, len(stamps) // FLY_SAMPLES_PER_CLIP)]:
            local = [(list(t), list(r), list(s)) for t, r, s in defaults]
            for tgt, kind, times, values in chans:
                idx = 0
                for k, stamp in enumerate(times):
                    if stamp <= when:
                        idx = k
                    else:
                        break
                v, (t, r, s) = list(values[idx]), local[tgt]
                local[tgt] = (v, r, s) if kind == "translation" else \
                    (t, v, s) if kind == "rotation" else (t, r, v)
            cache: dict[int, tuple] = {}

            def world(i: int):
                got = cache.get(i)
                if got is None:
                    t, r, s = local[i]
                    pa = parent.get(i)
                    got = _quat_trs(t, r, s) if pa is None else _compose(world(pa), _quat_trs(t, r, s))
                    cache[i] = got
                return got

            top = max(world(j)[1][1] for j in body["joints"])
            for p in candidates:
                clearance = (min(world(j)[1][1] for j in p["joints"]) - top) / height
                if clearance <= FLY_CLEARANCE_OF_HEIGHT:
                    continue
                prev = hits.get(p["primitive"])
                if prev is None or clearance > prev["clearance"]:
                    hits[p["primitive"]] = {
                        "primitive": p["primitive"], "vertices": p["vertices"],
                        "signals": ["airborne-clone"], "confidence": "confirmed",
                        "clip": anim.get("name"), "clearance": round(clearance, 2)}
    return sorted(hits.values(), key=lambda f: f["primitive"])


# ── 「誰真的會被 champion 掛上」———————————————————————————————————————
def mounted_glbs() -> list[dict]:
    """[{glbPath, abs, declared, docs}] —— champion 真的會掛的每一顆 .glb。"""
    rows: dict[str, dict] = {}
    for name in sorted(os.listdir(MODELS_DIR)):
        if not name.endswith(".json") or name.startswith("_"):
            continue
        doc = json.load(open(os.path.join(MODELS_DIR, name), encoding="utf-8"))
        glb = doc.get("glbPath")
        if not glb:
            continue
        row = rows.setdefault(glb, {"glbPath": glb, "abs": os.path.join(REPO, "content", glb),
                                    "declared": [], "docs": [], "tree": "shipped"})
        row["docs"].append(doc["id"])
        for p in doc.get("hiddenPrimitives", []):
            if p not in row["declared"]:
                row["declared"].append(p)
    if os.path.isfile(OVERLAY_DECL):
        decl = json.load(open(OVERLAY_DECL, encoding="utf-8")).get("models", {})
    else:
        decl = {}
    if os.path.isdir(OVERLAY_MODELS_DIR):
        for f in sorted(os.listdir(OVERLAY_MODELS_DIR)):
            if not f.endswith(".glb"):
                continue
            glb = OVERLAY_GLB_PREFIX + f
            rows[glb] = {"glbPath": glb, "abs": os.path.join(OVERLAY_MODELS_DIR, f),
                         "declared": list(decl.get(glb, {}).get("hiddenPrimitives", [])),
                         "docs": ["(overlay)"], "tree": "overlay"}
    else:
        for glb, entry in decl.items():
            rows[glb] = {"glbPath": glb, "abs": None,
                         "declared": list(entry.get("hiddenPrimitives", [])),
                         "docs": ["(overlay)"], "tree": "overlay"}
    return [r for r in rows.values() if r["abs"] and os.path.isfile(r["abs"])]


def scan() -> list[dict]:
    out = []
    clips = played_clips()
    for row in mounted_glbs():
        try:
            c = census_one(row["abs"])
            c["airborne"] = census_airborne(row["abs"], clips.get(row["glbPath"], set()))
        except Exception as exc:  # noqa: BLE001 —— 報告，⛔ 永遠不要中斷普查
            c = {"file": os.path.basename(row["abs"]), "error": str(exc),
                 "findings": [], "airborne": []}
        c.update({k: row[k] for k in ("glbPath", "declared", "docs", "tree")})
        out.append(c)
    return out



# ── ⛔ 豁免表 ────────────────────────────────────────────────────────────────
#: `--check` 允許**不宣告**的 (glb 檔名, primitive)。⭐ 每一筆都要帶一個**能被反駁**
#: 的理由 —— 「還沒收」⛔ 不是理由（CLAUDE.md 第〇·四守則的例外條款）。
#:
#: ⚠️ 這張表現在**是空的，而那是量出來的結論不是懶惰**：2026-08-22 掃過
#: 160 顆 champion 會掛的 .glb，20 處殘留幾何**全部**已經宣告（16 顆 overlay
#: 在 `_overlay-hidden-geometry.json`、`hero-turtle` 在它自己的 model doc）。
#: 空表 = 這條閘現在真的攔得住下一顆帶血泥的新模型，⛔ 不是「先放著」。
EXEMPT: dict[tuple[str, int], str] = {}

#: 同一張表的「分身飛上天」版（GH#540）。⭐ 一樣要帶**能被反駁**的理由。
FLY_EXEMPT: dict[tuple[str, int], str] = {
    ("Efur.glb", 9): (
        "靈魂分身的一小塊（34 頂點，掛在 Object49ArchDruid，跟 prim3–12 一起浮到 y≈4.45）。"
        "⛔ 現在**不能**宣告：hiddenPrimitives.test.ts 的「宣告表不可以憑空多藏東西」只認"
        "`hiddenPrimitives.fixture.json` 裡 **≥100 頂點**的骨架根當理由，而 Object49ArchDruid"
        "只有 44 頂點 ⇒ 填進去那一條會紅。那兩個檔在本 lane 的柵欄外。"
        "⭐ 反駁方式：主 session 把 airborne findings 也算進那份 justified 集合，"
        "然後把 9（與同組的 13）移出這張表、填進 _overlay-hidden-geometry.json。"
    ),
    ("E00S.glb", 3): (
        "白木老樹精(godie-e00s) —— 25 頂點，在遊戲會播的**每一個**動作裡都被 key 在 "
        "y=26.55（身體頂端 7.14 的 3.7 倍），只有 WC3 的閒置動作 `Stand 4` 會把它從 11.13 "
        "飛上去，而 GGD 的 clipMap idle 指的是 `Stand`，⛔ 從來不播 `Stand 4`。"
        "⛔ 這是**另一位英雄**身上的同型缺陷，⛔ 不是本票（godie-efur）的範圍 —— "
        "第零守則⑧：順手發現的缺陷開票給 owner 排，⛔ 不當場修。"
        "⭐ 反駁方式：owner 說要一起修 ⇒ 移出這張表、填進 _overlay-hidden-geometry.json。"
        "⚠️ 而且它的信心比阿福低：阿福有 64–100% 的頂點座標與本體重合可以證明是複本，"
        "這兩顆球沒有 —— 先確認它們不是某個技能要用的投擲物再藏。"
    ),
    ("E00S.glb", 4): (
        "同上（Sphere02，25 頂點，同樣停在 y≈26.55）。與 prim3 是同一組，同一張票一起處理。"
    ),
}

#: overlay 樹是 gitignore 的 ⇒ CI 上唯一的依據是 commit 進來的指紋。
#: ⛔ 刻意跟 `hiddenPrimitives.geometry.fixture.json` 分開兩個檔：那一份記的是
#: 「bind pose 的殘留幾何」，這一份記的是「動畫中的離地分身」，兩支判準各自演進。
FLY_FIXTURE = os.path.join(HERE, "airborne.fixture.json")

#: 單圖元模型是**結構性**豁免，⛔ 不是逐筆豁免：藏掉唯一一塊 = 整隻英雄消失，
#: 所以 `hiddenPrimitives` 對它們無能為力。真的有屍體時修法是**重新轉檔**
#: （把血泥切成自己的 geoset），⛔ 不是在這裡填一個索引。
#: `census_one` 對它們回 `singlePrimitive` 且不產生 findings。


def check() -> int:
    """反向閘：**帶殘留幾何卻沒宣告**的就紅。⛔ 不是只驗「有填的是對的」。

    ⭐ 這一支是 GH#540 真正的產出。在它之前，`hiddenPrimitives.test.ts` 只問
    「宣告的索引對不對」 —— 那對「還有 N 份沒填」結構上永遠是綠的，於是這件事
    變成一張「等人想起來」的清單，而它等了 20 天。

    ⚠️ 一次撈**全部**問題再回報（CLAUDE.md：⛔ 不要「跑一次→修一個→再跑一次」）。
    """
    problems: list[str] = []
    rows = scan()
    by_file = {os.path.basename(r["glbPath"]): r for r in rows}
    declared_total = 0

    for r in rows:
        for f in r.get("findings", []):
            if f["primitive"] in r["declared"]:
                declared_total += 1
                continue
            key = (os.path.basename(r["glbPath"]), f["primitive"])
            if key in EXEMPT:
                continue
            problems.append(
                f"⛔ {r['glbPath']} prim{f['primitive']} ({f['vertices']}v, "
                f"{f['confidence']}, {','.join(f['signals'])}) 帶殘留幾何卻沒有宣告"
                f" —— 文件 {','.join(r['docs'])}")

    # overlay 樹是 gitignore 的：CI 上唯一的依據是 commit 進來的指紋。
    fx_path = os.path.join(REPO, "apps", "client", "src", "render", "views",
                           "hiddenPrimitives.geometry.fixture.json")
    fixture = json.load(open(fx_path, encoding="utf-8")) if os.path.isfile(fx_path) else None
    if fixture is None:
        problems.append(f"⛔ 指紋不存在：{fx_path} —— 跑 --fixture 產生它")
    else:
        decl = (json.load(open(OVERLAY_DECL, encoding="utf-8")).get("models", {})
                if os.path.isfile(OVERLAY_DECL) else {})
        for name, m in fixture["models"].items():
            glb = OVERLAY_GLB_PREFIX + name
            declared = decl.get(glb, {}).get("hiddenPrimitives", [])
            for f in m.get("findings", []):
                if f["primitive"] in declared or (name, f["primitive"]) in EXEMPT:
                    if f["primitive"] in declared:
                        declared_total += 1
                    continue
                problems.append(
                    f"⛔ [指紋] {glb} prim{f['primitive']} ({f['confidence']}, "
                    f"{','.join(f['signals'])}) 沒有出現在 _overlay-hidden-geometry.json")
            live = by_file.get(name)
            if live is not None:
                a = sorted(x["primitive"] for x in m.get("findings", []))
                b = sorted(x["primitive"] for x in live.get("findings", []))
                if a != b:
                    problems.append(
                        f"⛔ [指紋過期] {name}: 指紋 {a} ≠ 現場 {b} —— "
                        f"跑 `python3 tools/model-census/gore_geoset.py --fixture {fx_path}`")

    # ── 分身飛上天（GH#540）——————————————————————————————————————
    # ⚠️ 跟上面分開算：上面量 bind pose 的 bbox，這裡量**動畫中的 Y**。
    flying_total = 0
    for r in rows:
        for f in r.get("airborne", []):
            if f["primitive"] in r["declared"]:
                flying_total += 1
                continue
            if (os.path.basename(r["glbPath"]), f["primitive"]) in FLY_EXEMPT:
                continue
            problems.append(
                f"⛔ {r['glbPath']} prim{f['primitive']} ({f['vertices']}v) 在「{f['clip']}」"
                f"整塊浮在身體上方 {f['clearance']} 個身高，而且掛在另一具會動的骨架上"
                f" —— 沒有宣告（文件 {','.join(r['docs'])}）")

    fly_fx = json.load(open(FLY_FIXTURE, encoding="utf-8")) if os.path.isfile(FLY_FIXTURE) else None
    if fly_fx is None:
        problems.append(f"⛔ 分身指紋不存在：{FLY_FIXTURE} —— 跑 --fixture 產生它")
    else:
        decl = (json.load(open(OVERLAY_DECL, encoding="utf-8")).get("models", {})
                if os.path.isfile(OVERLAY_DECL) else {})
        for name, m in fly_fx["models"].items():
            glb = OVERLAY_GLB_PREFIX + name
            declared = decl.get(glb, {}).get("hiddenPrimitives", [])
            for f in m.get("airborne", []):
                if f["primitive"] in declared:
                    flying_total += 1
                elif (name, f["primitive"]) not in FLY_EXEMPT:
                    problems.append(
                        f"⛔ [指紋] {glb} prim{f['primitive']} 在「{f['clip']}」浮在身體上方"
                        f" {f['clearance']} 個身高 —— 沒有出現在 _overlay-hidden-geometry.json")
            live = by_file.get(name)
            if live is not None:
                a = sorted(x["primitive"] for x in m.get("airborne", []))
                b = sorted(x["primitive"] for x in live.get("airborne", []))
                if a != b:
                    problems.append(
                        f"⛔ [分身指紋過期] {name}: 指紋 {a} ≠ 現場 {b} —— "
                        f"跑 `python3 tools/model-census/gore_geoset.py --fixture {fx_path}`")

    # 前提：這條閘必須真的有東西可守。整棵樹哪天被修好/換掉，這裡先紅，
    # ⛔ 而不是讓它靜悄悄變成「什麼都沒驗」（失敗形態 ③）。
    if declared_total == 0:
        problems.append("⛔ 一處已宣告的殘留幾何都找不到 —— 這條閘變成 no-op 了")
    if flying_total == 0:
        problems.append("⛔ 一處已宣告的離地分身都找不到 —— 分身那條閘變成 no-op 了")

    for p in problems:
        print(p, file=sys.stderr)
    print(f"check: {len(rows)} 顆 .glb、{declared_total} 處已宣告、"
          f"{flying_total} 處已宣告的離地分身、{len(problems)} 個問題")
    return 1 if problems else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--check", action="store_true",
                    help="反向閘：帶殘留幾何卻沒宣告的就非零離開")
    ap.add_argument("--fixture", help="寫 overlay 樹的指紋（gitignore 的樹，CI 上唯一的依據）")
    args = ap.parse_args()
    if args.check:
        return check()
    rows = scan()

    if args.json:
        json.dump(rows, sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
        print()
    else:
        hit = [r for r in rows if r.get("findings")]
        print(f"掃了 {len(rows)} 顆 champion 會掛的 .glb，{len(hit)} 顆有殘留幾何")
        for r in sorted(hit, key=lambda r: r["glbPath"]):
            for f in r["findings"]:
                mark = "✅已宣告" if f["primitive"] in r["declared"] else "⛔未宣告"
                print(f"  {mark}  {r['glbPath']:52s} prim{f['primitive']:<2d} "
                      f"{f['vertices']:4d}v  {f['confidence']:9s} {','.join(f['signals'])}")
        undeclared = [(r, f) for r in hit for f in r["findings"] if f["primitive"] not in r["declared"]]
        print(f"\n未宣告 {len(undeclared)} 處"
              f"（confirmed {sum(1 for _, f in undeclared if f['confidence'] == 'confirmed')}）")
        single = [r for r in rows if r.get("singlePrimitive")]
        print(f"單圖元模型 {len(single)} 顆 —— hiddenPrimitives 對它們無能為力")
        fly = [r for r in rows if r.get("airborne")]
        print(f"\n離地分身（GH#540）：{len(fly)} 顆")
        for r in sorted(fly, key=lambda r: r["glbPath"]):
            for f in r["airborne"]:
                mark = "✅已宣告" if f["primitive"] in r["declared"] else "⛔未宣告"
                print(f"  {mark}  {r['glbPath']:52s} prim{f['primitive']:<2d} "
                      f"{f['vertices']:4d}v  浮 {f['clearance']:>4} 個身高（{f['clip']}）")

    if args.fixture:
        overlay = [r for r in rows if r["tree"] == "overlay"]
        if not overlay:
            print("\n✖ overlay 樹不在本機 —— ⛔ 拒絕寫出空指紋", file=sys.stderr)
            return 1
        payload = {
            "note": "generated by tools/model-census/gore_geoset.py — ⛔ do not hand-edit",
            "source": "data/blizzard-overlay/models (gitignored; task #10/#177)",
            "thresholds": {
                "goreJointMarker": GORE_JOINT_MARKER, "goreWeightShare": GORE_WEIGHT_SHARE,
                "slabThicknessOfHeight": SLAB_THICKNESS_OF_HEIGHT,
                "slabTopOfHeight": SLAB_TOP_OF_HEIGHT,
                "slabFootprintRatio": SLAB_FOOTPRINT_RATIO,
                "detachGapOfHeight": DETACH_GAP_OF_HEIGHT, "minVertices": MIN_VERTICES,
            },
            "models": {os.path.basename(r["glbPath"]): {
                "findings": r.get("findings", []),
                "primitiveCount": r.get("primitiveCount", 0),
            } for r in overlay},
        }
        with open(args.fixture, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2, sort_keys=True)
            fh.write("\n")
        print(f"\n指紋 → {args.fixture}（{len(overlay)} 顆）")
        fly_payload = {
            "note": "generated by tools/model-census/gore_geoset.py — ⛔ do not hand-edit",
            "source": "data/blizzard-overlay/models (gitignored; task #10/#177)",
            "thresholds": {"clearanceOfHeight": FLY_CLEARANCE_OF_HEIGHT,
                           "minVertices": FLY_MIN_VERTICES,
                           "samplesPerClip": FLY_SAMPLES_PER_CLIP,
                           "skipClipRoles": list(FLY_SKIP_CLIP_ROLES)},
            # ⭐ 每一顆都寫（含空的）—— 漂移檢查只走指紋的 key，漏掉一顆
            # 就等於那一顆「長出新的分身」時沒有人會紅。
            "models": {os.path.basename(r["glbPath"]): {"airborne": r.get("airborne", [])}
                       for r in overlay},
        }
        with open(FLY_FIXTURE, "w", encoding="utf-8") as fh:
            json.dump(fly_payload, fh, ensure_ascii=False, indent=2, sort_keys=True)
            fh.write("\n")
        print(f"分身指紋 → {FLY_FIXTURE}（{len(fly_payload['models'])} 顆）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
