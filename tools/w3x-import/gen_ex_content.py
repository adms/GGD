#!/usr/bin/env python3
"""Generate GGD content for the per-hero "EX 技能" abilities.

Consumes out/GoDieEX22s/EX_MAP.json (from extract_ex.py) + parsed/abilities.json
and produces, for each champion that has an EX ability:

  * content/abilities/godie-<rawcode>.ex.json  — a standalone ability@1 doc with
    slot "EX", maxRank 1 (EX is UNLOCKED as a single power, not leveled), real
    Chinese map name, cleaned cooldown/mana/range/radius from the w3a data, and
    ONE primary EffectDef chosen by a base-ability/keyword heuristic.
  * sets  "exAbility": "godie-<rawcode>.ex"  on content/champions/godie-<rawcode>.json

Fidelity note (see docs/todo/ex-skills.md): the effect NUMBERS are approximated
to the arena's balance the same way the base Q/W/E/R port is — offensive EX map
to a magic nuke, self/buff EX map to a timed stat buff, control EX add a status.
A curated table carries the hand-read numbers for the marquee EX skills.

Run:  python3 tools/w3x-import/gen_ex_content.py   (idempotent; re-runnable)
"""
from __future__ import annotations

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out", "GoDieEX22s")
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ABILITY_DIR = os.path.join(ROOT, "content", "abilities")
CHAMP_DIR = os.path.join(ROOT, "content", "champions")

WC3_TO_GGD = 1.0 / 85.0  # matches the base-ability port's distance factor
VFX = "fx.ember-bolt-cast"  # shared soft-ref VFX used by every ported godie skill

# Curated marquee EX skills — hand-read numbers/behaviour from EX_SKILLS.md.
# rawcode -> partial override dict (merged over the heuristic result).
CURATED: dict[str, dict] = {
    "A0SP": {"kind": "buff", "stat": "ad", "op": "pctAdd", "value": 0.6, "duration": 6.0},   # 解放.約束勝利劍MAX
    "A0FP": {"kind": "nuke", "castType": "ground", "amount": 600, "radius": 4.1, "castTime": 0.4},  # 奧義˙蒼龍破
    "ANr3": {"kind": "nuke", "castType": "ground", "amount": 350, "radius": 4.1, "castTime": 0.5},  # 究極魔法流星雨
    "A00D": {"kind": "control", "castType": "ground", "amount": 250, "radius": 4.7, "status": "slow40", "ms": 0.65, "sdur": 6.0},  # 火雲掌
    "A10Q": {"kind": "nuke", "castType": "skillshot", "amount": 325, "radius": 1.0, "range": 10.6},  # 絕空斬
    "A0SO": {"kind": "nuke", "castType": "ground", "amount": 900, "radius": 6.0, "castTime": 0.6},  # 究極暴走黑龍波
    "A0SD": {"kind": "buff", "stat": "armor", "op": "flat", "value": 500, "duration": 5.0},   # 絕對屏障 (near-invuln)
    "A0DJ": {"kind": "control", "castType": "targeted", "amount": 333, "status": "burnstun", "stun": True, "sdur": 1.0},  # 金色的神風
}

# stats that are safe to buff (mirror sim StatBlock keys used elsewhere)
BUFF_DEFAULT = {"stat": "ad", "op": "pctAdd", "value": 0.35, "duration": 6.0}


def _nums(d) -> list[float]:
    if not isinstance(d, dict):
        return []
    out = []
    for v in d.values():
        if isinstance(v, (int, float)):
            out.append(float(v))
    return out


def clean_scalar(d, lo: float, hi: float, default: float) -> float:
    vals = [v for v in _nums(d) if lo <= v <= hi]
    if not vals:
        return default
    # WC3 higher levels carry the "full" value; take the max sane one.
    return max(vals)


def keywords(a: dict) -> str:
    return " ".join(
        str(a.get(k, "")) for k in ("name", "description", "research_tip", "tooltip")
    )


def heuristic(rawcode: str, a: dict) -> dict:
    """Classify an EX ability into a castable ability@1 doc (pre-curation)."""
    text = keywords(a)
    wc3_range = clean_scalar(a.get("range"), 1, 2000, 0)
    wc3_area = clean_scalar(a.get("area"), 1, 1500, 0)
    cd = clean_scalar(a.get("cooldown"), 1, 300, 60.0)
    mana = clean_scalar(a.get("mana"), 1, 2000, 120.0)

    offensive = any(k in text for k in ("傷害", "斬", "波", "破", "爆", "殞", "彈", "拳", "射", "雷", "炎", "焰", "斃", "殺", "刃"))
    control = any(k in text for k in ("減速", "暈", "定身", "束縛", "禁", "麻痺", "冰凍"))
    passive = ("[被動]" in text) or ("被動" in text)

    ggd_range = round(wc3_range * WC3_TO_GGD, 2)
    ggd_area = round(wc3_area * WC3_TO_GGD, 2)

    doc = {
        "cooldown": round(cd, 1),
        "manaCost": round(mana),
        "range": ggd_range,
        "radius": ggd_area if ggd_area > 0 else None,
        "castTime": 0.0,
        "effects": [],
        "targetsEnemies": None,
    }

    if (offensive or control) and not passive and wc3_range > 0:
        # active EX with a reach -> a magic nuke (+ optional control)
        doc["castType"] = "ground" if wc3_area > 0 else "targeted"
        if doc["castType"] == "ground" and not doc["radius"]:
            doc["radius"] = 4.0
        doc["targetsEnemies"] = True
        doc["effects"].append({
            "kind": "damage", "damageType": "magic",
            "amount": {"flat": 300},
        })
        if control:
            doc["effects"].append({
                "kind": "applyStatus", "statusId": "slow40",
                "duration": 3.0, "moveSpeedMult": 0.6,
            })
        if wc3_area > 0:
            doc["castTime"] = 0.35  # AoE nukes get a wind-up (exercises cast time)
    else:
        # self / passive-turned-active EX -> a timed stat buff on the caster
        doc["castType"] = "self"
        doc["range"] = 0
        doc["radius"] = None
        doc["effects"].append({
            "kind": "applyBuff",
            "modifiers": [{"stat": BUFF_DEFAULT["stat"], "op": BUFF_DEFAULT["op"], "value": BUFF_DEFAULT["value"]}],
            "duration": BUFF_DEFAULT["duration"],
        })
    return doc


