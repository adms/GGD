#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
五軸特效普查 —— 原作（w3x/JASS）↔ GGD（content/）逐軸對帳。

    python3 tools/vfx-census/scan.py                       # 寫預設輸出
    python3 tools/vfx-census/scan.py --out <md> --json <j>

⛔ 這**不是**新鮮度閘，⛔ 沒有 `--check`：它是一份會隨內容成長的普查，
   任何「逐位元組比對」都只會在下一支技能落地時紅一次然後被放寬。
⛔ 產物裡**不放時間戳**（時間戳只在檔名上），這樣兩次執行的 diff 才是「內容真的變了」。

五個軸（owner 2026-08-22 逐字點名的五類），每一軸回答同樣三個問題：
  ① 有幾個（原作 / GGD 匯入 / **真的接上技能**）
  ② 孤兒是哪些（匯入了沒人用）
  ③ 缺口是哪些（原作有而 GGD 沒有），按**擋住幾支技能**排序

⚠️ 「真的接上技能」的定義是**消費路徑**，⛔ 不是「字串出現在某個檔裡」：
   docs/ 底下的產生文件會提到每一個 id，把它算成消費會讓孤兒數永遠是 0
   （實測：不排除的話 640/640 全部「有人用」）。
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# ── 來源 ────────────────────────────────────────────────────────────────────
WAR3MAP_J = ROOT / "tools/w3x-import/out/GoDieEX22s-src/raw/war3map.j"
DUMMY_ORB = ROOT / "tools/w3x-import/out/GoDieEX22s-src/DUMMY_ORB_MAP.json"
CENSUS = ROOT / "tools/w3x-import/out/vfx-census/CENSUS.json"
MODEL_USAGE = ROOT / "tools/w3x-import/out/vfx-census/MODEL_USAGE.json"
EMITTERS = ROOT / "tools/w3x-import/out/emitters/EMITTERS.json"
SPHERES = ROOT / "tools/w3x-import/out/emitters/SPHERE_ATTACHMENTS.json"

CONTENT = ROOT / "content"
DEFAULT_MD = ROOT / "docs/技能特效重整_temp_20260822-2100.md"
DEFAULT_JSON = ROOT / "tools/vfx-census/CENSUS_5AXIS.json"

# 消費路徑（⛔ 不含 docs/、⛔ 不含 bundle.json/manifest.json/_index.json）
CONSUMER_COLLECTIONS = [
    "abilities", "champions", "projectiles", "items", "augments",
    "status-effects", "arenas", "maps", "skins", "models",
    "ability-templates", "loot-tables",
]
CODE_ROOTS = [
    "packages/shared/src", "apps/client/src", "apps/game-server/src", "apps/editor/src",
]
# ⚠️ ability-vfx-bindings.unmatched[] 是「**為什麼沒接**」的名單，⛔ 不是消費。
NON_CONSUMING_CONFIG_PATHS = {("ability-vfx-bindings", "unmatched")}


# ⭐ owner 2026-08-22 逐字點名的例子 → 內容 id 的**對照表**。
# ⚠️ 這裡只放 join key（哪一句話講的是哪一支技能），⛔ 不放任何「現況」——
#    現況一律在下面即時查，否則它就是第二個住處（第〇·四守則）。
OWNER_EXAMPLES = [
    {"said": "Saber 約束勝利之劍", "champion": "godie-e002", "ability": "godie-e002.e", "axis": "②⑤"},
    {"said": "小呆龍鬥氣砲", "champion": "godie-nbbc", "ability": "godie-nbbc.e", "axis": "②"},
    {"said": "初號機陽電子砲", "champion": "godie-e00r", "ability": "godie-e00r.r", "axis": "②"},
    {"said": "衝擊波特效橫放 beam", "champion": "godie-o00x", "ability": "godie-o00x.r", "axis": "②③"},
    {"said": "悟空超3 頭／手的衝擊波", "champion": "godie-o00x", "ability": None, "axis": "⑤"},
    {"said": "Saber 持有武器金粉閃爍粒子", "champion": "godie-e002", "ability": None, "axis": "⑤"},
    {"said": "揍敵客拖曳緞帶", "champion": "godie-efur", "ability": None, "axis": "④⑤"},
]
# ⭐ 出貨的兩具骨架替身（`main.tsx` 的 fail-open 用的那兩隻）＋ 通用皮膚。
#    英雄掛在這些上面 ⇒ 軸⑤的掛點永遠掛在**別人的骨架**上。
STANDIN_PREFIXES = ("champ.sela", "champ.thorne", "champ.skin.", "champ.blocky.", "champ.mob.")


def load(p: Path):
    with p.open(encoding="utf-8") as fh:
        return json.load(fh)


def maybe(p: Path):
    return load(p) if p.exists() else None


# ── GGD 內容側 ──────────────────────────────────────────────────────────────
def vfx_docs() -> dict[str, dict]:
    out = {}
    for p in sorted((CONTENT / "vfx").glob("*.json")):
        if p.name == "_index.json":
            continue
        d = load(p)
        out[d["id"]] = d
    return out


def id_family(vid: str) -> str:
    for pre in ("fx.w3x.locust.", "fx.w3x.particle.", "fx.w3x.ribbon.", "fx.w3x.orb.",
                "fx.w3x.", "fx.prim.", "fx.fam.", "attach.", "godie-"):
        if vid.startswith(pre):
            return pre + "*"
    return "fx.*（手寫）"


def scan_consumers(ids: set[str]) -> dict[str, set[str]]:
    """vfx id → {消費通道}。⭐ 只走真的會被載入器/引擎讀到的路徑。"""
    hits: dict[str, set[str]] = collections.defaultdict(set)

    def walk(node, channel: str, key: str | None, skip: frozenset[str]):
        if isinstance(node, dict):
            for k, v in node.items():
                if k in skip:
                    continue
                walk(v, channel, k, skip)
        elif isinstance(node, list):
            for x in node:
                walk(x, channel, key, skip)
        elif isinstance(node, str) and node in ids:
            hits[node].add(f"{channel}:{key}")

    for coll in CONSUMER_COLLECTIONS:
        for p in sorted((CONTENT / coll).glob("*.json")):
            if p.name == "_index.json":
                continue
            walk(load(p), coll, None, frozenset())
    fired = set()
    for p in sorted((CONTENT / "config").glob("*.json")):
        stem = p.stem
        skip = frozenset(k for s, k in NON_CONSUMING_CONFIG_PATHS if s == stem)
        if skip:
            fired.add(stem)
        walk(load(p), f"config/{stem}", None, skip)
    # ⭐ fail-LOUD：這條排除規則**靜默失效過一次**，而失效的樣子是「孤兒 0 份」——
    #    一份說「全部都接上了」的普查，看起來跟一份正確的普查一模一樣。
    #    ⛔ 所以它不可以只是一個字典查找，它要在對不上的時候**回非零**。
    expect = {s for s, _k in NON_CONSUMING_CONFIG_PATHS}
    if fired != expect:
        raise SystemExit(
            f"⛔ 非消費路徑排除規則沒有全部命中：預期 {sorted(expect)}、實際 {sorted(fired)}。"
            f"　`content/config/` 底下的檔名改過嗎？改了就要同步 NON_CONSUMING_CONFIG_PATHS，"
            f"⛔ 不要讓它靜默不生效（那會讓孤兒數變成 0）。")
    for root in CODE_ROOTS:
        base = ROOT / root
        if not base.exists():
            continue
        for dirpath, _dirnames, filenames in os.walk(base):
            for fn in filenames:
                if not fn.endswith((".ts", ".tsx")) or ".test." in fn:
                    continue
                fp = Path(dirpath) / fn
                txt = fp.read_text(encoding="utf-8", errors="replace")
                for vid in ids:
                    if f'"{vid}"' in txt or f"'{vid}'" in txt:
                        hits[vid].add("code")
    return hits


