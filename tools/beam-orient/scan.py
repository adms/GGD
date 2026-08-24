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

── ⛔ 三條**拒絕提案**的規則（都是量出來的，不是保守） ─────────────────────────
① **會走路的模型不可以被放倒。** glb 裡有 `walk`/`run` 動畫 ⇒ 它是站著的東西。
   實測：`imported.herocloudstrife`（克勞德幻影）、`imported.azunyan`、`imported.ritsu`
   這一族長軸全是 Y 且都被當成「移動的模型 dummy」用過 —— 把它們的長軸對齊行進方向
   就是**把一個角色摔在地上**，⛔ 不是做出一道光束。
② **`z` 不寫進文件。** Babylon 的前方就是 +Z ⇒ `"z"` 是恆等變換，寫了是一句
   「說了但不會發生」的宣稱（第一·五守則）。ABSENT 已經是它的意思。
③ ⭐ **旋轉對稱的網格沒有長軸**（`imported.frostnova`：一個 14 邊形圓環，
   ±9.36 × 0 × ±9.60，完全置中）。bbox 會硬選一軸（z，只贏 2.6%），⛔ 但那不是
   「長軸」而是取樣雜訊 —— 一個圓盤怎麼繞 Y 轉都一樣。⇒ 不提案，也**不算缺口**。

── ⭐ 為什麼 bbox 之外還要量「偏心」（2026-08-23 加的第二個訊號）──────────────
`imported.darkraor`（38-03 邪王炎殺黑龍波的龍頭）三邊是 2.532 × 2.496 × 2.167：
**最長只贏第二長 1.4%**，拿 bbox 排名去挑等於擲硬幣，而規則是「⛔ 不要猜一個軸」。
⇒ 再問一句「網格往哪一邊**長出去**」：一具沿自己某軸建的飛行物，幾何會**偏**在
那一軸的正端（頭在前面），⛔ 不會置中。實測（兩支已裁決的正好對上）：

    netherstrike  offsetFrac y=0.844  ← 宣告 y ✅      fireblast  x=0.649 ← 宣告 x ✅
    darkraor      offsetFrac x=0.567（y 0.285 · z 0.038）⇒ x，⛔ 不是擲硬幣
    frostnova     offsetFrac 全 0.000 ⇒ 旋轉對稱，沒有長軸（規則③）

⚠️ 兩個訊號**打架**時（bbox 說 A、偏心說 B，而且 bbox 是平手）⇒ ⛔ 不提案，
`--check` 紅並要求人去看。`imported.tectonicfury` 就是這一種（bbox z、偏心 x）。

用法
    python3 tools/beam-orient/scan.py                # 印普查表
    python3 tools/beam-orient/scan.py --json         # 重寫 census.json
    python3 tools/beam-orient/scan.py --write        # 把提案寫進 content/models/*.json
    python3 tools/beam-orient/scan.py --check        # 兩個方向的閘（非零離開）

⚠️ `--write` 預設**只動被「會動的」`spawnModelFx` 節點引用的模型** ——
`path:"orbit"` 的節點 sim 送的是 `dx=dz=0`（客戶端用它分辨動／不動），所以替它們
宣告長軸是一句「說了但不會發生」。`--all` 才會寫進每一個提案。

── ⭐ `--check` 有**兩個方向**（第二個是 2026-08-23 補的）────────────────────
① 宣告了的對不對（出貨文件 vs 現場重解）
② ⭐ **在用的有沒有宣告** —— 「有在用 · 會動 · 而沒有結論」逐支指名。
   ⚠️ 在此之前只有方向①，所以它**結構上叫不出**「這一支從來沒被提案過」：
   `--write` 的名單來自 `usedBy`，而 `usedBy` 只認**字面** `modelKey` ⇒ 走 `preset`
   的節點對它完全隱形 ⇒ owner 點名的四支經典從來沒進過提案名單，而閘是綠的。
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

#: 幾何中心離原點多遠（佔那一軸半邊長的比例）才算「這一軸上明顯偏心」。
#: ⭐ 這是 bbox 排名平手時的第二個訊號 —— 見檔頭。實測門檻兩側差很遠
#: （darkraor x=0.567 / y=0.285，netherstrike y=0.844 / z=0.014），⛔ 不是踩線調出來的。
OFF_CENTER_MIN = 0.25
#: 低於這個值算「置中」。圓盤／圓環／球那一族**三軸全是 0.000**。
CENTERED_MAX = 0.05

