#!/usr/bin/env python3
"""Extract the authoritative hero -> "EX 技能" mapping from GoDieEX22s.w3x.

THE MECHANIC (reverse-engineered from raw/scripts__war3map.j):
  Every hero's EX ability is ALREADY placed on the hero unit, but GATED behind
  the ability "Requirements" (field code `areq`) referencing the research tech
  `R00R`. When a hero reaches LEVEL 30 the JASS trigger `Nz`/`Bz` fires:
      Nz: return (GetUnitLevel(GetTriggerUnit())>=30) and (QR[pid]==false)
      Bz: set QR[pid]=true ; call SetPlayerTechResearchedSwap('R00R',1,player)
  Researching R00R satisfies the requirement, so the R00R-gated ability on that
  hero becomes castable. So "EX 技能" = a PER-HERO ability unlocked at level 30;
  NOT every hero has one.

EXTRACTION:
  1. Parse war3map.w3a; collect ability rawcodes whose `areq` value contains
     'R00R'  (== the level-30 EX gate).
  2. Parse war3map.w3u; for every unit collect its ability list (`uabi` normal
     + `uhab` hero abilities).
  3. For each GGD champion (content/champions/godie-<rawcode>.json) look up its
     source unit (case-insensitive rawcode match) and intersect its ability list
     with the R00R set. The intersection is that hero's EX ability(ies); the
     PRIMARY one is the ability whose map name is the `NN-002` EX slot.

OUTPUT: out/GoDieEX22s/EX_MAP.json
  { "unlockTech": "R00R", "unlockLevel": 30,
    "heroes": { "godie-e001": {heroRawcode, exAbility, nameZh, heroNameZh, allR00R} },
    "withoutEx": [ "godie-e012", ... ] }

Reuses w3xlib.objdata.parse_object_file. Run:  python3 tools/w3x-import/extract_ex.py
"""
from __future__ import annotations

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from w3xlib.objdata import parse_object_file, all_entries  # noqa: E402

OUT = os.path.join(HERE, "out", "GoDieEX22s")
RAW = os.path.join(OUT, "raw")
CHAMP_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "content", "champions"))

UNLOCK_TECH = "R00R"
UNLOCK_LEVEL = 30


def r00r_gated_abilities() -> tuple[set[str], dict[str, str]]:
    """(rawcodes whose Requirements `areq` reference R00R, rawcode -> `aart` icon path).

    The aart map feeds the icon pipeline (extract_icons.py / docs/todo/icons.md):
    recording it here keeps EX_MAP.json self-sufficient for regeneration."""
    w3a = parse_object_file(open(os.path.join(RAW, "war3map.w3a"), "rb").read(), has_levels=True)
    gated: set[str] = set()
    aart: dict[str, str] = {}
    for e in all_entries(w3a):
        for m in e.mods:
            if m.code == "areq" and isinstance(m.value, str) and UNLOCK_TECH in m.value:
                gated.add(e.obj_id)
            if m.code == "aart" and isinstance(m.value, str) and m.value.strip():
                aart[e.obj_id] = m.value.strip()  # last-writer-wins
    return gated, aart


def unit_ability_lists() -> dict[str, list[str]]:
    """unitRawcode -> its ability list (uabi normal + uhab hero), de-duped."""
    w3u = parse_object_file(open(os.path.join(RAW, "war3map.w3u"), "rb").read(), has_levels=False)
    out: dict[str, list[str]] = {}
    for e in all_entries(w3u):
        codes: list[str] = []
        for m in e.mods:
            if m.code in ("uabi", "uhab") and isinstance(m.value, str) and m.value:
                codes += [c for c in m.value.split(",") if c]
        if codes:
            out[e.obj_id] = list(dict.fromkeys(codes))
    return out


def champion_ids() -> list[str]:
    return sorted(
        f[:-5]
        for f in os.listdir(CHAMP_DIR)
        if f.startswith("godie-") and f.endswith(".json")
    )


def build() -> dict:
    gated, aart = r00r_gated_abilities()
    units = unit_ability_lists()
    units_ci = {k.lower(): v for k, v in units.items()}

    abils = json.load(open(os.path.join(OUT, "parsed", "abilities.json")))
    heroes = json.load(open(os.path.join(OUT, "parsed", "heroes.json")))
    heroes_ci = {k.lower(): v for k, v in heroes.items()}

    def ability_name(a: str) -> str:
        return abils.get(a, {}).get("name") or "(未命名)"

    def hero_name(rawlc: str) -> str:
        h = heroes_ci.get(rawlc, {})
        return h.get("proper_name") or h.get("name") or "?"

    def primary_score(a: str):
        # Prefer the exact `NN-002` EX slot token over `NN-002x`/`NN-001` variants.
        nm = ability_name(a)
        head = nm.split()[0] if nm.split() else ""
        return (0 if re.match(r"^\d+-002$", head) else 1, nm)

    heroes_out: dict[str, dict] = {}
    without: list[str] = []
    for cid in champion_ids():
        rawlc = cid.split("godie-", 1)[1]
        owned = units_ci.get(rawlc)
        if not owned:
            h = heroes_ci.get(rawlc, {})
            owned = list(h.get("abilities", []) or []) + list(h.get("hero_abilities", []) or [])
        ex = [a for a in owned if a in gated]
        if not ex:
            without.append(cid)
            continue
        primary = sorted(ex, key=primary_score)[0]
        heroes_out[cid] = {
            "heroRawcode": rawlc,
            "heroNameZh": hero_name(rawlc),
            "exAbility": primary,
            "nameZh": ability_name(primary),
            # WC3 icon path (`aart`) of the EX ability; None = never overridden
            # (stock default). Whether it is ORIGINAL art is decided by archive
            # membership in extract_icons.py, which writes the PNG that
            # gen_ex_content.py's `icon` emission keys off.
            "aart": aart.get(primary),
            "allR00R": ex,
        }
    return {
        "unlockTech": UNLOCK_TECH,
        "unlockLevel": UNLOCK_LEVEL,
        "totalR00RAbilities": len(gated),
        "championsWithEx": len(heroes_out),
        "championsWithoutEx": len(without),
        "heroes": heroes_out,
        "withoutEx": without,
    }


def main() -> None:
    result = build()
    dest = os.path.join(OUT, "EX_MAP.json")
    with open(dest, "w", encoding="utf-8") as fh:
        json.dump(result, fh, ensure_ascii=False, indent=2)
    print(f"R00R-gated abilities : {result['totalR00RAbilities']}")
    print(f"champions WITH EX    : {result['championsWithEx']}")
    print(f"champions WITHOUT EX : {result['championsWithoutEx']}  {result['withoutEx']}")
    print(f"wrote {dest}")


if __name__ == "__main__":
    main()
