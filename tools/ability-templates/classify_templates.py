#!/usr/bin/env python3
"""
classify_templates.py — 英雄技能模板分類 (owner 驗收用 CSV)

Reads every content/abilities/*.json (the authoritative mirror side), classifies
each ability into a 模板 by its EFFECT SHAPE first (dash/projectile/AoE/buff/
passive/aura/status/heal) and DESCRIPTION KEYWORDS second (變身/招喚/跳斬 —
mechanics the EffectDef vocab can't express directly), and emits
docs/ability-templates.csv with the full parameter surface per row.

分類優先序 (first match wins; 判定依據 column records why):
  招喚型     description 招喚/召喚 (mechanic mostly unported — see 備註)
  變身型     castType self + applyBuff AND description 變身/型態/合體/進化
  跳斬型     dash + damage in the same cast
  衝刺型     dash, no damage
  衝擊波型   spawnProjectile with wave-family projectile (直線貫穿)
  飛彈型     spawnProjectile otherwise (單發投射)
  光環型     passive.ranks[].auras
  被動-觸發型 passive.ranks[].hooks (on-hit/on-taken procs)
  被動-屬性型 passive.ranks[].modifiers only (evasion/stats)
  治療護盾型 heal / shield / restore present
  控場型     applyStatus present and (no damage or damage rank1 < 100)
  範圍爆發型 damage + (radius or ground cast) — AoE nuke
  單體型     damage, targeted
  自體強化型 applyBuff self, not 變身
  其他       anything left (effects [] with no passive, utility …)

⭐ 這一支現在只**算**,⛔ 不寫檔 —— 唯一的入口是 `pnpm templates:build`
（`tools/ability-templates/gen.py`）。理由寫在 gen.py 的檔頭：分三支各自寫同一份
CSV 的話,先跑的那一支會把後跑的那一支的欄位**整欄洗掉**（實際發生過:
`實作落差分` / `落差說明` / 七個 `行為*` 欄在這支單獨重跑時會消失）。

⭐ 七個 `行為*` 欄（`JASS行為模板` / `行為原標` / `行為幾何` / `行為時序` /
`位移語意` / `行為證據` / `行為備註`）在 2026-08-23 之前**只住在產物 CSV 裡** ——
這一支不產生它們,而它會覆寫 CSV ⇒ 跑一次就永久失去 309 筆 JASS 細讀記錄。
現在它們**從證據推導**:原標與五個描述欄 ← `JASS_BEHAVIOR.json`,
原標→模板的聚類定案 ← `behavior_clusters.json`（第〇·四守則:知識不住產物裡）。
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ABIL = ROOT / "content" / "abilities"
CHAMPS = ROOT / "content" / "champions"
SRC = ROOT / "tools" / "w3x-import" / "out" / "GoDieEX22s-src"
OUT = ROOT / "docs" / "ability-templates.csv"
CLUSTERS = Path(__file__).resolve().parent / "behavior_clusters.json"
BEHAVIOR = SRC / "JASS_BEHAVIOR.json"

# ── 行為欄 (CSV 欄名 ↔ JASS_BEHAVIOR.json 的欄名) ──
BEHAVIOR_COLS = (
    ("行為原標", "template"),
    ("行為幾何", "geometry"),
    ("行為時序", "timing"),
    ("位移語意", "movement"),
    ("行為證據", "evidence"),
    ("行為備註", "notes"),
)
NO_TRIGGER = "物件資料技能(無觸發)"

champ_names = {
    p.stem: json.loads(p.read_text()).get("name", p.stem) for p in CHAMPS.glob("godie-*.json")
}

# ── WC3 側資料: 三軸稽核 (rawcode/JASS/特效模型/音效) + 物件欄 + 音效檔綁定 ──
audit = {r["ability"]: r for r in json.loads((SRC / "EFFECT_AUDIT.json").read_text())["abilities"]}
_obj = json.loads((SRC / "OBJECTS.json").read_text())
objects = _obj.get("abilities", _obj)
sfx_bind = json.loads((SRC / "SFX_BINDINGS.json").read_text())["bindings"]

# WC3 stock 基底 → 人話標籤 (球體/蝗蟲群/變身/召喚 等特殊機制由此判讀)
BASE_LABELS = {
    "ANcl": "通魔(觸發殼)", "AEIl": "變身", "AHtb": "風暴之鎚", "AOsh": "衝擊波",
    "Aegr": "復原", "AOws": "戰爭踐踏", "AEev": "閃避", "AHbh": "重擊",
    "Absk": "狂暴", "AOcr": "致命一擊", "ANsb": "妖術", "ANcs": "集束火箭",
    "AEme": "變形", "AHtc": "雷霆一擊", "AEtq": "寧靜", "AUcs": "腐臭蜂群",
    "Awar": "戰爭踐踏", "Aamk": "屬性加成", "AEer": "糾纏根鬚", "AUls": "蝗蟲群",
    "AOsw": "幽魂狼(召喚)", "Awfb": "火焰箭(球體)", "AIfb": "火焰球體", "AIlb": "閃電球體",
    "AIob": "黑蝕球體", "AHfa": "搜魂術(球體)", "AOcl": "閃電鏈", "AHbz": "暴風雪",
    "ANfd": "投擲酒桶", "AUan": "動物復生(召喚)", "AEfn": "自然之力(召喚)",
    "AUdc": "黑暗轉換", "AUin": "地獄火(召喚)", "ANsi": "沉默", "AUdr": "生命吸取",
    "AOmi": "劍刃風暴", "AEsf": "星辰墜落", "ANrf": "焰雨", "AHmt": "群體傳送",
    "AOwk": "疾風步", "AEsh": "影遁", "AOhx": "妖術", "ANfl": "火焰之雨",
}
ORB_BASES = {"Awfb", "AIfb", "AIlb", "AIob", "AHfa"}
SUMMON_BASES = {"AOsw", "AUan", "AEfn", "AUin", "ANfl"}

WAVE_PROJ = re.compile(r"wave|nova|breath|carrion", re.I)
KW_SUMMON = re.compile(r"招喚|召喚|招換")
KW_MORPH = re.compile(r"變身|型態|合體|進化|化身|變成")


def wc3col(v):
    """OBJECTS 的每等級欄 {'1': x, '2': y} → 'x/y' (全同則單值)。"""
    if not isinstance(v, dict):
        return "" if v is None else str(v)
    vals = [v[k] for k in sorted(v, key=lambda s: int(s) if str(s).isdigit() else 0)]
    uniq = {str(x) for x in vals}
    if len(uniq) == 1:
        vals = vals[:1]
    return "/".join(
        str(int(x)) if isinstance(x, float) and x == int(x) else str(x) for x in vals
    )


def fmt(v):
    if isinstance(v, list):
        return "/".join(str(int(x)) if float(x) == int(x) else str(x) for x in v)
    return "" if v is None else str(v)


def walk_effects(effs, out):
    for e in effs or []:
        out.append(e)
        if e.get("kind") == "spawnProjectile":
            walk_effects(e.get("onHit"), out)
    return out


rows = []
for p in sorted(ABIL.glob("godie-*.json")):
    d = json.loads(p.read_text())
    cid = d["id"].rsplit(".", 1)[0]
    slot = d.get("slot", d["id"].rsplit(".", 1)[1].upper())
    desc = d.get("description", "")
    effs = walk_effects(d.get("effects"), [])
    kinds = {e["kind"] for e in effs}
    psv = d.get("passive") or {}
    pranks = psv.get("ranks", [])
    has_aura = any(r.get("auras") for r in pranks)
    has_hook = any(r.get("hooks") for r in pranks)
    has_pmod = any(r.get("modifiers") for r in pranks)
    dmg = next((e for e in effs if e["kind"] == "damage"), None)
    proj = next((e for e in effs if e["kind"] == "spawnProjectile"), None)
    buff = next((e for e in effs if e["kind"] == "applyBuff"), None)
    status = next((e for e in effs if e["kind"] == "applyStatus"), None)
    dmg1 = (dmg or {}).get("amount", {}).get("perRank", [0])[0] if dmg else 0

    if KW_SUMMON.search(desc):
        cat, why = "招喚型", "描述含招喚/召喚"
    elif KW_MORPH.search(desc) and buff is not None and d.get("castType") == "self":
        cat, why = "變身型", "self+applyBuff且描述含變身詞"
    elif "dash" in kinds and dmg is not None:
        cat, why = "跳斬型", "dash+damage同施放"
    elif "dash" in kinds:
        cat, why = "衝刺型", "dash無傷害"
    elif proj is not None and WAVE_PROJ.search(proj.get("projectileId", "")):
        cat, why = "衝擊波型", f"投射物{proj['projectileId']}"
    elif proj is not None:
        cat, why = "飛彈型", f"投射物{proj['projectileId']}"
    elif has_aura:
        cat, why = "光環型", "passive.auras"
    elif has_hook:
        cat, why = "被動-觸發型", "passive.hooks"
    elif has_pmod:
        cat, why = "被動-屬性型", "passive.modifiers"
    elif kinds & {"heal", "shield", "restore"}:
        cat, why = "治療護盾型", "/".join(sorted(kinds & {"heal", "shield", "restore"}))
    elif status is not None and (dmg is None or dmg1 < 100):
        cat, why = "控場型", f"applyStatus {status.get('statusId')}"
    elif dmg is not None and (d.get("radius") or d.get("castType") == "ground"):
        cat, why = "範圍爆發型", f"AoE r={d.get('radius', '')}"
    elif dmg is not None:
        cat, why = "單體型", "targeted damage"
    elif buff is not None:
        cat, why = "自體強化型", "self applyBuff"
    else:
        cat, why = "其他", "effects空/純表現"

    ratios = ((dmg or {}).get("amount", {}) or {}).get("ratios", [])
    mods = (buff or {}).get("modifiers", []) if buff else []
    if not mods and has_pmod:
        mods = pranks[0].get("modifiers", [])

    # ── WC3/JASS 側 ──
    au = audit.get(d["id"], {})
    rawcode = au.get("rawcode") or ""
    base = au.get("base") or ""
    ob = objects.get(rawcode, {}) if rawcode else {}
    calls = (au.get("damage", {}) or {}).get("jass_damage_calls", []) or []
    jass_dmg = "; ".join(f"{c.get('fn', c.get('trigger', '?'))}:{c['line']}" for c in calls[:4])
    vfx_ax = au.get("vfx", {}) or {}
    models = vfx_ax.get("jass_models", []) or []
    dummies = vfx_ax.get("jass_dummy_units", []) or []
    snds = (au.get("sfx", {}) or {}).get("jass_sounds", []) or []
    snd_files = []
    for s in snds:
        b = sfx_bind.get(s, {})
        snd_files.append(f"{s}→{b.get('extracted_file') or b.get('wc3_path') or '?'}")
    special = []
    if base in ORB_BASES or "法球" in desc:
        special.append("球體/法球")
    if base == "AUls":
        special.append("蝗蟲群")
    if base in SUMMON_BASES:
        special.append("召喚基底")
    if base == "AEIl" or (KW_MORPH.search(desc) and d.get("castType") == "self"):
        special.append("變身基底" if base == "AEIl" else "")
    special = [s for s in special if s]

    rows.append(
        {
            "分類": cat,
            "英雄ID": cid,
            "英雄名": champ_names.get(cid, ""),
            "技能ID": d["id"],
            "欄位": slot,
            "技能名": d.get("name", ""),
            "施放型": d.get("castType", ""),
            "冷卻": fmt(d.get("cooldown")),
            "魔耗": fmt(d.get("manaCost")),
            "射程": d.get("range", ""),
            "半徑": d.get("radius", ""),
            "傷害perRank": fmt((dmg or {}).get("amount", {}).get("perRank")) if dmg else "",
            "傷害類型": (dmg or {}).get("damageType", "") if dmg else "",
            "加成": "+".join(f"{r['coeff']}×{r['stat']}" for r in ratios),
            "狀態": f"{status.get('statusId')}({status.get('duration')}s)" if status else "",
            # ⚠️ GH#789 —— modifier 的值是 **exclusive** 的：帶 `msBonusTier` 的節點
            #    **沒有** `value`（值在載入時由 resolveMsBonusTier 從共用表解析，
            #    第〇·四守則）。⛔ 直接 m['value'] 會 KeyError 而整支產生器死掉。
            #    ⇒ 級別在就印級別，⛔ 不要在這裡重算解析值（那會是第二個住處）。
            "增益": "; ".join(
                f"{m['stat']} {m['op']} " + str(m.get("value", m.get("msBonusTier", "?")))
                for m in mods
            ),
            "增益持續": (buff or {}).get("duration", "") if buff else "",
            "投射物": (proj or {}).get("projectileId", "") if proj else "",
            "施法時間": d.get("castTimeSec", ""),
            "GGD音效": d.get("sfxKey", ""),
            "GGD特效": d.get("vfxKey", ""),
            "rawcode": rawcode,
            "WC3基底": f"{base} {BASE_LABELS.get(base, '')}".strip(),
            "特殊機制": "; ".join(special),
            "WC3範圍": wc3col(ob.get("area")),
            "WC3持續": wc3col(ob.get("duration")),
            "WC3目標限制": wc3col(ob.get("targets_allowed")),
            "JASS觸發器": "; ".join(au.get("jass_triggers", []) or []),
            "JASS傷害呼叫": jass_dmg,
            "JASS特效模型": "; ".join(m.replace("\\\\", "\\") for m in models[:6]),
            "JASS替身單位": "; ".join(dummies),
            "WC3音效": "; ".join(snd_files),
            "判定依據": why,
        }
    )

order = [
    "衝刺型", "跳斬型", "衝擊波型", "飛彈型", "變身型", "招喚型", "範圍爆發型",
    "單體型", "控場型", "治療護盾型", "自體強化型", "光環型", "被動-屬性型",
    "被動-觸發型", "其他",
]

# ── 去重: 一個「技能」一列 (鍵 = rawcode; 無 rawcode 時用技能名) ──
# 同技能多英雄 → 英雄欄合併成清單; 各實例參數若不一致, 備註標出差異欄。
grouped: dict[str, dict] = {}
for r in rows:
    key = r["rawcode"] or f"name:{r['技能名']}"
    g = grouped.get(key)
    if g is None:
        r["英雄"] = f"{r['英雄名']}({r['欄位']})"
        r["實例ID"] = r["技能ID"]
        r["參數差異"] = ""
        grouped[key] = r
        continue
    g["英雄"] += f"; {r['英雄名']}({r['欄位']})"
    g["實例ID"] += f"; {r['技能ID']}"
    diffs = [
        c
        for c in ("傷害perRank", "冷卻", "魔耗", "增益", "狀態")
        if r[c] != g[c] and c not in g["參數差異"]
    ]
    if diffs:
        g["參數差異"] = "; ".join(filter(None, [g["參數差異"], *diffs]))
rows = list(grouped.values())
DROP = ("英雄ID", "英雄名", "技能ID")
KEEP_FIRST = ("分類", "技能名", "英雄", "實例ID")
for r in rows:
    for c in DROP:
        del r[c]
rows = [
    {**{c: r[c] for c in KEEP_FIRST}, **{k: v for k, v in r.items() if k not in KEEP_FIRST}}
    for r in rows
]
def skill_no_key(r):
    """依技能編號 NN-XX 排序: 英雄編號 → 2位尾碼(00 天生技,01-04) → 3位 EX(00X)。無編號者殿後。"""
    m = re.match(r"^(\d{2})-(\d{2,3})(?!\d)", r["技能名"])
    if not m:
        return (1, 999, 9, 999, r["技能名"])
    nn, xx = m.group(1), m.group(2)
    return (0, int(nn), len(xx), int(xx), r["技能名"])


rows.sort(key=skill_no_key)


# ── 行為模板: JASS_BEHAVIOR.json (309 筆細讀) × behavior_clusters.json (聚類定案) ──
# ⚠️ join 有兩條路,順序固定: ① rawcode ② 技能編號 NN-XX 前綴。
#    ⛔ 兩條都要 —— 258 筆裡有 36 筆的 rawcode 在細讀記錄裡是空的(觸發器叢集找得到、
#    物件編輯器對不上),只靠 rawcode 會靜默漏掉它們並把那 36 支誤判成「無觸發」。
def _num_key(name: str) -> str | None:
    m = re.match(r"^(\d{2})-(\d{2,3})(?!\d)", name or "")
    return m.group(0) if m else None


def _attach_behavior(rows: list[dict]) -> None:
    clusters = json.loads(CLUSTERS.read_text(encoding="utf-8"))["clusters"]
    by_raw: dict[str, dict] = {}
    by_num: dict[str, dict] = {}
    for s in json.loads(BEHAVIOR.read_text(encoding="utf-8"))["skills"]:
        if s.get("rawcode"):
            by_raw.setdefault(s["rawcode"], s)
        k = _num_key(s.get("skill_name", ""))
        if k:
            by_num.setdefault(k, s)
    for r in rows:
        s = by_raw.get(r["rawcode"]) if r["rawcode"] else None
        if s is None:
            s = by_num.get(_num_key(r["技能名"]) or "")
        r["JASS行為模板"] = clusters.get((s or {}).get("template", ""), NO_TRIGGER)
        for col, key in BEHAVIOR_COLS:
            r[col] = (s or {}).get(key) or ""


_attach_behavior(rows)


def build_rows() -> list[dict]:
    """CSV 的第 1–40 欄（分類 → 行為備註）。⛔ 落差分那兩欄是 score_gap 的。"""
    return rows


if __name__ == "__main__":  # pragma: no cover —— 單獨跑會洗掉別的欄, 一律走 gen.py
    from gen import main

    raise SystemExit(main())