#: `path:"orbit"` 的實例 sim 送 `dx=dz=0`（`sim/effects/spawnModelFx.ts` 的
#: 「⚠️ `dx=dz=0` = sim 說這一具**不動**」）⇒ 長軸修正對它逐位元沒有效果。
STATIONARY_PATHS = {"orbit"}

#: ⛔ 豁免表：**有在用、會動、而永遠不會有長軸**的模型。
#: ⚠️ 每一列都要帶一個**能被反駁**的理由，而且 `expect` 會被逐次重解 ——
#: 那份 .glb 哪天被重匯出成別的樣子，這一列自己就過期並紅（⛔ 不是靜靜地繼續豁免）。
EXEMPT: dict[str, dict[str, str]] = {
    "imported.blackhole": {
        # ⭐ 2026-08-24（GH#649）**重新裁決**。上一版的理由是「meshes 是空陣列」,
        #    而 `a9cf7187` 把 28 份零像素模型重轉之後那句話過期了 ——
        #    ⭐ 而**這條閘自己抓到它**（`expect` 逐次重解）,⛔ 沒有靜靜地繼續豁免。
        #    ⇒ 這正是「豁免要帶一個會過期的理由」為什麼值得寫。
        "expect": "有幾何",
        "why": (
            "重轉之後它有幾何了（5 個 primitive · 2 段動畫）,⛔ 但仍然**沒有長軸**："
            "量到 bbox **8.333 × 8.333 × 8.333**（ratio 1.0，逐位元正立方）。"
            "⚠️ 掃描器會回報 `conflict`，因為偏心指向 y（offsetFrac=[0.004, 0.875, 0.001]）"
            "—— ⭐ 但那個 y 偏心是**高度**（黑洞漂在地面之上，emitter 都掛在原點上方），"
            "⛔ 不是一條可以拿去對齊行進方向的長軸。把它放倒 90° 只會讓黑洞躺在地上。"
            "⇒ 四個用它的節點（38-002 / 38-03 的 forward 與 radial 各兩支）要的是"
            "**球對稱**的演出，宣告任何一軸都是一句「說了但不會發生」（第一·五守則）。"
            "⚠️ 它現在畫得出東西了，⛔ 但那是 `bake_emitter_quads()` 的粗糙替身，"
            "⛔ 不是粒子系統 —— 38-03 龍身的真正粒子重製仍未做。"
        ),
    },
    "w3x.stock.flamestrike1": {
        # ⭐ 2026-08-25（GH#688 Phase 5 pilot）。y 確實是最長軸（extents
        #    [17.23, 19.65, 17.23]，offsetFrac y=0.844），⛔ 但那個 y 是**高度**：
        #    它是原作 h006「火柱」（FlameStrike1.mdl）—— 一根**站在地上**的火焰柱，
        #    09-04 的兩個節點都是 `path:"static"` 沿線**定點**擺六根（i×200 的
        #    JASS 迴圈），⛔ 沒有行進方向可以對齊。宣告 `y` 會把柱子放倒 ——
        #    一排躺在地上的營火，⛔ 不是龜派氣功的沿線火柱（第一·五守則：
        #    宣告了但演出變錯，比不宣告更糟）。
        # ⭐ 可反駁：哪天有「會位移」的節點引用它（forward/toTarget），火柱橫著飛
        #    確實需要重新裁決 —— 到時候這一列的理由就不成立，改宣告或換模型。
        "expect": "有幾何",
        "why": "原作 h006 火柱：垂直站地的定點模型，y 長軸是高度不是行進軸；static 沿線節點不位移，放倒它只會得到一排躺平的營火。",
    },
}

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