def ability_index():
    """技能 id → 文件；同時撈 effect kind 與 vfx 參照。"""
    docs, kinds, vfx_refs = {}, collections.Counter(), collections.defaultdict(set)
    kind_abilities: dict[str, set[str]] = collections.defaultdict(set)

    def walk(node, aid):
        if isinstance(node, dict):
            k = node.get("kind")
            if isinstance(k, str):
                kinds[k] += 1
                kind_abilities[k].add(aid)
            for key, v in node.items():
                if key in ("vfxKey", "vfxId", "stepVfx") and isinstance(v, str):
                    vfx_refs[aid].add(v)
                walk(v, aid)
        elif isinstance(node, list):
            for x in node:
                walk(x, aid)

    for p in sorted((CONTENT / "abilities").glob("*.json")):
        if p.name == "_index.json":
            continue
        d = load(p)
        docs[d["id"]] = d
        walk(d, d["id"])
    return docs, kinds, vfx_refs, kind_abilities


# ── 軸①：JASS 一次性特效呼叫 ────────────────────────────────────────────────
RE_LOC = re.compile(r'AddSpecialEffectLocBJ\s*\([^\n]*?"([^"]+\.(?:mdl|mdx|MDL|MDX))"')
RE_TGT = re.compile(
    r'AddSpecialEffectTargetUnitBJ\s*\(\s*"([^"]*)"[^\n]*?"([^"]+\.(?:mdl|mdx|MDL|MDX))"')


def axis_jass_effects(vfx: dict, consumed: dict) -> dict:
    txt = WAR3MAP_J.read_text(encoding="utf-8", errors="replace") if WAR3MAP_J.exists() else ""
    loc = RE_LOC.findall(txt)
    tgt = RE_TGT.findall(txt)
    calls = [(None, p) for p in loc] + [(a, p) for a, p in tgt]
    by_model = collections.Counter(p.lower() for _a, p in calls)
    attach = collections.Counter(a.strip().lower() for a, _p in tgt)
    attach_raw = collections.Counter(a for a, _p in tgt)

    def stem(path: str) -> str:
        return re.split(r"[\\/]", path)[-1].rsplit(".", 1)[0].lower()

    imported = {m for m in by_model if "\\" not in m}     # 地圖自帶（raw/ 裡有檔）
    stock = {m for m in by_model if "\\" in m}            # 暴雪內建（⛔ 不在 repo）

    # GGD 側：這個模型有沒有被抽成 vfx 文件（godie-<stem>-* 或 fx.w3x.*<stem>*）
    def ggd_docs_for(model: str) -> list[str]:
        s = stem(model).replace("_", "-")
        return sorted(v for v in vfx if s in v.lower().replace("_", "-"))

    rows = []
    for m, n in by_model.most_common():
        docs = ggd_docs_for(m)
        rows.append({
            "model": m, "stem": stem(m), "calls": n,
            "form": "map-imported" if m in imported else "blizzard-stock",
            "ggdDocs": docs,
            "ggdDocsConsumed": [d for d in docs if d in consumed],
        })
    return {
        "callSites": len(calls),
        "locCalls": len(loc), "targetCalls": len(tgt),
        "distinctModels": len(by_model),
        "importedModels": len(imported), "stockModels": len(stock),
        "attachPoints": attach.most_common(),
        "attachPointRawVariants": len(attach_raw),
        "attachPointTypos": sorted(a for a in attach_raw if a != a.strip().lower()
                                   or a in ("orgin",)),
        "rows": rows,
    }