def apply_curated(doc: dict, cur: dict) -> dict:
    doc = dict(doc)
    if cur["kind"] == "buff":
        doc["castType"] = "self"; doc["range"] = 0; doc["radius"] = None; doc["targetsEnemies"] = None
        doc["effects"] = [{
            "kind": "applyBuff",
            "modifiers": [{"stat": cur["stat"], "op": cur["op"], "value": cur["value"]}],
            "duration": cur["duration"],
        }]
        doc["castTime"] = 0.0
    elif cur["kind"] == "nuke":
        doc["castType"] = cur["castType"]; doc["targetsEnemies"] = True
        doc["radius"] = cur.get("radius")
        if "range" in cur:
            doc["range"] = cur["range"]
        doc["effects"] = [{"kind": "damage", "damageType": "magic", "amount": {"flat": cur["amount"]}}]
        doc["castTime"] = cur.get("castTime", 0.0)
    elif cur["kind"] == "control":
        doc["castType"] = cur["castType"]; doc["targetsEnemies"] = True
        doc["radius"] = cur.get("radius")
        eff = [{"kind": "damage", "damageType": "magic", "amount": {"flat": cur["amount"]}}]
        st = {"kind": "applyStatus", "statusId": cur["status"], "duration": cur.get("sdur", 2.0)}
        if cur.get("ms"):
            st["moveSpeedMult"] = cur["ms"]
        if cur.get("stun"):
            st["stun"] = True
        eff.append(st)
        doc["effects"] = eff
        doc["castTime"] = cur.get("castTime", 0.0)
    return doc


def build_ability_doc(cid: str, rawcode: str, exraw: str, name: str, a: dict) -> dict:
    doc = heuristic(exraw, a)
    if exraw in CURATED:
        doc = apply_curated(doc, CURATED[exraw])

    # Original w3x icon (docs/todo/icons.md): extract_icons.py converts the EX
    # ability's `aart` BLP (recorded in EX_MAP.json) to this PNG when — and only
    # when — the art lives inside the map archive. Emit the field only if the
    # PNG exists so regeneration NEVER fabricates a ref (stock art = no icon).
    icon_rel = f"assets/icons/abilities/godie-{rawcode}.ex.png"
    has_icon = os.path.exists(os.path.join(ROOT, "content", icon_rel))

    out = {
        "id": f"godie-{rawcode}.ex",
        "name": name,
        **({"icon": icon_rel} if has_icon else {}),
        "slot": "EX",
        "castType": doc["castType"],
        "maxRank": 1,
        "cooldown": [doc["cooldown"]],
        "manaCost": [float(doc["manaCost"])],
        "range": doc["range"],
        "effects": doc["effects"],
        "vfxKey": VFX,
        "schema": "ability@1",
    }
    if doc.get("radius"):
        out["radius"] = doc["radius"]
    if doc.get("targetsEnemies"):
        out["targetsEnemies"] = True
    if doc.get("castTime", 0) > 0:
        out["castTimeSec"] = doc["castTime"]
    return out


def main() -> None:
    exmap = json.load(open(os.path.join(OUT, "EX_MAP.json")))
    abils = json.load(open(os.path.join(OUT, "parsed", "abilities.json")))

    written = 0
    for cid, info in sorted(exmap["heroes"].items()):
        rawcode = cid.split("godie-", 1)[1]
        exraw = info["exAbility"]
        name = info["nameZh"]
        a = abils.get(exraw, {})
        ability_doc = build_ability_doc(cid, rawcode, exraw, name, a)

        ability_path = os.path.join(ABILITY_DIR, f"godie-{rawcode}.ex.json")
        with open(ability_path, "w", encoding="utf-8") as fh:
            json.dump(ability_doc, fh, ensure_ascii=False, indent=2)

        # patch the champion doc: add exAbility (idempotent, preserves field order)
        champ_path = os.path.join(CHAMP_DIR, f"{cid}.json")
        champ = json.load(open(champ_path, encoding="utf-8"))
        champ["exAbility"] = f"godie-{rawcode}.ex"
        with open(champ_path, "w", encoding="utf-8") as fh:
            json.dump(champ, fh, ensure_ascii=False, indent=2)
        written += 1

    # ensure the 3 EX-less champions carry NO exAbility (idempotent cleanup)
    for cid in exmap["withoutEx"]:
        champ_path = os.path.join(CHAMP_DIR, f"{cid}.json")
        champ = json.load(open(champ_path, encoding="utf-8"))
        if "exAbility" in champ:
            del champ["exAbility"]
            with open(champ_path, "w", encoding="utf-8") as fh:
                json.dump(champ, fh, ensure_ascii=False, indent=2)

    print(f"wrote {written} EX ability docs + set exAbility on {written} champions")
    print(f"left {len(exmap['withoutEx'])} champions without EX: {exmap['withoutEx']}")


if __name__ == "__main__":
    main()