def ability_template_slots() -> dict[str, dict[str, str]]:
    """
    `template@1` id → 它替 `spawnModelFx` 補的那兩格（`params[k].default`）。

    ⭐ 為什麼一定要展開 `preset`：`content/modelFxPreset.ts` 在**載入時**把
    `params[*].default` 逐格補進節點（節點自己寫下的值永遠贏）。所以一個只寫
    `{"kind":"spawnModelFx","preset":"tpl-beam-roll"}` 的節點，跑起來用的是
    `imported.netherstrike` —— 而只認字面 `modelKey` 的掃描器**看不到它**。
    ⚠️ 2026-08-23 量到的代價：owner 點名的四支經典（59-04 陽電子砲 · 20-03
    約束與勝利之劍 · 08-03 龍鬥氣砲咒文 · 09-04 龜派氣功）全部走 preset，於是
    普查表上沒有「★使用中」⇒ `--write` 從來不會替它們提案，而 `--check` 是綠的。
    """
    slots: dict[str, dict[str, str]] = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "content", "ability-templates", "*.json"))):
        if os.path.basename(path).startswith("_"):
            continue
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
        params = doc.get("params") or {}
        row: dict[str, str] = {}
        for key in ("modelKey", "path"):
            slot = params.get(key)
            if isinstance(slot, dict) and isinstance(slot.get("default"), str):
                row[key] = slot["default"]
        if row:
            slots[doc["id"]] = row
    return slots


def spawn_model_fx_uses() -> dict[str, list[dict]]:
    """
    modelKey → 每一個引用它的 `spawnModelFx` 節點（**已經展開 preset**）。

    每一筆：`{"ability", "path", "via"}`。`via` 是 `"literal"` 或 `"preset:<id>"`。
    """
    slots = ability_template_slots()
    used: dict[str, list[dict]] = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "content", "abilities", "*.json"))):
        if os.path.basename(path).startswith("_"):
            continue
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
        aid = os.path.basename(path)[:-5]

        def walk(node):
            if isinstance(node, dict):
                if node.get("kind") == "spawnModelFx":
                    preset = node.get("preset") if isinstance(node.get("preset"), str) else None
                    filled = slots.get(preset) or {} if preset else {}
                    key = node.get("modelKey")
                    via = "literal"
                    if not isinstance(key, str):
                        key, via = filled.get("modelKey"), f"preset:{preset}"
                    hop = node.get("path")
                    if not isinstance(hop, str):
                        hop = filled.get("path")
                    if isinstance(key, str):
                        # ⛔ 解不出 path 時**當成會動的** —— fail-loud 那一邊
                        # （沉默地當成 orbit 正是這一次的缺陷形狀）。
                        used.setdefault(key, []).append(
                            {"ability": aid, "path": hop or "?", "via": via}
                        )
                for value in node.values():
                    walk(value)
            elif isinstance(node, list):
                for value in node:
                    walk(value)

        walk(doc)
    return used