# ── 軸②：3D model 單位型特效（蝗蟲群／beam／砲擊） ───────────────────────────
def axis_locust(dummy: dict, kinds: collections.Counter, kind_abilities: dict,
                vfx: dict, consumed: dict) -> dict:
    du = dummy["dummy_effect_units"]
    moving = [r for r in du if r.get("motion") == "moving"]
    by_status = collections.Counter(r["vfx_status"] for r in du)
    locust_docs = sorted(v for v in vfx if v.startswith("fx.w3x.locust."))
    # ⛔ 分母是**收斂後的特效數**，不是 28 —— 28 裡有同一招的多個實例。
    effects = len({(r.get("hero"), r.get("unit_name"), r.get("model_stem"),
                    r.get("trigger"), r.get("vfx_status")) for r in moving})
    hooked = len(kind_abilities.get("spawnModelFx", ()))
    return {
        "movingEffects": effects,
        "coveragePct": (min(hooked, effects) * 100 // effects) if effects else 0,
        "dummyUnits": len(du),
        "locustFlagged": sum(1 for r in du if r.get("locust")),
        "moving": len(moving),
        "stationary": len(du) - len(moving),
        "byVfxStatus": dict(by_status),
        # ⚠️ 同一個 (英雄, dummy, 模型, trigger) 在 JASS 裡會出現多次（每個方向／每一段一次）。
        #    ⛔ 逐行印出來會讓「28」看起來像 28 個不同的特效 —— 它們是 N 具同型實例。
        "movingRows": [{
            "hero": k[0], "unitName": k[1], "model": k[2], "trigger": k[3],
            "status": k[4], "instances": n,
            "placeholders": sorted({p.get("id") for r in moving
                                    for p in (r.get("placeholders") or [])
                                    if (r.get("hero"), r.get("unit_name"), r.get("model_stem"),
                                        r.get("trigger"), r.get("vfx_status")) == k}),
        } for k, n in collections.Counter(
            (r.get("hero"), r.get("unit_name"), r.get("model_stem"),
             r.get("trigger"), r.get("vfx_status")) for r in moving).most_common()],
        "movingByModel": collections.Counter(r["model_stem"] for r in moving).most_common(),
        "movingHeroes": sorted({r["hero"] for r in moving if r.get("hero")}),
        "ggdLocustDocs": locust_docs,
        "ggdLocustDocsConsumed": [d for d in locust_docs if d in consumed],
        "spawnModelFxUsages": kinds.get("spawnModelFx", 0),
        "spawnModelFxAbilities": sorted(kind_abilities.get("spawnModelFx", ())),
        "spawnVfxUsages": kinds.get("spawnVfx", 0),
        "spawnProjectileUsages": kinds.get("spawnProjectile", 0),
    }


# ── 軸③：粒子特效 ───────────────────────────────────────────────────────────
def axis_particles(vfx: dict, consumed: dict, census: dict | None) -> dict:
    parts = {k: v for k, v in vfx.items() if v.get("schema") == "vfx@1"}
    fam = collections.defaultdict(lambda: [0, 0])
    for vid in parts:
        f = id_family(vid)
        fam[f][0] += 1
        if vid in consumed:
            fam[f][1] += 1
    orphans = collections.defaultdict(list)
    for vid in parts:
        if vid not in consumed:
            orphans[id_family(vid)].append(vid)
    orient = [v for v, d in parts.items() if d.get("orient")]
    flat = [v for v, d in parts.items() if (d.get("orient") or {}).get("pitchDeg") == 0]
    aim = [v for v, d in parts.items() if (d.get("orient") or {}).get("yawFrom") == "aim"]
    art = load(CONTENT / "config/vfx-ability-art.json")
    prims = collections.Counter()
    fams = collections.Counter()
    for _aid, b in art["bindings"].items():
        if "prim" in b:
            prims[b["prim"].get("primitive")] += 1
        if "family" in b:
            fams[b["family"].get("family")] += 1
    out = {
        "total": len(parts),
        "consumed": sum(1 for v in parts if v in consumed),
        "byFamily": {k: {"total": t, "consumed": c} for k, (t, c) in sorted(fam.items())},
        "orphansByFamily": {k: sorted(v) for k, v in sorted(orphans.items())},
        "withOrient": len(orient),
        "flatOrient": sorted(flat),
        "aimYaw": sorted(aim),
        "artBindings": len(art["bindings"]),
        "primitives": prims.most_common(),
        "families": fams.most_common(),
    }
    if census:
        out["w3xCensus"] = {
            "abilitySlots": len(census["rows"]),
            "statusTotals": census["statusTotals"],
            "vfxKeyTotals": census["vfxKeyTotals"],
            "extractionSupply": census["extractionSupply"],
        }
        imported_rows = [r for r in census["rows"]
                         if any(a.get("form") == "map-imported" for a in r.get("realArt") or [])]
        out["importedArtRows"] = len(imported_rows)
        out["importedArtStillPrimitive"] = sum(
            1 for r in imported_rows if (r.get("currentVfxKey") or "").startswith("fx.prim."))
        out["importedArtStillPrimitiveByModel"] = collections.Counter(
            a["stem"] for r in imported_rows
            if (r.get("currentVfxKey") or "").startswith("fx.prim.")
            for a in r["realArt"] if a.get("form") == "map-imported").most_common()
    return out


# ── 軸④：拖曳緞帶 ───────────────────────────────────────────────────────────
def axis_ribbons(vfx: dict, consumed: dict, emitters: dict | None) -> dict:
    ribs = {k: v for k, v in vfx.items() if v.get("schema") == "ribbon@1"}
    amb = load(CONTENT / "config/ambient-vfx.json")
    bound = {r["vfx"] for lst in amb["bindings"].values() for r in lst}
    src_ribb = (emitters or {}).get("summary", {}).get("ribbonEmitters")
    return {
        "total": len(ribs),
        "consumed": sum(1 for v in ribs if v in consumed),
        "orphans": sorted(v for v in ribs if v not in consumed),
        "boundViaAmbient": sorted(v for v in ribs if v in bound),
        "ambientModelBindings": len(amb["bindings"]),
        "sourceRibbonEmitters": src_ribb,
    }


# ── 軸⑤：球體／掛件綁 3D model ──────────────────────────────────────────────
def axis_attachments(vfx: dict, consumed: dict, dummy: dict, spheres: dict | None) -> dict:
    att = {k: v for k, v in vfx.items() if v.get("schema") == "attachment@1"}
    amb = load(CONTENT / "config/ambient-vfx.json")
    orb = dummy["orb_attachments"]
    return {
        "attachmentDocs": len(att),
        "attachmentDocsConsumed": sum(1 for v in att if v in consumed),
        "attachmentIds": sorted(att),
        "ambientModelBindings": len(amb["bindings"]),
        "ambientVfxRefs": sum(len(v) for v in amb["bindings"].values()),
        "sourceOrbCalls": len(orb),
        "sourceOrbAmbient": sum(1 for r in orb if r["kind"] == "orb-ambient"),
        "sourceOrbTimed": sum(1 for r in orb if r["kind"] == "orb-timed"),
        "sourceOrbCustomModel": sum(1 for r in orb if r.get("model_is_custom")),
        "sourceOrbCustomByModel": collections.Counter(
            r["model_stem"] for r in orb if r.get("model_is_custom")).most_common(),
        "sourceOrbAttachPoints": collections.Counter(
            r.get("attach_point") for r in orb).most_common(),
        "sphereCounts": (spheres or {}).get("counts"),
    }


# ── owner 點名的例子 + 替身模型 ─────────────────────────────────────────────
def axis_owner_examples(abilities: dict, refs: dict, model_fx: set[str]) -> dict:
    champs = {}
    for p in sorted((CONTENT / "champions").glob("*.json")):
        if p.name == "_index.json":
            continue
        d = load(p)
        champs[d["id"]] = d
    models = {p.stem for p in (CONTENT / "models").glob("*.json") if not p.name.startswith("_")}
    amb = load(CONTENT / "config/ambient-vfx.json")["bindings"]

    rows = []
    for ex in OWNER_EXAMPLES:
        c = champs.get(ex["champion"]) or {}
        mk = c.get("modelKey")
        rows.append({
            **ex,
            "championName": c.get("name"),
            "modelKey": mk,
            "modelIsStandin": bool(mk and mk.startswith(STANDIN_PREFIXES)),
            "ambient": sorted(r["vfx"] for r in amb.get(mk, [])),
            "abilityName": (abilities.get(ex["ability"]) or {}).get("name"),
            "abilityVfx": sorted(refs.get(ex["ability"], ())),
            "hasModelFx": ex["ability"] in model_fx,
        })

    standins = [{"id": cid, "name": c.get("name"), "modelKey": c.get("modelKey")}
                for cid, c in sorted(champs.items())
                if (c.get("modelKey") or "").startswith(STANDIN_PREFIXES)
                and cid not in ("sela", "thorne")]
    return {
        "rows": rows,
        "champions": len(champs),
        "standins": standins,
        "importedModelDocs": sum(1 for m in models if m.startswith("imported.")),
    }


# ── Markdown ────────────────────────────────────────────────────────────────
def h(n: int) -> str:
    return f"{n:,}"


def table(headers, rows, align=None):
    align = align or ["---"] * len(headers)
    out = ["| " + " | ".join(headers) + " |", "| " + " | ".join(align) + " |"]
    for r in rows:
        out.append("| " + " | ".join(str(c) for c in r) + " |")
    return "\n".join(out)


def render(d: dict) -> str:
    a1, a2, a3, a4, a5 = d["axis1"], d["axis2"], d["axis3"], d["axis4"], d["axis5"]
    L: list[str] = []
    w = L.append

    w("# 技能特效重整 —— 五軸全樹普查")
    w("")
    w("> 重跑：`python3 tools/vfx-census/scan.py`　"
      "（⛔ 沒有 `--check`：這是一份會成長的普查，不是新鮮度閘）")
    w("> 來源：`war3map.j` · `DUMMY_ORB_MAP.json` · `CENSUS.json` · `EMITTERS.json` · "
      "`SPHERE_ATTACHMENTS.json` · `content/`")
    w("> ⛔ 產物裡沒有時間戳（時間戳只在檔名上）—— 兩次執行的 diff 就是「內容真的變了」。")
    w("")
    w("## owner 的原話（2026-08-22，逐字）")
    w("")
    w("> 「JASS, 技能特效、**3d model蝗蟲群**(ex.許多角色的**衝擊波特效橫放 beam**、"
      "Saber約束勝利劍、小呆龍**鬥氣砲**、初號機**陽離子砲**等砲擊、衝擊波技能特效)、"
      "**粒子特效**、**拖曳緞帶特效**、**球體對應特效**(可綁定3d model 如悟空超3頭、"
      "超3手的衝擊波、Saber持有武器**金粉閃爍粒子特效**、揍敵客**拖曳緞帶特效**...等) "
      "要請你**徹底邊掃描邊建檔一輪**⋯提供**分析規劃開票**及最大化平行工作流完成」")
    w("")
    w("⇒ 這句話裡的五類就是下面的五個軸；七個具名例子在下一節逐個查到底。")
    w("")
    w("## 一頁摘要")
    w("")
    w(table(
        ["軸", "原作有", "GGD 匯入", "**真的接上技能**", "孤兒", "接上率"],
        [
            ["① JASS 一次性特效呼叫",
             f"{h(a1['callSites'])} 個呼叫 / {a1['distinctModels']} 種模型",
             f"{a1['importedModels']} 種地圖自帶模型在 repo 裡",
             f"{d['summary']['axis1Consumed']} 份 vfx 文件",
             f"{a1['stockModels']} 種暴雪內建（⛔ 不能匯入）",
             "—"],
            ["② 3D model 單位型（蝗蟲群／beam／砲擊）",
             f"{a2['dummyUnits']} 具 dummy（{a2['moving']} 具**會動**"
             f" ＝ {len(a2['movingRows'])} 個特效）",
             f"{len(a2['ggdLocustDocs'])} 份 `fx.w3x.locust.*`",
             f"**{len(a2['spawnModelFxAbilities'])}** 支技能用 `spawnModelFx`",
             f"{len(a2['ggdLocustDocs']) - len(a2['ggdLocustDocsConsumed'])}",
             f"**{a2['coveragePct']}%**"],
            ["③ 粒子特效 `vfx@1`", f"{a3['w3xCensus']['extractionSupply']['fxW3xLayers']} 層可抽",
             h(a3["total"]), h(a3["consumed"]),
             h(a3["total"] - a3["consumed"]),
             f"{a3['consumed'] * 100 // a3['total']}%"],
            ["④ 拖曳緞帶 `ribbon@1`",
             f"{a4['sourceRibbonEmitters']} 個 RIBB 發射器",
             h(a4["total"]), h(a4["consumed"]),
             h(a4["total"] - a4["consumed"]),
             f"{a4['consumed'] * 100 // a4['total']}%"],
            ["⑤ 球體／掛件 `attachment@1`",
             f"{a5['sourceOrbCalls']} 次掛件呼叫（{a5['sourceOrbCustomModel']} 次自帶模型）",
             h(a5["attachmentDocs"]), h(a5["attachmentDocsConsumed"]),
             "0", "100%"],
        ],
        ["---", "---", "---", "---", "---", "---"]))
    w("")
    w("")
    w("⚠️ **「接上率」的計算基礎是「已匯入的裡面接上幾成」，⛔ 不是「原作覆蓋率」。**"
      "所以軸⑤的 100% 讀作「**匯入的 3 份全部有人用**」，"
      f"⛔ 不是「原作那 {a5['sourceOrbCalls']} 次掛件都做完了」——"
      "它其實是這五軸裡**最空的一軸**（見軸⑤的缺口表）。")
    w("")
    for line in d["summary"]["headlines"]:
        w(f"- {line}")
    w("")

    # ── owner 逐字點名的例子 ──
    ax0 = d["ownerExamples"]
    w("## ⭐ owner 逐字點名的七個例子 —— 逐個查到底")
    w("")
    w("⚠️ 這一節的「現況」欄**每次重跑都重新查**，⛔ 沒有一個字是抄下來的。")
    w("")
    w(table(["owner 說的", "軸", "英雄", "模型", "技能", "**現況**"],
            [[r["said"], r["axis"],
              f"`{r['champion']}` {r['championName'] or '⛔ 查無此英雄'}",
              (f"⚠️ `{r['modelKey']}`（**替身骨架**）" if r["modelIsStandin"]
               else f"`{r['modelKey']}`"),
              (f"`{r['ability']}` {r['abilityName'] or ''}" if r["ability"] else "—"),
              owner_state(r)]
             for r in ax0["rows"]]))
    w("")
    w(f"### ⚠️ 前置條件：**{len(ax0['standins'])} 位英雄掛在替身骨架上**")
    w("")
    w("軸⑤（球體／掛件綁 3D model）在他們身上**做不出來** —— 掛點會綁到 sela／thorne "
      "／通用皮膚的骨架上，而不是這個角色。")
    w("")
    w(table(["英雄", "名字", "目前的模型"],
            [[f"`{s['id']}`", s["name"], f"`{s['modelKey']}`"] for s in ax0["standins"]]))
    w("")

    # ── 軸① ──
    w("---")
    w("")
    w("## ① JASS 特效呼叫 —— `AddSpecialEffect*` 的模型路徑與掛點")
    w("")
    w(table(["", "數"], [
        ["`AddSpecialEffectLocBJ`（落點一次性）", h(a1["locCalls"])],
        ["`AddSpecialEffectTargetUnitBJ`（掛在單位身上）", h(a1["targetCalls"])],
        ["**合計呼叫點**", f"**{h(a1['callSites'])}**"],
        ["相異模型", h(a1["distinctModels"])],
        ["　└ 地圖自帶（`raw/` 有檔，⭐ 可以用）", h(a1["importedModels"])],
        ["　└ 暴雪內建（⛔ 授權問題，不在 repo）", h(a1["stockModels"])],
    ], ["---", "---:"]))
    w("")
    w("### 掛點分佈（`AddSpecialEffectTargetUnitBJ` 的第一個參數）")
    w("")
    w(table(["掛點", "次數"], [[f"`{k}`", h(v)] for k, v in a1["attachPoints"]], ["---", "---:"]))
    w("")
    w(f"⚠️ 原始字串有 **{a1['attachPointRawVariants']} 種寫法**，其中含錯字與空白差異"
      f"（`orgin` / `chest ` / `hand,right` / `handright` …）——"
      f"**任何逐字比對掛點名的程式都會漏掉它們**，正規化必須先做。")
    w("")
    w("### ⭐ 地圖自帶模型被當成一次性特效用（這一族**可以直接接**）")
    w("")
    imp = [r for r in a1["rows"] if r["form"] == "map-imported"]
    w(table(["模型", "JASS 呼叫", "GGD 有幾份 vfx 文件", "其中接上技能"],
            [[f"`{r['stem']}`", r["calls"], len(r["ggdDocs"]), len(r["ggdDocsConsumed"])]
             for r in imp], ["---", "---:", "---:", "---:"]))
    w("")
    w("### 缺口：呼叫最多但 GGD 一份文件都沒有的模型（暴雪內建為主）")
    w("")
    gap = [r for r in a1["rows"] if not r["ggdDocs"]][:20]
    w(table(["模型", "JASS 呼叫", "來源"],
            [[f"`{r['stem']}`", r["calls"],
              "地圖自帶" if r["form"] == "map-imported" else "暴雪內建"] for r in gap],
            ["---", "---:", "---"]))
    w("")
    w("⚠️ 暴雪內建那一族**不是缺口，是替代題**：它們永遠不會進 repo，"
      "所以正確的做法是 `fx.prim.*` / `fx.fam.*` 家族替身（已經在做，見軸③）。")
    w("")

    # ── 軸② ──
    w("---")
    w("")
    w("## ② 3D model 單位型特效 —— 蝗蟲群 dummy（owner 點名的「橫放 beam／砲擊」）")
    w("")
    w("原作的做法：生一具**帶 `Aloc`（蝗蟲）的隱形單位**掛上模型 → 逐幀 `SetUnitPositionLoc` "
      "推著走 → `KillUnit`。它**不是粒子**，是一具會動的 3D 模型。")
    w("")
    w(table(["", "數"], [
        ["dummy 特效單位（總）", h(a2["dummyUnits"])],
        ["　└ 帶 `Aloc` 蝗蟲旗標", h(a2["locustFlagged"])],
        ["　└ **會移動**（逐幀推位置）", f"**{h(a2['moving'])}**"],
        ["　└ 原地不動", h(a2["stationary"])],
        ["模型已抽成 vfx 文件（`EXISTING`）", h(a2["byVfxStatus"].get("EXISTING", 0))],
        ["模型在 repo 但還沒抽（`NEW`）", h(a2["byVfxStatus"].get("NEW", 0))],
        ["暴雪內建模型（`STOCK`）", h(a2["byVfxStatus"].get("STOCK", 0))],
    ], ["---", "---:"]))
    w("")
    w(f"### GGD 這一軸的接上率是 **{a2['coveragePct']}%**"
      f"（{len(a2['spawnModelFxAbilities'])} / {len(a2['movingRows'])} 個特效）")
    w("")
    w(f"引擎今天剛落地 `spawnModelFx`（帶模型的單位沿路徑移動：forward/toTarget/orbit/radial + "
      f"`spinDegPerSec` 翻滾 + `onTouch` 路徑命中 + `onArrive` 落點）。"
      f"⭐ 目前用它的技能：{', '.join('`' + a + '`' for a in a2['spawnModelFxAbilities']) or '⛔ 一支都沒有'}。")
    w("")
    w(f"對照：`spawnVfx` {a2['spawnVfxUsages']} 處、`spawnProjectile` {a2['spawnProjectileUsages']} 處。")
    w("")
    if a2["coveragePct"] < 50:
        w(f"⚠️ **剩下的 {len(a2['movingRows']) - len(a2['spawnModelFxAbilities'])} 個特效**"
          f"是這一軸的主體。機制有、schema 有、後台有，而玩家在那些技能上看到的還是一團粒子 ——"
          f"**失敗形態②**（做好了但沒有人消費）。")
        w("")
    w(f"### 原作 {a2['moving']} 具會動的 dummy —— **這就是要接的清單**"
      f"（收斂成 {len(a2['movingRows'])} 個特效）")
    w("")
    w(table(["原作英雄", "dummy 單位名", "模型", "實例", "模型狀態", "JASS trigger",
             "已標記的 GGD 技能"],
            [[r["hero"] or "—", r["unitName"], f"`{r['model']}`", r["instances"], r["status"],
              f"`{r['trigger']}`" if r["trigger"] else "—",
              ", ".join(f"`{x}`" for x in r["placeholders"]) or "—"]
             for r in a2["movingRows"]],
            ["---", "---", "---", "---:", "---", "---", "---"]))
    w("")
    w("⚠️ **「實例」欄是這張表最容易讀錯的一格**：`ailbspecialart` 那一列的 4 具"
      "**不是四個特效**，是同一招在 JASS 裡生四具往四個方向推 —— "
      "⭐ 在 `spawnModelFx` 裡它是 `path:\"radial\", count:4` **一格參數**，"
      "⛔ 不是四支技能。")
    w("")
    w("⭐ owner 逐字點名的四個例子在這張表上的位置：")
    w("")
    w(table(["owner 說的", "原作 trigger", "這張表上的列"], [
        ["Saber 約束勝利之劍", "`ExcaliburMAX`",
         "**4 具**：安云衝刺 / 特效三號 / Saber殘影 / 勝利劍"],
        ["初號機陽電子砲", "（`godie-e00r`，原作用的是砲擊型 dummy）", "見下方「缺口」"],
        ["小呆龍鬥氣砲", "（`godie-udre` / `godie-u01u` 系）", "見下方「缺口」"],
        ["衝擊波特效橫放 beam", "`warstompcaster` / `thunderclapcaster`",
         "動地剁 / 雷切（宇志波佐助）"],
    ]))
    w("")

    # ── 軸③ ──
    w("---")
    w("")
    w("## ③ 粒子特效 `vfx@1`")
    w("")
    w(table(["前綴族", "文件數", "接上技能", "孤兒"],
            [[f"`{k}`", v["total"], v["consumed"], v["total"] - v["consumed"]]
             for k, v in a3["byFamily"].items()], ["---", "---:", "---:", "---:"]))
    w("")
    w(f"**合計 {h(a3['total'])} 份 / 接上 {h(a3['consumed'])} 份 / "
      f"孤兒 {h(a3['total'] - a3['consumed'])} 份。**")
    w("")
    w("### 孤兒是哪些")
    w("")
    for fam, ids in a3["orphansByFamily"].items():
        if not ids:
            continue
        w(f"**`{fam}` — {len(ids)} 份**")
        w("")
        w(f"　{orphan_reason(fam)}")
        w("")
        w(f"　<sub>{', '.join('`' + i + '`' for i in ids[:12])}"
          f"{' …' if len(ids) > 12 else ''}</sub>")
        w("")
    cen = a3["w3xCensus"]
    w("### 缺口：原作有藝術資源、GGD 卻還在用替身")
    w("")
    w(table(["", "數"], [
        ["技能欄位總數（原作對照）", h(cen["abilitySlots"])],
        ["`TRUE-PORT`（真的用了原作模型的粒子）", h(cen["statusTotals"]["TRUE-PORT"])],
        ["`PRIMITIVE-NECESSARY`（原作是暴雪內建，替身是**必要**的）",
         h(cen["statusTotals"]["PRIMITIVE-NECESSARY"])],
        ["`PRIMITIVE-SUBSTITUTE`（原作資源**在 repo**，卻用了替身）",
         h(cen["statusTotals"]["PRIMITIVE-SUBSTITUTE"])],
        ["`NO-SOURCE`（原作那一格根本沒有藝術資源）", h(cen["statusTotals"]["NO-SOURCE"])],
        ["已抽出的 `fx.w3x.*` 粒子層", h(cen["extractionSupply"]["fxW3xLayers"])],
        ["　└ 真的被綁成 `vfxKey`", h(cen["extractionSupply"]["boundAsVfxKey"])],
        ["　└ **抽了沒人用**", f"**{h(cen['extractionSupply']['unused'])}**"],
    ], ["---", "---:"]))
    w("")
    w(f"⭐ **最可行的一塊**：{a3['importedArtRows']} 個技能欄位的原作藝術是**地圖自帶模型**"
      f"（檔案就在 `raw/`，⛔ 沒有授權問題），其中 **{a3['importedArtStillPrimitive']} 個**"
      f"目前還掛在 `fx.prim.*` 替身上。")
    w("")
    w(f"⚠️ **這個 {a3['importedArtStillPrimitive']} 跟上表的 "
      f"`PRIMITIVE-SUBSTITUTE` {cen['statusTotals']['PRIMITIVE-SUBSTITUTE']} 不是同一個數字**，"
      f"⛔ 兩者沒有互相矛盾：`PRIMITIVE-SUBSTITUTE` 只算**已經抽出候選粒子**卻仍用替身的；"
      f"這裡的 {a3['importedArtStillPrimitive']} 還包含**模型在 repo 但一層都還沒抽**的 —— "
      f"⭐ 也就是說，差額那些是「先抽再綁」，⛔ 不是「已經有卻沒用」。")
    w("")
    w(table(["模型", "還在用替身的技能欄位數"],
            [[f"`{k}`", v] for k, v in a3["importedArtStillPrimitiveByModel"][:15]],
            ["---", "---:"]))
    w("")
    w("### ⚠️ 一個獨立的缺口：**方位**（owner 的「衝擊波特效橫放 beam」）")
    w("")
    w(table(["", "數"], [
        ["`vfx@1` 文件總數", h(a3["total"])],
        ["有 `orient` 欄位的", h(a3["withOrient"])],
        ["**`pitchDeg: 0`（真的橫放）**", f"**{len(a3['flatOrient'])}**"],
        ["**`yawFrom: \"aim\"`（真的朝瞄準方向）**", f"**{len(a3['aimYaw'])}**"],
        ["用 `beam` primitive 的技能欄位", h(dict(a3["primitives"]).get("beam", 0))],
    ], ["---", "---:"]))
    w("")
    w(f"⇒ **{dict(a3['primitives']).get('beam', 0)} 支技能是 beam，而只有 "
      f"{len(a3['aimYaw'])} 份 vfx 文件會朝瞄準方向噴**"
      f"（`{'`, `'.join(a3['aimYaw'])}`）。其餘每一次施法都朝**世界座標的同一個方向**噴，"
      f"跟打誰無關 —— schema 的 `orient` 檔頭自己把這個後果寫下來了，而出貨內容沒有用它。")
    w("")
    w("### `config.vfx-ability-art@1` 目前的替身分佈")
    w("")
    w(table(["primitive", "技能欄位"], [[f"`{k}`", v] for k, v in a3["primitives"]],
            ["---", "---:"]))
    w("")
    w(table(["w3x 家族", "技能欄位"], [[f"`{k}`", v] for k, v in a3["families"][:12]],
            ["---", "---:"]))
    w("")

    # ── 軸④ ──
    w("---")
    w("")
    w("## ④ 拖曳緞帶 `ribbon@1`（owner 點名的「揍敵客拖曳緞帶」）")
    w("")
    w(table(["", "數"], [
        ["原作 RIBB 緞帶發射器", h(a4["sourceRibbonEmitters"] or 0)],
        ["GGD `ribbon@1` 文件", h(a4["total"])],
        ["**真的接上（`config.ambient-vfx@1` 綁定）**", f"**{h(a4['consumed'])}**"],
        ["孤兒", h(a4["total"] - a4["consumed"])],
        ["有緞帶綁定的模型數", h(a4["ambientModelBindings"])],
    ], ["---", "---:"]))
    w("")
    w(f"### 孤兒（{len(a4['orphans'])} 份）")
    w("")
    w("　⭐ **它們不是壞掉的，是沒有第二個消費端**：`ribbon@1` 目前**只有**"
      "`config.ambient-vfx@1` 一條路 —— 「這個**模型**永遠帶著這條緞帶」。")
    w("　⛔ 沒有「這**支技能**施放時拉一條緞帶」的路，也沒有「這**把武器**揮動時拉一條」的路。")
    w("")
    w(f"　<sub>{', '.join('`' + i + '`' for i in a4['orphans'][:20])}"
      f"{' …' if len(a4['orphans']) > 20 else ''}</sub>")
    w("")

    # ── 軸⑤ ──
    w("---")
    w("")
    w("## ⑤ 球體／掛件綁 3D model `attachment@1`")
    w("")
    w(table(["", "數"], [
        ["原作掛件呼叫（`AddSpecialEffectTargetUnitBJ` 一族）", h(a5["sourceOrbCalls"])],
        ["　└ `orb-ambient`（不立刻銷毀＝常駐）", h(a5["sourceOrbAmbient"])],
        ["　└ `orb-timed`（掛完就殺＝一次性）", h(a5["sourceOrbTimed"])],
        ["　└ **用地圖自帶模型**（⭐ 可以直接接）", h(a5["sourceOrbCustomModel"])],
        ["GGD `attachment@1` 文件", f"**{h(a5['attachmentDocs'])}**"],
        ["　└ 接上", h(a5["attachmentDocsConsumed"])],
        ["`config.ambient-vfx@1` 綁定的模型數", h(a5["ambientModelBindings"])],
    ], ["---", "---:"]))
    w("")
    sc = a5["sphereCounts"] or {}
    w("### 原作「球體」（`Asph` 系）盤點")
    w("")
    w(table(["", "數"], [
        ["`base == Asph` 的技能", h(sc.get("sphereAbilitiesDirectBaseAsph", 0))],
        ["**(英雄, 技能) 對**（真的掛在英雄永久技能列上）",
         f"**{h(sc.get('heroAbilityPairs', 0))}**"],
        ["涉及的英雄", h(sc.get("distinctChampions", 0))],
        ["相異掛件模型", h(sc.get("distinctAttachModels", 0))],
        ["出貨載入器看得到的列", h(sc.get("rowsShippedLoaderSees", 0))],
        ["出貨載入器**漏掉**的列", h(sc.get("rowsShippedLoaderMisses", 0))],
    ], ["---", "---:"]))
    w("")
    if sc.get("byDecision"):
        w(table(["裁決", "列"], [[f"`{k}`", v] for k, v in
                                 sorted(sc["byDecision"].items(), key=lambda x: -x[1])],
                ["---", "---:"]))
        w("")
    w("### 缺口：`attachment@1` 只有 3 份，而原作有 31 次自帶模型掛件")
    w("")
    w(table(["模型", "掛件呼叫次數"], [[f"`{k}`", v] for k, v in a5["sourceOrbCustomByModel"]],
            ["---", "---:"]))
    w("")
    w("⭐ owner 點名的「Saber 持有武器金粉閃爍粒子」對應 `magical-sword` / "
      "`herocloudkfksword`；「悟空超3 頭／手的衝擊波」對應 `chest` / `head` / `hand` 三個掛點"
      f"（原作掛點分佈：{', '.join(f'`{k}`×{v}' for k, v in a5['sourceOrbAttachPoints'][:6])}）。")
    w("")

    # ── 規劃 ──
    w("---")
    w("")
    w("## ⭐ 分析規劃與建議開票（按「一個機制解鎖幾支技能」排序）")
    w("")
    w("⛔ 這一節只**建議**，沒有開票（gh 寫入是禁令）。")
    w("⚠️ 排序依據是**第〇·五守則**：按「擋住幾支」做機制，⛔ 不是按技能順序做技能。")
    w("")
    w(table(
        ["#", "要做什麼", "擋住幾支", "檔案領域（排並行批次用）", "為什麼是這個順序"],
        [[str(i + 1), t["what"], t["blocks"], t["files"], t["why"]]
         for i, t in enumerate(d["tickets"])],
        ["---:", "---", "---:", "---", "---"]))
    w("")
    for t in d["tickets"]:
        w(f"### {t['what']}")
        w("")
        w(f"- **擋住**：{t['blocks']}")
        w(f"- **檔案領域**：{t['files']}")
        w(f"- **形狀**：{t['shape']}")
        if t.get("knobs"):
            w("- **後台欄位**（第一守則，主 session 接 admin）：")
            w("")
            w("  " + table(["欄位", "型別", "上下界", "中文標籤", "它影響什麼"], t["knobs"])
              .replace("\n", "\n  "))
        w("")
    w("")
    w("### ⚠️ 並行批次建議（檔案級柵欄，⛔ 不是目錄級）")
    w("")
    w(table(["批次", "票", "獨佔的檔案", "為什麼不能跟別批同時跑"],
            [[b["lane"], b["tickets"], b["files"], b["why"]] for b in d["batches"]]))
    w("")
    w("⛔ **兩個結構性的序列點**（⚠️ 加速不了，排批次時要留出來）：")
    w("")
    w("1. `pnpm skills:sync` 寫 `bundle.json` ⇒ **全域只能有一條工作流跑它**。"
      "四條 lane 全部禁跑，主 session 最後統一跑一次。")
    w("2. 新增 `content/config/*.json`（B 的 `model-fx-map.json`）會逼著動 "
      "`apps/admin/src/store.ts` 與 `ui/App.tsx` **各一行**"
      "（`configDocCoverage.test.ts` 要求 session-gate + 導覽列）—— "
      "⭐ 那兩行是**已知唯一真正共用的檔**，一律由主 session 接。")
    w("")
    return "\n".join(L) + "\n"


def owner_state(r: dict) -> str:
    """⭐ 逐項現況一律由資料推導，⛔ 不寫死結論。"""
    bits = []
    if r["ability"]:
        vk = r["abilityVfx"]
        if not vk:
            bits.append("⛔ **一份 vfx 都沒綁**")
        else:
            prim = [k for k in vk if k.startswith("fx.prim.")]
            w3x = [k for k in vk if k.startswith("fx.w3x.")]
            flat = [k for k in vk if k.endswith("-flat")]
            if flat:
                bits.append(f"⭐ 有橫放／瞄準變體 `{'`, `'.join(flat)}`")
            if w3x:
                bits.append(f"⭐ 用了原作粒子 `{'`, `'.join(w3x)}`")
            if prim and not flat:
                bits.append(f"⚠️ 全是替身 `{'`, `'.join(prim)}`")
            elif prim:
                bits.append(f"其餘替身 ×{len(prim)}")
        bits.append("⭐ **已接 `spawnModelFx`**" if r["hasModelFx"]
                    else "⛔ 還沒接 `spawnModelFx`")
    if r["ambient"]:
        bits.append(f"⭐ 常駐綁定 ×{len(r['ambient'])}（`{'`, `'.join(r['ambient'][:3])}`）")
    else:
        bits.append("⛔ `config.ambient-vfx@1` 無綁定")
    if r["modelIsStandin"]:
        bits.append("⛔ 模型是替身 ⇒ 掛點做不出來")
    return "；".join(bits)


def orphan_reason(fam: str) -> str:
    return {
        "godie-*": "匯入模型的**逐層粒子抽取**（一個 mdx → p0/p1/p2…）。"
                   "它們的唯一消費端是 `config.ambient-vfx@1`（「這個模型永遠帶著它」），"
                   "⛔ 沒有「技能施放時放這一層」的路 —— 所以只有 11 個模型的層被綁了。",
        "fx.fam.*": "從 w3x 家族（shockwaveRing / burst / blink …）產生的**參數化替身**，"
                    "一個家族 × 多個尺寸／色調。`config.vfx-ability-art@1` 目前只挑了其中幾個，"
                    "其餘是**備選**，⛔ 不是壞掉的。",
        "fx.prim.*": "手寫的元素×形狀替身矩陣（10 種 primitive × 13 種元素）。"
                     "沒被挑中的組合是**矩陣的空格**，⛔ 不是缺陷。",
        "fx.w3x.orb.*": "從**掛件模型**（原作掛在 `chest`／`weapon` 的那一族）抽出的粒子層。"
                        "⛔ 沒有消費端是因為 `attachment@1` 只有 3 份 —— **這一族在等軸⑤**。",
        "fx.w3x.particle.*": "從地圖自帶模型抽出的粒子層。已綁的走 "
                             "`config.ability-vfx-bindings@1`；未綁的多半是"
                             "**同一個模型的第 2～6 層**（一個 mdx 抽出 p00…p05，"
                             "而綁定只挑了其中幾層）。",
        "fx.w3x.locust.*": "會移動的 dummy 模型身上的粒子層。⛔ 它們的正確消費端是 "
                           "`spawnModelFx`，而**用它的技能是 0 支**（軸②）。",
        "fx.*（手寫）": "手寫文件。",
    }.get(fam, "—")


# ── 規劃（依實測數字排序） ──────────────────────────────────────────────────
def build_tickets(d: dict) -> list[dict]:
    a2, a3, a4, a5 = d["axis2"], d["axis3"], d["axis4"], d["axis5"]
    ax0 = d["ownerExamples"]
    beam = dict(a3["primitives"]).get("beam", 0)
    slash = dict(a3["primitives"]).get("slash", 0)
    shock = dict(a3["primitives"]).get("shockwave", 0)
    directional = beam + slash + shock + dict(a3["primitives"]).get("bolt", 0)
    return [
        {
            "what": "**方位接線** —— `orient.yawFrom:\"aim\"` 變成有方向形狀的預設",
            "blocks": f"**{directional} 支**"
                      f"（beam {beam} · slash {slash} · shockwave {shock} · bolt "
                      f"{dict(a3['primitives']).get('bolt', 0)}）",
            "files": "`content/vfx/fx.prim.*.json` · `apps/client/scripts/gen-w3x-families.ts` · "
                     "`content/config/vfx-ability-art.json`",
            "why": f"schema 已經有 `orient`，出貨只有 {len(a3['aimYaw'])} 份在用 —— "
                   f"**零新程式**，改的是資料。CP 值最高。",
            "shape": "產生器替每一個有方向的 primitive 補一份 `yawFrom:\"aim\"` 變體，"
                     "`vfx-ability-art` 的 `beam`/`slash`/`shockwave` 一律指到它。"
                     "⛔ 不要逐支技能改 —— 那是第〇·五守則的「為某支技能寫 if」。",
            "knobs": [
                ["`vfxOrient.aimFollowsCaster`", "boolean", "—", "特效朝向跟隨瞄準",
                 "關掉＝退回世界座標方位（舊行為）。⭐ 預設 **on**（第〇·六守則：高層級贏的預設啟動）"],
                ["`vfxOrient.defaultPitchDeg`", "number", "0–90", "有方向特效的預設仰角",
                 "0＝完全橫放（owner 要的「橫放 beam」）；90＝直立柱狀（舊行為）"],
            ],
        },
        {
            "what": "**`spawnModelFx` 接線** —— 把剩下會動的 dummy 變成內容",
            "blocks": f"**還剩 {a2['movingEffects'] - len(a2['spawnModelFxAbilities'])} 個原作特效**"
                      f"（{a2['movingEffects']} 個中已接 {len(a2['spawnModelFxAbilities'])} 個）",
            "files": "`content/abilities/*.json` · `content/models/_index.json` · "
                     "`content/config/`（新的 dummy→modelKey 對照表）",
            "why": f"引擎剛落地、接上率 **{a2['coveragePct']}%** —— 這正是 owner 點名的"
                   f"「3d model 蝗蟲群／砲擊」，而剩下的是主體。",
            "shape": "一張 **dummy 模型 → `modelKey` 的對照表**（`content/config/`）＋"
                     "技能 JSON 填 `path` / `speed` / `distance` / `spinDegPerSec`。"
                     "⭐ 它們只差參數 ⇒ **一個模板 + 一張表**，⛔ 不是一支一輪。",
            "knobs": [
                ["`modelFx.enabled`", "boolean", "—", "移動模型特效總開關",
                 "關掉＝退回粒子替身，用來一鍵 rollback"],
                ["`modelFx.maxConcurrent`", "int", "1–64", "同場最多幾具移動模型",
                 "上界防「一場 200 具模型」把客戶端拖垮；⛔ 不是只有下界"],
            ],
        },
        {
            "what": "**技能級緞帶／掛件** —— `ribbon@1` 與 `attachment@1` 的第二個消費端",
            "blocks": f"緞帶 {a4['total'] - a4['consumed']} 份孤兒 + "
                      f"原作 {a5['sourceOrbCustomModel']} 次自帶模型掛件",
            "files": "`packages/shared/src/content/schema/ability.ts`（`persistentVfx` 旁邊）· "
                     "`content/abilities/*.json` · `content/vfx/attach.*.json`",
            "why": "owner 逐字點名兩個（揍敵客拖曳緞帶、Saber 武器金粉）—— "
                   "而目前唯一的路是「綁在**模型**上」，做不出「這**支技能**／這**把武器**」。",
            "shape": "`ability@1` 加一格 `attachVfx`（掛點 + vfx id + 存活條件），"
                     "沿用 `persistentVfx` 已經有的條件常駐機制。⛔ 不要新開一套生命週期。",
            "knobs": [
                ["`attachVfx.maxPerEntity`", "int", "1–12", "單一單位最多幾個掛件特效",
                 "上界；超過就丟最舊的，⛔ 不是靜默疊加"],
            ],
        },
        {
            "what": "**地圖自帶模型的粒子回填** —— 把 `fx.prim.*` 替身換回原作粒子",
            "blocks": f"**{a3['importedArtStillPrimitive']} 個技能欄位**"
                      f"（原作藝術在 repo，⛔ 沒有授權問題）",
            "files": "`content/config/vfx-ability-art.json` · `content/vfx/fx.w3x.*.json` · "
                     "`content/config/ability-vfx-bindings.json`",
            "why": f"已抽出 {a3['w3xCensus']['extractionSupply']['fxW3xLayers']} 層、"
                   f"只綁了 {a3['w3xCensus']['extractionSupply']['boundAsVfxKey']} 層 —— "
                   f"**{a3['w3xCensus']['extractionSupply']['unused']} 層抽了沒人用**。純資料。",
            "shape": "從 `CENSUS.json` 的 `map-imported` 列自動產生綁定，"
                     "⛔ 不要手挑 —— 手挑的那一份下次重抽就過期。",
            "knobs": [],
        },
        {
            "what": "**替身骨架回收**（軸⑤的前置條件，⛔ 不做就沒有掛點可綁）",
            "blocks": f"**{len(ax0['standins'])} 位英雄**的整個軸⑤"
                      f"（含 owner 點名的初號機、揍敵客）",
            "files": "`content/champions/*.json`（`modelKey`）· `content/models/*.json`",
            "why": "掛點（`chest` / `weapon` / `head`）綁在 `champ.sela` 上是綁到**別人的骨架**。"
                   "⭐ 這一票**不做特效**，它只是讓其他三票在這些英雄身上有東西可綁。",
            "shape": "逐位比對 `content/models/imported.*` 有沒有對應的角色模型"
                     "（例：`imported.heroeva01s2` 已經在 repo，而初號機掛的是 "
                     "`champ.skin.rogue`）。⛔ 沒有對應模型的維持替身並記錄理由。",
            "knobs": [],
        },
        {
            "what": "**掛點名正規化** —— 原作 19 種寫法收斂成一組列舉",
            "blocks": f"軸① 全部 {d['axis1']['targetCalls']} 次掛件呼叫的下游",
            "files": "`tools/w3x-import/dummy_orb_scan.py` · `content/config/`（掛點別名表）",
            "why": "`orgin` / `chest ` / `hand,right` / `handright` 都是原作真的寫進去的 —— "
                   "任何逐字比對都會靜默漏掉，而**漏掉長得跟正常一模一樣**。",
            "shape": "一張別名表（`content/config/`）＋一條守衛："
                     "任何原始掛點字串都必須解析到列舉裡的一個值，⛔ 不可以靜默 fallback。",
            "knobs": [],
        },
    ]


def build_batches() -> list[dict]:
    return [
        {"lane": "A", "tickets": "**方位接線 ＋ 地圖自帶模型粒子回填**",
         "files": "`content/vfx/fx.*.json` · `content/config/vfx-ability-art.json` · "
                  "`content/config/ability-vfx-bindings.json` · "
                  "`apps/client/scripts/gen-w3x-families.ts`",
         "why": "⛔ **這兩票不可以分開** —— 都在改「這支技能指到哪一份 vfx」，"
                "分兩條 lane 就是兩邊寫同一個 `vfx-ability-art.json`"},
        {"lane": "B", "tickets": "`spawnModelFx` 接線",
         "files": "`content/abilities/*.json` · `content/config/model-fx-map.json`（新）",
         "why": "唯一會大量改技能 JSON 的一條 ⇒ 獨佔 `content/abilities/`"},
        {"lane": "C", "tickets": "技能級緞帶／掛件（schema 那一半）",
         "files": "`packages/shared/src/content/schema/ability.ts` · `content/vfx/attach.*.json`",
         "why": "唯一動 schema 的一條 ⇒ 獨佔 `ability.ts`。"
                "⚠️ **技能側接線要等 B 收工**（同樣寫 `content/abilities/`）"},
        {"lane": "D", "tickets": "掛點名正規化 ＋ 替身骨架回收",
         "files": "`tools/w3x-import/dummy_orb_scan.py` · `content/champions/*.json` · "
                  "`content/models/*.json`",
         "why": "只動匯入工具與模型指派，⛔ 完全不碰 `content/vfx/`"},
    ]


def main() -> int:
    ap = argparse.ArgumentParser(description="五軸特效普查")
    ap.add_argument("--out", default=str(DEFAULT_MD), help="Markdown 輸出路徑")
    ap.add_argument("--json", default=str(DEFAULT_JSON), help="機器可讀輸出路徑")
    args = ap.parse_args()

    for req in (WAR3MAP_J, DUMMY_ORB, CENSUS):
        if not req.exists():
            print(f"⛔ 缺來源：{req}", file=sys.stderr)
            return 2

    vfx = vfx_docs()
    consumed = scan_consumers(set(vfx))
    abilities, kinds, refs, kind_abilities = ability_index()
    dummy = load(DUMMY_ORB)
    census = load(CENSUS)
    emitters = maybe(EMITTERS)
    spheres = maybe(SPHERES)

    a1 = axis_jass_effects(vfx, consumed)
    a2 = axis_locust(dummy, kinds, kind_abilities, vfx, consumed)
    a3 = axis_particles(vfx, consumed, census)
    a4 = axis_ribbons(vfx, consumed, emitters)
    a5 = axis_attachments(vfx, consumed, dummy, spheres)
    ax0 = axis_owner_examples(abilities, refs, set(a2["spawnModelFxAbilities"]))

    a1_consumed = len({dd for r in a1["rows"] for dd in r["ggdDocsConsumed"]})
    beam = dict(a3["primitives"]).get("beam", 0)
    headlines = [
        f"{'⛔' if a2['coveragePct'] < 50 else '⭐'} **軸②接上率 {a2['coveragePct']}%** —— "
        f"原作 {a2['moving']} 具**會移動**的模型 dummy（收斂成 {a2['movingEffects']} 個特效），"
        f"GGD 用 `spawnModelFx` 的技能 **{len(a2['spawnModelFxAbilities'])} 支**。",
        f"⛔ **{beam} 支 beam 技能裡只有 {len(a3['aimYaw'])} 份 vfx 會朝瞄準方向噴** —— "
        f"其餘每次施法都噴向世界座標的同一個方向（owner 的「橫放 beam」正是這一格）。",
        f"⭐ **{a3['importedArtStillPrimitive']} 個技能欄位**的原作藝術是地圖自帶模型"
        f"（在 repo、⛔ 無授權問題），卻還掛在 `fx.prim.*` 替身上 —— 純資料就能回填。",
        f"⭐ 已抽出 {a3['w3xCensus']['extractionSupply']['fxW3xLayers']} 層 w3x 粒子，"
        f"**{a3['w3xCensus']['extractionSupply']['unused']} 層沒有任何消費端**。",
        f"⛔ `ribbon@1` {a4['total']} 份只接上 {a4['consumed']} 份、"
        f"`attachment@1` 只有 {a5['attachmentDocs']} 份，"
        f"而原作有 {a5['sourceOrbCustomModel']} 次自帶模型掛件 —— "
        f"**缺的不是資料，是「技能級」的消費路徑**。",
        f"⚠️ **{len(ax0['standins'])} 位英雄掛在替身骨架上**"
        f"（`champ.sela` / `champ.thorne` / `champ.skin.*`）—— owner 點名的**初號機**與"
        f"**揍敵客**都在其中。⛔ 掛點特效綁在替身骨架上是綁到別人身上，"
        f"軸⑤在他們身上**做不出來**。",
    ]

    data = {
        "axis1": a1, "axis2": a2, "axis3": a3, "axis4": a4, "axis5": a5,
        "ownerExamples": ax0,
        "summary": {"axis1Consumed": a1_consumed, "headlines": headlines},
    }
    data["tickets"] = build_tickets(data)
    data["batches"] = build_batches()

    md = render(data)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(md, encoding="utf-8")
    jp = Path(args.json)
    jp.parent.mkdir(parents=True, exist_ok=True)
    jp.write_text(json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                  encoding="utf-8")
    print(f"✅ {out}")
    print(f"✅ {jp}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
