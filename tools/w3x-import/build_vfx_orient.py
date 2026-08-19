#!/usr/bin/env python3
"""GH#391 — 有方向的特效家族,**每一支技能的仰角由 w3x 自己推導出來**。

    python3 tools/w3x-import/build_vfx_orient.py --measure   # 量模型(要 MPQ)
    python3 tools/w3x-import/build_vfx_orient.py             # 產出 content
    python3 tools/w3x-import/build_vfx_orient.py --check     # 閘:比對,不寫

===========================================================================
① w3x 到底怎麼「自動對齊」的 —— 量出來的答案
===========================================================================
`Units\\AbilityMetaData.slk` 有 **748 個**技能欄位。逐欄搜
`angle|pitch|roll|yaw|rot|orient|facing|tilt|direction` —— **零個命中**。
WC3 的技能資料裡**根本沒有「角度」這個數字**。方位只從三個地方來:

  ① 特效**模型自己**(`acat/atat/asat/aeat/aaea/amat`,型別 `modelList`)
     · 粒子模型:PRE2 發射器往 **節點的區域 +Z** 噴,而作者**旋轉那個節點**。
       量到的例:`WarStompCaster` 唯一那顆發射器的靜止軸是 **(1,0,0)** ——
       完全水平,所以戰踏的塵浪是**貼地往外**掃的,不是往上噴。
     · 純網格模型:角度烘在**頂點**裡(`crescent.mdx` 87 個頂點,沒有任何發射器)。
  ② **附著點**(`acap/ata0..5/aspt`,型別 `stringList`)—— 掛哪根骨頭,跟著骨頭轉。
  ③ **施法動畫**(`aani` Animnames,型別 `stringList`)—— 骨頭在動,附著物跟著動。

⭐ 也就是說:**「角度」在 WC3 不是參數,是資產。**
GGD 把原作的斬擊模型換成了程序生成的 primitive,**烘在幾何裡的角度就整個丟掉了**,
只好用一個全域 `slashPitchDeg: 30` 去補 —— 41 支共用一個數字的根因就是這個。

===========================================================================
② 這支腳本做的事 —— 把①那個角度**量回來**
===========================================================================
GGD 的 `orient.pitchDeg` 語意(`apps/client/src/vfx/orient.ts`):發射器的**區域 +Y
是它的軸**,`pitchDeg: 90` = 軸朝上(恆等),`0` = 軸放平朝目標。
WC3 的 PRE2 發射器語意:粒子往**節點的 +Z**噴。**同一個量**,只差 Z-up / Y-up。
所以推導不是比喻,是換座標:

    pitchDeg = 仰角(靜止姿態下,發射軸與水平面的夾角)

兩種量法,依模型自己有什麼而定(⛔ 不是兩套規則挑一個,是同一個量的兩種可得證據):

  method `emitter` —— 模型有 PRE2:每顆發射器把它的節點旋轉沿**父鏈**乘回去,
      取 (0,0,1) 的像,仰角 = asin(|z|)。多顆時用**粒子質量**
      (emissionRate × lifespan)加權平均 —— 一顆每秒噴 200 顆的主流,
      不該被一顆每秒 2 顆的火花拉走。
  method `mesh` —— 模型只有網格:仰角 = atan2(σz, √((σx²+σy²)/2)),
      也就是「這團幾何往上長得多、往旁邊長得多」。⛔ 用**標準差**不是 bounding box:
      bbox 會被一根細長的塵柱整個帶走(`WarStompCaster` 的 bbox 說 38°,
      它的發射器說 0°),而 σ 是質量分佈。

===========================================================================
③ 一支技能取哪一份模型 —— 一條**規則**,⛔ 不是 41 個決定
===========================================================================
w3a 一支技能最多有 6 個藝術槽。GGD 的 slash 是**施法瞬間在施法者身上**播的,
所以槽位優先序照「離施法者多近」排:

    caster > special > effect > target > missile > area

第一個**載得到模型**的槽就是答案(`invisible` / lightning-id 不算模型)。
一支 GGD 技能對到多支 w3a 技能時(變身英雄共用一個 doc),照 `VFX_BINDINGS.json`
給的順序取第一個有結果的。

⛔ 這裡沒有「哪一支是橫砍哪一支是直劈」的表。有的話就是越線(第〇·五守則)。

===========================================================================
④ 量不到的怎麼辦 —— 退路也是規則
===========================================================================
量不到只有一種原因:**這支技能在原作裡沒有任何模型可量**(w3a 的藝術欄是空的,
或指到 `invisible` / Lightning.slk 的一列 —— 兩者都沒有幾何)。
那一批**不寫任何值**,於是它們落回家族預設 `slashPitchDeg`(全域退路仍在),
並且被列進 `unmeasured`,由 owner 決定要不要手填。
⛔ 不編一個數字塞進去 —— 編出來的數字和量出來的數字在 JSON 裡長得一模一樣。

===========================================================================
⑤ 為什麼分成兩段(`--measure` 與產出)
===========================================================================
`War3Patch.mpq` / `War3x.mpq` / `war3.mpq` 是 **`.gitignore` 掉的**(第 72 行),
所以「量模型」這一段**只有手邊有零售 MPQ 的機器跑得動**。閘不可以只在一台機器上響。
⇒ 量測結果寫成一份**進版控**的中繼檔 `out/vfx-orient/MODEL_ORIENT.json`,
產出與 `--check` **只讀它**,任何機器都跑得動、任何機器都會紅。
(這與 `VFX_BINDINGS.json` / `EMITTERS.json` 已經進版控是同一條規矩。)

⛔ **沒有 `generatedAt`**(GH#389):任何隨時鐘變動的欄位都會讓逐位元組比對永遠
不相等,於是 `--check` 只能被放寬成模糊比對 —— 而一條被放寬的閘等於沒有閘。
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

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

OUTDIR = os.path.join(HERE, "out", "vfx-orient")
MODEL_ORIENT = os.path.join(OUTDIR, "MODEL_ORIENT.json")
BINDINGS = os.path.join(HERE, "out", "vfx-bindings", "VFX_BINDINGS.json")
RAWDIR = os.path.join(HERE, "out", "GoDieEX22s", "raw")
FAMILIES_CFG = os.path.join(REPO, "content", "config", "vfx-families.json")
ABILITY_DIR = os.path.join(REPO, "content", "abilities")

# 這一批管哪個家族。`fx.prim.<element>.<primitive>[-變體]` 的 primitive 段。
FAMILY = "slash"
PRIM_RE = re.compile(r"^fx\.prim\.[a-z]+\.([a-z]+)")

# ③ 的槽位優先序。一條規則,⛔ 不是逐支的選擇。
SLOT_ORDER = ("caster", "special", "effect", "target", "missile", "area")

# 仰角量化格。15° 的瞄準格是**資源**參數(池 key);這個 5° 是**視覺**參數 ——
# 5° 以下的差別在一次 0.3 秒的爆發裡看不出來,而不量化會讓每一次重新量測都
# 在小數點後面抖動,`--check` 就變成噪音偵測器。
PITCH_STEP_DEG = 5


# ---------------------------------------------------------------------------
# --measure:讀模型,量仰角
# ---------------------------------------------------------------------------
def _mdx_sources():
    """(raw 檔名 → 路徑, 零售 MPQ 清單)。MPQ 缺席時回空 list,呼叫端自己報。"""
    from w3xlib.mpq import W3XArchive

    raw = {f.lower(): os.path.join(RAWDIR, f) for f in sorted(os.listdir(RAWDIR))}
    arcs = []
    for name in ("War3Patch.mpq", "War3x.mpq", "war3.mpq"):
        p = os.path.join(REPO, name)
        if os.path.exists(p):
            arcs.append((name, W3XArchive(p)))
    return raw, arcs


def _load_mdx(path: str, raw, arcs):
    """一個 w3a 藝術欄的值 → mdx 位元組 + 來源標籤。找不到回 (None, None)。"""
    stem = os.path.splitext(os.path.basename(path.replace("\\", "/")))[0].lower()
    if stem + ".mdx" in raw:
        with open(raw[stem + ".mdx"], "rb") as f:
            return f.read(), "map"
    q = os.path.splitext(path.replace("/", "\\"))[0] + ".mdx"
    for name, a in arcs:
        if a.has_file(q):
            return a.read_file(q), "stock:" + name
    return None, None


_NODE_TRACK_DIMS = {b"KGTR": 3, b"KGRT": 4, b"KGSC": 3}


def _node_rest_quat(data: bytes, pos: int):
    """節點標頭(pos)的 KGRT 第一個 key = 靜止姿態的四元數。沒有 track 就是單位。

    ⚠️ 節點標頭的 `inclusiveSize` **含** KG* 子塊,所以 pos+96 到 end 就是它們。
    """
    incl = struct.unpack_from("<I", data, pos)[0]
    end = pos + incl
    p = pos + 96
    while p + 4 <= end:
        tag = data[p : p + 4]
        dim = _NODE_TRACK_DIMS.get(tag)
        if dim is None:
            return None
        count, interp, _ = struct.unpack_from("<IiI", data, p + 4)
        body = p + 16
        if tag == b"KGRT" and count > 0:
            return struct.unpack_from("<4f", data, body + 4)
        p = body + count * (4 + 4 * dim + (8 * dim if interp > 1 else 0))
    return None


def _quat_to_mat(q):
    x, y, z, w = q
    return (
        (1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)),
        (2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)),
        (2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)),
    )


def _matmul(a, b):
    return tuple(tuple(sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)) for i in range(3))


def _collect_node_quats(data: bytes) -> dict[int, tuple]:
    """每個節點(BONE/HELP/PRE2)的靜止旋轉。⛔ 只走頂層 chunk,不猜位移。"""
    out: dict[int, tuple] = {}
    pos, n = 4, len(data)
    while pos + 8 <= n:
        tag = data[pos : pos + 4]
        size = struct.unpack_from("<I", data, pos + 4)[0]
        body, end = pos + 8, pos + 8 + size
        if tag in (b"BONE", b"HELP", b"PRE2"):
            p = body
            while p + 96 <= end:
                if tag == b"PRE2":
                    incl = struct.unpack_from("<I", data, p)[0]
                    head = p + 4  # PRE2 外層 inclusiveSize 之後才是節點標頭
                    oid = struct.unpack_from("<i", data, head + 84)[0]
                    q = _node_rest_quat(data, head)
                    if q:
                        out[oid] = q
                    p += incl
                else:
                    incl = struct.unpack_from("<I", data, p)[0]
                    oid = struct.unpack_from("<i", data, p + 84)[0]
                    q = _node_rest_quat(data, p)
                    if q:
                        out[oid] = q
                    p += incl + (8 if tag == b"BONE" else 0)
                if incl <= 0:
                    break
        pos = end
    return out


def _emitter_elevation(data: bytes):
    """PRE2 發射軸的仰角(粒子質量加權)。沒有發射器回 None。"""
    from w3xlib.particles import parse_particles

    pm = parse_particles(data)
    if not pm.emitters2:
        return None
    quats = _collect_node_quats(data)
    total = 0.0
    acc = 0.0
    per = []
    for em in sorted(pm.emitters2, key=lambda e: (e.name, e.object_id)):
        rot = ((1, 0, 0), (0, 1, 0), (0, 0, 1))
        cur, guard = em.object_id, 0
        while cur is not None and cur >= 0 and guard < 16:
            q = quats.get(cur)
            if q:
                rot = _matmul(_quat_to_mat(q), rot)
            nd = pm.nodes.get(cur)
            cur = nd.parent_id if nd else -1
            guard += 1
        az = rot[2][2]  # (0,0,1) 的像的 z 分量
        elev = math.degrees(math.asin(min(1.0, abs(az))))
        mass = max(0.0, em.emission_rate) * max(0.0, em.lifespan)
        if mass <= 0:
            mass = 1.0  # 一次性/track 驅動的發射器仍然算一份,⛔ 不是零票
        total += mass
        acc += mass * elev
        per.append({"name": em.name, "elevationDeg": round(elev, 1), "mass": round(mass, 2)})
    if total <= 0:
        return None
    return round(acc / total, 1), per


def _mesh_elevation(data: bytes):
    """網格質量分佈的仰角。沒有幾何回 None。"""
    from w3xlib.mdx import parse_mdx

    m = parse_mdx(data)
    xs, ys, zs = [], [], []
    for g in m.geosets:
        for v in g.vertices:
            xs.append(v[0])
            ys.append(v[1])
            zs.append(v[2])
    n = len(xs)
    if n < 3:
        return None

    def var(vals):
        mu = sum(vals) / n
        return sum((v - mu) ** 2 for v in vals) / n

    vx, vy, vz = var(xs), var(ys), var(zs)
    horiz = math.sqrt((vx + vy) / 2)
    vert = math.sqrt(vz)
    if horiz <= 0 and vert <= 0:
        return None
    return round(math.degrees(math.atan2(vert, horiz)), 1), {
        "vertices": n,
        "sigma": [round(math.sqrt(vx), 1), round(math.sqrt(vy), 1), round(vert, 1)],
    }


def measure() -> int:
    """量每一份「被 slash 技能引用到的」w3a 藝術模型,寫進版控的中繼檔。"""
    raw, arcs = _mdx_sources()
    if not arcs:
        print(
            "⛔ 找不到零售 MPQ(War3Patch.mpq / War3x.mpq / war3.mpq)。\n"
            "   --measure 只有手邊有 MPQ 的機器跑得動;產出與 --check 不需要它們。",
            file=sys.stderr,
        )
        return 2
    wanted = sorted(_art_paths_for_family())
    models: dict[str, dict] = {}
    for path in wanted:
        data, src = _load_mdx(path, raw, arcs)
        if data is None:
            models[path] = {"source": None, "method": None, "elevationDeg": None, "why": "no-file"}
            continue
        row: dict = {"source": src}
        try:
            emit = _emitter_elevation(data)
        except Exception as exc:  # 壞掉的模型不可以弄壞整批量測
            emit = None
            row["emitterParseError"] = type(exc).__name__
        if emit is not None:
            row.update(method="emitter", elevationDeg=emit[0], emitters=emit[1])
        else:
            try:
                mesh = _mesh_elevation(data)
            except Exception as exc:
                mesh = None
                row["meshParseError"] = type(exc).__name__
            if mesh is not None:
                row.update(method="mesh", elevationDeg=mesh[0], mesh=mesh[1])
            else:
                row.update(method=None, elevationDeg=None, why="no-emitter-no-geoset")
        models[path] = row
    doc = {
        "schema": "vfx-model-orient@1",
        "family": FAMILY,
        "how": "PRE2 發射軸(靜止姿態,父鏈相乘)的仰角;沒有發射器時用網格質量分佈 atan2(σz, √((σx²+σy²)/2))",
        "note": "⛔ 刻意沒有產生日期 —— 有的話 --check 就只能模糊比對(GH#389)",
        "models": models,
    }
    os.makedirs(OUTDIR, exist_ok=True)
    _write_json(MODEL_ORIENT, doc)
    ok = sum(1 for r in models.values() if r.get("elevationDeg") is not None)
    print(f"量到 {ok}/{len(models)} 份模型 → {os.path.relpath(MODEL_ORIENT, REPO)}")
    return 0


# ---------------------------------------------------------------------------
# 共用:誰是這個家族的技能、它們引用了哪些 w3a 藝術模型
# ---------------------------------------------------------------------------
def _family_ability_ids() -> list[str]:
    """出貨內容裡**真的**用這個 primitive 的技能 —— ⛔ 不是硬名單。"""
    ids = []
    for f in sorted(glob.glob(os.path.join(ABILITY_DIR, "*.json"))):
        if os.path.basename(f) == "_index.json":
            continue
        with open(f, encoding="utf-8") as fh:
            d = json.load(fh)
        keys = [d.get("vfxKey") or ""]
        keys += [l.get("vfxKey", "") for l in (d.get("vfxLayers") or [])]
        for k in keys:
            m = PRIM_RE.match(k)
            if m and m.group(1) == FAMILY:
                ids.append(d["id"])
                break
    return sorted(set(ids))


def _bindings():
    with open(BINDINGS, encoding="utf-8") as fh:
        return json.load(fh)


def _art_candidates(doc_id: str, B) -> list[tuple[str, str, str]]:
    """(w3aId, slot, modelPath) —— 照 ③ 的規則排好的候選,第一個載得到的贏。"""
    out = []
    for ent in B["ggdDocIndex"].get(doc_id) or []:
        ab = B["abilities"].get(ent["abilityId"]) or {}
        art = ab.get("art") or {}
        for slot in SLOT_ORDER:
            info = art.get(slot)
            if not info:
                continue
            for en in info.get("entries", []):
                if en.get("form") == "invisible":
                    continue
                p = en.get("path") or en.get("stem") or ""
                if p:
                    out.append((ent["abilityId"], slot, p))
    return out


def _art_paths_for_family() -> set[str]:
    B = _bindings()
    paths = set()
    for did in _family_ability_ids():
        for _, _, p in _art_candidates(did, B):
            paths.add(p)
    return paths


# ---------------------------------------------------------------------------
# 產出:把量到的仰角折成每一支技能的 pitchDeg
# ---------------------------------------------------------------------------
def derive() -> tuple[dict[str, dict], list[str]]:
    """→ ({abilityId: {pitchDeg, why...}}, 量不到的 id 清單)"""
    with open(MODEL_ORIENT, encoding="utf-8") as fh:
        measured = json.load(fh)["models"]
    B = _bindings()
    rows: dict[str, dict] = {}
    unmeasured: list[str] = []
    for did in _family_ability_ids():
        hit = None
        for w3a, slot, path in _art_candidates(did, B):
            row = measured.get(path)
            if row and row.get("elevationDeg") is not None:
                hit = (w3a, slot, path, row)
                break
        if not hit:
            unmeasured.append(did)
            continue
        w3a, slot, path, row = hit
        elev = max(0.0, min(90.0, float(row["elevationDeg"])))
        pitch = int(round(elev / PITCH_STEP_DEG) * PITCH_STEP_DEG)
        rows[did] = {
            "pitchDeg": pitch,
            "_w3a": w3a,
            "_slot": slot,
            "_model": os.path.basename(path.replace("\\", "/")),
            "_method": row.get("method"),
            "_elevationDeg": row["elevationDeg"],
        }
    return rows, unmeasured


def _write_json(path: str, doc) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2, sort_keys=False)
        fh.write("\n")


def _apply(cfg: dict, rows: dict[str, dict]) -> dict:
    """把推導出來的 pitchDeg 折進 config 的 abilities 表。

    ⚠️ **只動 `pitchDeg` 這一格**:同一列上的 family / tint / anchor 是別人推導的,
    這裡碰到就是把兩份推導攪在一起。反過來,這個家族**沒有**被推導出值的技能,
    它那一格要被**拿掉** —— 留著一個過期的手打值就是這條閘存在的理由。
    """
    out = json.loads(json.dumps(cfg))  # 深拷貝,⛔ 不原地改呼叫端的物件
    abilities = out.setdefault("abilities", {})
    owned = set(_family_ability_ids())
    for did in sorted(owned):
        row = abilities.get(did)
        want = rows.get(did)
        if want is None:
            if row and "pitchDeg" in row:
                del row["pitchDeg"]
                if not row:
                    del abilities[did]
            continue
        if row is None:
            row = abilities[did] = {}
        row["pitchDeg"] = want["pitchDeg"]
    out["abilities"] = {k: abilities[k] for k in sorted(abilities)}
    return out


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--measure", action="store_true", help="量模型(需要零售 MPQ)")
    ap.add_argument("--check", action="store_true", help="只比對,不寫。不一致回非零")
    ap.add_argument("--report", action="store_true", help="印逐支的推導表")
    args = ap.parse_args(argv)

    if args.measure:
        return measure()

    if not os.path.exists(MODEL_ORIENT):
        print(f"⛔ 缺 {os.path.relpath(MODEL_ORIENT, REPO)} —— 先跑 --measure", file=sys.stderr)
        return 2

    rows, unmeasured = derive()
    with open(FAMILIES_CFG, encoding="utf-8") as fh:
        cfg = json.load(fh)
    want = _apply(cfg, rows)

    if args.report:
        print(f"{'ability':22} {'w3a':6} {'slot':8} {'model':26} {'方法':8} 量到  →填")
        for did in sorted(rows):
            r = rows[did]
            print(
                f"{did:22} {r['_w3a']:6} {r['_slot']:8} {r['_model'][:26]:26} "
                f"{r['_method']:8} {r['_elevationDeg']:5}  {r['pitchDeg']:3}"
            )
        print(f"\n量不到({len(unmeasured)}):{', '.join(unmeasured) if unmeasured else '—'}")

    same = json.dumps(want, ensure_ascii=False, sort_keys=False) == json.dumps(
        cfg, ensure_ascii=False, sort_keys=False
    )
    if args.check:
        if same:
            print(f"✅ {len(rows)} 支的仰角與推導一致(量不到 {len(unmeasured)} 支)")
            return 0
        diff = [
            did
            for did in sorted(set(rows) | set(cfg.get("abilities") or {}))
            if (cfg.get("abilities", {}).get(did, {}).get("pitchDeg"))
            != (want.get("abilities", {}).get(did, {}).get("pitchDeg"))
        ]
        print(
            "⛔ content/config/vfx-families.json 的 pitchDeg 與 w3x 推導不一致。\n"
            f"   不一致的技能:{', '.join(diff[:12])}{' …' if len(diff) > 12 else ''}\n"
            "   ⛔ 不要改測試 —— 跑 `python3 tools/w3x-import/build_pitch.py` 然後 git add content/",
            file=sys.stderr,
        )
        return 1

    # ⛔ GH#456 —— 這支腳本**不再寫 content**（owner 2026-08-20 選 C）。
    # `pitchDeg` 的唯一寫入者是 `tools/w3x-import/build_pitch.py`,它 import 這裡的
    # 量測函式再與另一個資料源合併。⚠️ 把這一段拿掉 = 退回「兩支各寫各的、後跑的贏」,
    # 而那個狀態下**兩條守衛互為對方的紅燈**,誰贏取決於指令順序（沒有東西在守）。
    print(
        "⛔ 這支腳本只量測,不寫 content。\n"
        "   要更新 pitchDeg 請跑：python3 tools/w3x-import/build_pitch.py",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