def survey() -> list[dict]:
    bodies, used = champion_body_keys(), spawn_model_fx_uses()
    rows: list[dict] = []
    for path in sorted(glob.glob(os.path.join(MODELS, "*.json"))):
        if os.path.basename(path).startswith("_"):
            continue
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
        mid = doc["id"]
        glb = os.path.join(ROOT, "content", doc["glbPath"])
        uses = used.get(mid, [])
        moving = [u for u in uses if u["path"] not in STATIONARY_PATHS]
        row: dict = {
            "id": mid,
            "glbPath": doc["glbPath"],
            "declared": doc.get("fxLongAxis"),
            # ⚠️ `usedBy` 保留成一串技能 id（census 的既有形狀）；
            # 真正說話的是 `uses`（帶 path/via）與 `movingUses`。
            "usedBy": sorted({u["ability"] for u in uses}),
            "uses": uses,
            "movingUses": [f"{u['ability']}[{u['path']}·{u['via']}]" for u in moving],
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
        # ⭐ 第二個訊號:幾何往哪一邊長出去(佔半邊長的比例)。見檔頭。
        frac = [
            round(abs((hi[k] + lo[k]) / 2) / (ext[k] / 2), 3) if ext[k] > 1e-9 else 0.0
            for k in range(3)
        ]
        lead = max(range(3), key=lambda k: frac[k])
        row["extents"] = ext
        row["ratio"] = round(ext[order[0]] / ext[order[1]], 3) if ext[order[1]] > 1e-9 else None
        row["longAxis"] = "xyz"[order[0]]
        row["ambiguous"] = row["ratio"] is not None and row["ratio"] < AMBIGUOUS_RATIO
        row["offsetFrac"] = frac
        row["offsetAxis"] = "xyz"[lead] if frac[lead] >= OFF_CENTER_MIN else None
        # ⭐ 規則③:排名平手 **而且**網格完全置中 ⇒ 旋轉對稱(圓盤/圓環/球),
        # 沒有一條長軸可以對齊 —— bbox 硬選的那一軸是取樣雜訊,⛔ 不是答案。
        row["noLongAxis"] = bool(row["ambiguous"]) and max(frac) < CENTERED_MAX
        # ⚠️ 兩個訊號打架(bbox 平手 + 偏心指向別的軸) ⇒ ⛔ 不猜。
        row["conflict"] = bool(
            row["ambiguous"] and row["offsetAxis"] and row["offsetAxis"] != row["longAxis"]
        )
        if glb_walks(glb):
            row["skip"] = "walks"         # ⛔ 會走路的東西不可以被放倒
            continue
        if row["noLongAxis"] or row["conflict"]:
            continue
        row["proposed"] = row["longAxis"]
    return rows


def unresolved(row: dict) -> str | None:
    """
    ⭐ `--check` 方向②：這一份模型**有在用、會動**，而它有沒有一個結論？

    回傳 `None` ＝ 有結論（宣告了／規則拒絕／旋轉對稱／本來就對齊 +Z），
    回傳一句話 ＝ ⛔ 沒有結論，要紅。
    """
    if row["declared"]:
        return None                                   # 方向①去驗它對不對
    if row["skip"] in ("walks", "body"):
        return None                                   # 規則①：⛔ 不可以被放倒
    if row["id"] in EXEMPT:
        return None                                   # 豁免（新鮮度由 cmd_check 驗）
    if row["skip"]:
        return f"這一份被判為 `{row['skip']}` 而**不在豁免表**上 ⇒ 要嘛修模型、要嘛寫下為什麼它不該有長軸"
    if row["noLongAxis"]:
        return None                                   # 規則③：旋轉對稱，沒有長軸
    if row["conflict"]:
        return (
            f"量不出來：bbox 排名說 {row['longAxis']}（只贏 {row['ratio']}×）而偏心說 "
            f"{row['offsetAxis']}（offsetFrac={row['offsetFrac']}）⇒ ⛔ 不要猜，人去看一次"
        )
    if row["longAxis"] == "z":
        return None                                   # 規則②：+Z 就是行進軸，恆等
    return (
        f"沒有宣告 `fxLongAxis`，而 .glb 現場重解是 {row['longAxis']} "
        f"(extents={row['extents']}, offsetFrac={row['offsetFrac']}) ⇒ 長軸**恆**垂直於"
        f"行進方向（偏航轉不動它）。跑 `--write`"
    )


# ── 三種模式 ───────────────────────────────────────────────────────────────────
def cmd_print(rows: list[dict]) -> int:
    print(f"{'model':38s} {'axis':4s} {'ratio':>6s}  {'extents':26s} {'狀態'}")
    for row in sorted(rows, key=lambda r: (r["skip"] is not None, -(r.get("ratio") or 0))):
        ext = row.get("extents")
        ext_s = "(%7.2f,%7.2f,%7.2f)" % tuple(ext) if ext else ""
        note = row["skip"] or ""
        if row["movingUses"]:
            note = (note + " ★ 會動: " + ", ".join(row["movingUses"])).strip()
        elif row["usedBy"]:
            note = (note + " · 定點(orbit): " + ", ".join(row["usedBy"])).strip()
        if row.get("noLongAxis"):
            note = ("⭕ 旋轉對稱,沒有長軸 " + note).strip()
        elif row.get("conflict"):
            note = (f"⚠️ 兩個訊號打架(bbox {row['longAxis']} / 偏心 {row['offsetAxis']}) " + note).strip()
        elif row.get("ambiguous") and not row["skip"]:
            note = ("⚠️ 長軸接近平手 " + note).strip()
        print(
            f"{row['id']:38s} {str(row.get('longAxis') or '-'):4s} "
            f"{(row.get('ratio') or 0):6.2f}  {ext_s:26s} {note}"
        )
    props = [r for r in rows if r["proposed"] and r["proposed"] != "z"]
    moving = [r for r in rows if r["movingUses"]]
    print(f"\n提案 {len(props)} / 量到 {len([r for r in rows if r.get('extents')])} / 總數 {len(rows)}")
    print(
        f"會動的節點用到 {len(moving)} 份模型: "
        + ", ".join(f"{r['id']}→{r['declared'] or r['proposed'] or '—'}" for r in moving)
    )
    return 0


def cmd_json(rows: list[dict]) -> int:
    with open(CENSUS, "w", encoding="utf-8") as fh:
        json.dump(
            {
                "ambiguousRatio": AMBIGUOUS_RATIO,
                "offCenterMin": OFF_CENTER_MIN,
                "centeredMax": CENTERED_MAX,
                "stationaryPaths": sorted(STATIONARY_PATHS),
                "exempt": EXEMPT,
                "rows": rows,
            },
            fh,
            ensure_ascii=False,
            indent=1,
        )
        fh.write("\n")
    print(f"wrote {CENSUS}")
    return 0


def cmd_write(rows: list[dict], every: bool) -> int:
    changed = 0
    for row in rows:
        want = row["proposed"]
        # ⛔ `z` 是恆等 ⇒ 不寫(第一·五守則);
        # ⛔ 沒有**會動的**節點在用的模型不寫(除非 --all)——`path:"orbit"` 的實例
        #    sim 送 dx=dz=0,替它宣告長軸是一句「說了但不會發生」。
        if not want or want == "z" or (not every and not row["movingUses"]):
            continue
        if row["declared"] == want:
            continue
        path = os.path.join(MODELS, f"{row['id']}.json")
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
        doc["fxLongAxis"] = want
        with open(path, encoding="utf-8") as fh:
            had_newline = fh.read().endswith("\n")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, ensure_ascii=False, indent=2)
            # ⛔ 不要順手改結尾換行 —— 這支工具只加一格,一個看不見的位元組差異
            # 會讓 diff 變成「整份重寫」而把那一格藏起來。
            if had_newline:
                fh.write("\n")
        print(f"{row['id']}: fxLongAxis = {want}")
        changed += 1
    print(f"changed {changed}")
    return 0


