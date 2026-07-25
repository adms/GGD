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

Regenerate: python3 tools/ability-templates/classify_templates.py
"""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ABIL = ROOT / "content" / "abilities"
CHAMPS = ROOT / "content" / "champions"
OUT = ROOT / "docs" / "ability-templates.csv"

champ_names = {
    p.stem: json.loads(p.read_text()).get("name", p.stem) for p in CHAMPS.glob("godie-*.json")
}

WAVE_PROJ = re.compile(r"wave|nova|breath|carrion", re.I)
KW_SUMMON = re.compile(r"招喚|召喚|招換")
KW_MORPH = re.compile(r"變身|型態|合體|進化|化身|變成")


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
            "增益": "; ".join(f"{m['stat']} {m['op']} {m['value']}" for m in mods),
            "增益持續": (buff or {}).get("duration", "") if buff else "",
            "投射物": (proj or {}).get("projectileId", "") if proj else "",
            "施法時間": d.get("castTimeSec", ""),
            "音效": d.get("sfxKey", ""),
            "特效": d.get("vfxKey", ""),
            "判定依據": why,
        }
    )

order = [
    "衝刺型", "跳斬型", "衝擊波型", "飛彈型", "變身型", "招喚型", "範圍爆發型",
    "單體型", "控場型", "治療護盾型", "自體強化型", "光環型", "被動-屬性型",
    "被動-觸發型", "其他",
]
rows.sort(key=lambda r: (order.index(r["分類"]), r["英雄ID"], r["欄位"]))
OUT.parent.mkdir(exist_ok=True)
with OUT.open("w", newline="", encoding="utf-8-sig") as f:  # BOM: Excel 中文
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)

from collections import Counter

counts = Counter(r["分類"] for r in rows)
print(f"{len(rows)} abilities -> {OUT.relative_to(ROOT)}")
for c in order:
    if counts[c]:
        print(f"  {c}: {counts[c]}")