def cmd_check(rows: list[dict]) -> int:
    """
    兩個方向的閘。

    ① **宣告了的對不對** —— 出貨文件 vs .glb 現場重解。
    ② ⭐ **在用的有沒有宣告** —— 「有在用 · 會動 · 而沒有結論」逐支指名。
       ⚠️ 少了②的那一版**結構上叫不出** #607 的形狀：`--write` 的提案名單來自
       `usedBy`，而 `usedBy` 只認字面 `modelKey` ⇒ 走 `preset` 的節點隱形 ⇒
       四支經典從來沒被提案過，而①永遠是綠的（它只問「宣告的那兩份對不對」）。
    """
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

    # ── 方向② ─────────────────────────────────────────────────────────────────
    by_id = {r["id"]: r for r in rows}
    gaps = 0
    for row in rows:
        if not row["movingUses"]:
            continue
        why = unresolved(row)
        if why is None:
            continue
        gaps += 1
        bad.append(
            f"{row['id']}: {why}\n"
            f"        ⇒ {len(row['movingUses'])} 個會動的節點在用它："
            + "、".join(row["movingUses"])
        )

    # ⛔ 豁免的理由要保鮮:那份 .glb 重匯出成別的樣子 ⇒ 這一列自己過期並紅。
    for mid, ex in sorted(EXEMPT.items()):
        row = by_id.get(mid)
        if row is None:
            bad.append(f"{mid}: 豁免表上有它，但 content/models/ 裡沒有這份文件 ⇒ 刪掉那一列")
        # ⚠️ 兩邊用**同一套詞彙**比對:`skip` 沒判到任何理由時是 None,而訊息把它
        #    印成「有幾何」⇒ `expect` 也要收得下那個詞,不然一份「有幾何而仍然豁免」
        #    的模型會**永遠**紅(它的 expect 無論寫什麼都對不上 None)。2026-08-24
        #    的 blackhole 就是第一份走到這一格的:重轉之後它從 no-mesh 變成有幾何。
        elif (row["skip"] or "有幾何") != ex["expect"]:
            bad.append(
                f"{mid}: 豁免的理由過期了 —— 當初記的是 `{ex['expect']}`，現在重解是 "
                f"`{row['skip'] or '有幾何'}` ⇒ 重新裁決一次（理由：{ex['why']}）"
            )

    for line in bad:
        print("⛔ " + line, file=sys.stderr)
    declared_n = len([r for r in rows if r["declared"]])
    moving_n = len([r for r in rows if r["movingUses"]])
    print(
        f"beam-orient --check: ①{declared_n} 份宣告 · ②{moving_n} 份被會動的節點引用"
        f"（{gaps} 份沒有結論）· 共 {len(bad)} 條"
    )
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
