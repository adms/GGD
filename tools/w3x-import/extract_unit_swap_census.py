"""extract_unit_swap_census.py — EVERY unit-swap family in the map, task #208.

WHY THIS EXISTS (and why `extract_transform_forms.py` was not enough)
--------------------------------------------------------------------
`extract_transform_forms.py` reads exactly two w3a field codes — `Eme1`/`Emeu`,
the WC3 **Metamorphosis** pair — and finds 26 champion transforms. Its own
docstring then generalises from that: 「Every champion transform in GoDieEX22s
uses that one pattern」. That sentence is FALSE, and it hid a hero.

37 巴恩大魔王's 「37-04 魔界之王」 (`A01Z`) is a unit swap by any player-facing
definition — the hero disappears and a different unit with a different model,
different stats and a different ability list stands in its place — but its base
ability is **`ANef`**, Blizzard's Brewmaster 「Storm, Earth and Fire」 (Primal
Split), whose unit list lives in `Nef1`, not `Emeu`. No amount of loosening the
`Eme1`/`Emeu` search finds it, because it never writes those fields.

The earlier diagnosis (「the extractor has a hero filter, drop it and more pairs
appear」) was also wrong and was checked before this file was written: removing
the hero filter yields **0** additional pairs. The gap was never the filter. It
was reading ONE family and calling it 「every」.

WHAT A "UNIT SWAP" IS HERE, AND THE THREE SHAPES
------------------------------------------------
Rather than hand-list ability rawcodes, this classifies by the SHAPE of the
Blizzard base row in `out/stock/STOCK_ABILITIES.json` — so a family nobody
thought of still gets classified:

  A/metamorph  `DataA1` names a unit AND `UnitID1` names a unit
               → a two-way caster morph. `Eme1`→DataA1, `Emeu`→UnitID1.
               Metamorphosis (AEIl/AEme/AEvi), Bear/Raven/Stone/Avenger Form,
               Burrow, Submerge, Robo-Goblin (ANrg/ANg1..3), Phoenix (Aphx).
  B/one-way    `UnitID1` names a unit, `DataA1` does not
               → a SUMMON (Inferno, Raise Dead, Locust Swarm, Serpent Ward…)
               or a one-way conversion (Chaos Sca1..6, Tank Upgrade).
               The caster keeps its body, so these are NOT form changes.
  C/split      `DataA1` names TWO OR MORE units, no `UnitID1`
               → Primal Split: the caster is REMOVED and replaced by the listed
               units for a duration. ANef / Acef / ANdp.

A and C swap the CASTER. B does not. The map's 26 known transforms are all A;
the missing hero is the map's only gameplay C.

⚠️ FALSE POSITIVES ARE REAL AND ARE FILTERED. `areq` (tech requirements) holds
4-char rawcodes too and matched a naive "value looks like a unit id" scan on
`AHav`/`AEme`; only fields the STOCK ROW itself declares as unit-valued count.

WHAT THE CENSUS FOUND (the numbers this file pins)
--------------------------------------------------
  26  A/metamorph entries        — the known `Eme1`/`Emeu` pairs
   2  C/split entries            — `A01Z` 37-04 魔界之王, `A0SJ` 28-002 無限分裂
   3  JASS `ReplaceUnitBJ` sites — see below

and of the two C entries exactly ONE is live:

  `A01Z` 37-04 魔界之王 — on `Ubal`「(37)」巴恩大魔王's HERO ability list
      (`uhab`), and cast-handled in war3map.j. Its `Nef1` is written PER LEVEL,
      one unit each: lv1 `u001`, lv2 `u00D`, lv3 `u00E`. That is NOT Blizzard's
      "three images at once" — Blizzard writes the three in ONE comma list at
      level 1 (`npn1,npn2,npn3`). Three separate levels means three separate
      single-unit summons, and the three units confirm it: identical model and
      scale, `unsf` 「(LV1)」/「(LV2)」/「(LV3)」, and ability lists that GROW
      (3 → 4 → 5), exactly as the map's own tooltip promises. So this is a
      TIERED form: one body per skill rank, not a squad.

  `A0SJ` 28-002 無限分裂 — 5×`o02Q` (普烏, HeroBuu.mdl) at level 1, a real
      Primal Split — but it is DEAD CONTENT. Hero 28 魔人普烏 (`Huth`) carries a
      DIFFERENT ability also named 「28-002 無限分裂」 (`A0T5`, base `AHbh`
      Bash) in `uabi`, and its 分身 is `A03T` (base `AOmi`, Mirror Image) in
      `uhab`. `A0SJ` appears on NO unit's `uabi`/`uhab` and NOWHERE in
      war3map.j — a superseded draft. It is emitted with `live: false` so the
      count stays honest instead of being silently dropped.

JASS-DRIVEN SWAPS ARE COUNTED SEPARATELY AND ARE NOT GAMEPLAY
--------------------------------------------------------------
`ReplaceUnitBJ` appears 3 times, and all 3 are PLAYER-NAME-GATED easter eggs,
not abilities:
  * `-nico` → `O02P`「(99)」初音, gated on the player being "ericer" and playing
    `Opgh`「(32)」趙子龍 at level 1;
  * `-panda` → `H02K`「(89)」熊貓, gated on the player being "Saber_in_panda"
    and playing `E00R`「(59)」初號機 at level 1 (twice: an auto-swap on entering
    the map, disabled after 30s, plus the chat command).
Both targets already ship as ordinary champions, so nothing is missing; they are
recorded so a future reader does not re-discover them and mistake them for a
transform mechanic.

Output: out/GoDieEX22s-src/UNIT_SWAP_CENSUS.json.
Guards: tools/w3x-import/test/unit_swap_census_checks.py (mutation-verified).
"""

from __future__ import annotations

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from w3xlib.objdata import parse_object_file  # noqa: E402
from w3xlib.wts import parse_wts_blocks  # noqa: E402
from src_text import resolve, strip_codes  # noqa: E402

RAW_DIR = os.path.join(HERE, "out", "GoDieEX22s-src", "raw")
OUT_PATH = os.path.join(HERE, "out", "GoDieEX22s-src", "UNIT_SWAP_CENSUS.json")
STOCK_ABILITIES = os.path.join(HERE, "out", "stock", "STOCK_ABILITIES.json")
STOCK_UNITS = os.path.join(HERE, "out", "stock", "STOCK_UNITS.json")

# The two stock columns that can hold a unit rawcode on a swap ability.
STOCK_NORMAL_COL = "DataA1"
STOCK_ALTERNATE_COL = "UnitID1"

# A caster-swap in the map writes one of these w3a field codes. Kept as data so
# the classifier stays shape-driven; `Eme1`/`Emeu` are the A shape's codes and
# `Nef1` is the C shape's, both confirmed against the parsed w3a.
CASTER_SWAP_CODES = {"Eme1": "normal", "Emeu": "alternate", "Nef1": "split"}

_HERO_NUMBER = re.compile(r"^\(\s*(\d{2,3})\s*\)$")
_SUB_NAME_NUMBER = re.compile(r"\(\s*(\d{2,3})")

# war3map.j `ReplaceUnitBJ( <unit>, '<rawcode>', ...)`.
_REPLACE_UNIT = re.compile(r"ReplaceUnitBJ\s*\(\s*([^,]+?)\s*,\s*'([^']{4})'")
_FUNC = re.compile(r"^function\s+(\w+)")


def _entries(path: str, has_levels: bool) -> list:
    with open(path, "rb") as fh:
        tables = parse_object_file(fh.read(), has_levels)
    return tables["original"] + tables["custom"]


def _load_json(path: str, what: str) -> dict:
    """Missing stock data is FATAL — see extract_transform_forms.load_stock().

    A silent fallback here would classify every family as "unknown shape" and
    the census would report zero swaps while looking like it ran.
    """
    if not os.path.exists(path):
        raise SystemExit(
            f"FATAL: {path} is missing — regenerate the {what} table first.\n"
            "  (stock_ability_data.py / stock_unit_data.py, needs the retail MPQs)"
        )
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def classify_stock_bases(stock_ab: dict, unit_ids: set[str]) -> dict[str, dict]:
    """Every Blizzard base row that names a unit, tagged with its SHAPE.

    See the module docstring for what A/B/C mean. The `unit_ids` set is the
    filter that keeps `areq`-style rawcodes out: a value only counts when the
    stock row puts it in `DataA1`/`UnitID1` AND it resolves to a real unit.
    """
    def units_in(value) -> list[str]:
        if not isinstance(value, str):
            return []
        return [p.strip() for p in value.split(",")
                if len(p.strip()) == 4 and p.strip().upper() in unit_ids]

    out: dict[str, dict] = {}
    for alias, row in stock_ab.items():
        normal = units_in(row.get(STOCK_NORMAL_COL))
        alt = units_in(row.get(STOCK_ALTERNATE_COL))
        alt_id = alt[0] if alt else None
        if normal and alt_id:
            shape = "A/metamorph"
        elif alt_id and not normal:
            shape = "B/one-way"
        elif len(normal) >= 2:
            shape = "C/split"
        else:
            continue
        out[alias] = {
            "shape": shape,
            "swapsCaster": shape != "B/one-way",
            "comments": row.get("comments"),
            "stockNormal": normal,
            "stockAlternate": alt_id,
        }
    return out


def scan_jass_replacements(jass_path: str) -> list[dict]:
    """Every `ReplaceUnitBJ` call site with the function that contains it."""
    if not os.path.exists(jass_path):
        return []
    with open(jass_path, encoding="utf-8", errors="replace") as fh:
        lines = fh.read().split("\n")
    sites: list[dict] = []
    current = None
    for idx, line in enumerate(lines):
        fn = _FUNC.match(line)
        if fn:
            current = fn.group(1)
        m = _REPLACE_UNIT.search(line)
        if m:
            sites.append({
                "line": idx + 1,
                "function": current,
                "targetRawcode": m.group(2),
                "subject": m.group(1).strip(),
            })
    return sites


def build() -> dict:
    stock_ab = _load_json(STOCK_ABILITIES, "stock ability")["abilities"]
    stock_un = _load_json(STOCK_UNITS, "stock unit")["units"]

    abilities = _entries(os.path.join(RAW_DIR, "war3map.w3a"), True)
    units = _entries(os.path.join(RAW_DIR, "war3map.w3u"), False)
    with open(os.path.join(RAW_DIR, "war3map.wts"), "rb") as fh:
        strings = parse_wts_blocks(fh.read())[0]

    by_unit = {u.obj_id.upper(): u for u in units}
    unit_ids = set(by_unit) | {k.upper() for k in stock_un}
    bases = classify_stock_bases(stock_ab, unit_ids)

    def text(value):
        if not isinstance(value, str):
            return None
        return strip_codes(resolve(value, strings)).strip() or None

    # ---- who owns which ability -------------------------------------------
    owners: dict[str, list[dict]] = {}
    for u in units:
        for slot in ("uabi", "uhab"):
            for code in str(u.get(slot) or "").split(","):
                code = code.strip()
                if not code:
                    continue
                owners.setdefault(code.upper(), []).append({
                    "unitRawcode": u.obj_id,
                    "slot": slot,
                    "subName": text(u.get("unsf")),
                    "properName": text(u.get("upro")),
                    "unitName": text(u.get("unam")),
                })

    jass_path = os.path.join(RAW_DIR, "war3map.j")
    jass_text = ""
    if os.path.exists(jass_path):
        with open(jass_path, encoding="utf-8", errors="replace") as fh:
            jass_text = fh.read()

    def unit_view(rawcode: str) -> dict:
        u = by_unit.get(rawcode.upper())
        return {
            "rawcode": rawcode,
            "championId": f"godie-{rawcode.lower()}",
            "inW3u": u is not None,
            "subName": text(u.get("unsf")) if u else None,
            "unitName": text(u.get("unam")) if u else None,
            "properName": text(u.get("upro")) if u else None,
            "model": u.get("umdl") if u else None,
            "scale": u.get("usca") if u else None,
            "selectionScale": u.get("ussc") if u else None,
            "moveSpeed": u.get("umvs") if u else None,
            "level": u.get("ulev") if u else None,
            "maxHealth": u.get("uhpm") if u else None,
            "healthRegen": u.get("uhpr") if u else None,
            "maxMana": u.get("umpm") if u else None,
            "manaRegen": u.get("umpr") if u else None,
            "armor": u.get("udef") if u else None,
            "armorType": u.get("udty") if u else None,
            "attackDamageBase": u.get("ua1b") if u else None,
            "attackDice": u.get("ua1d") if u else None,
            "attackSides": u.get("ua1s") if u else None,
            "attackCooldown": u.get("ua1c") if u else None,
            "attackRange": u.get("ua1r") if u else None,
            "attackType": u.get("ua1t") if u else None,
            # uclr/uclg/uclb is the WC3 vertex tint; ABSENT means untinted, and
            # that is a fact — never write [1,1,1] for "we did not look".
            "tint": None if u is None or u.get("uclr") is None else [
                u.get("uclr"), u.get("uclg"), u.get("uclb"),
            ],
            "abilities": [c for c in str(u.get("uabi") or "").split(",") if c] if u else [],
            "heroAbilities": [c for c in str(u.get("uhab") or "").split(",") if c] if u else [],
            "baseId": u.base_id if u else None,
        }

    def ability_view(rawcode: str) -> dict | None:
        for e in abilities:
            if e.obj_id.upper() == rawcode.upper():
                return {
                    "rawcode": e.obj_id,
                    "base": e.base_id,
                    "name": text(e.get("anam")),
                    "tooltip": text(e.get("aub1", 1)),
                }
        return None

    # ---- the census --------------------------------------------------------
    metamorph: list[dict] = []
    splits: list[dict] = []
    summons = 0

    for e in abilities:
        base = bases.get(e.base_id)
        if base is None:
            continue
        written = {c: e.levels(c) for c in CASTER_SWAP_CODES}
        # `swapsCaster` is the ONE question that decides the branch — read, not
        # re-derived from the shape string. Both were computed in
        # `classify_stock_bases` and a second `shape == "B/one-way"` test here
        # let the two drift: flipping `swapsCaster` on every family left every
        # guard green because nothing consumed it (task #208 mutation M7).
        if not base["swapsCaster"]:
            summons += 1
            continue
        if not any(written.values()):
            # a caster-swap base that writes no swap field of its own: it
            # inherits the stock pair, so there is nothing map-specific here.
            continue

        name = text(e.get("anam"))
        owns = owners.get(e.obj_id.upper(), [])
        # LEVEL 1 ONLY for the A shape — cloned entries keep the donor's
        # rawcodes on levels 2-4 (see extract_transform_forms.py).
        if base["shape"] == "A/metamorph":
            normal = e.get("Eme1", 1)
            alternate = e.get("Emeu", 1)
            if not normal or not alternate:
                continue
            metamorph.append({
                "abilityRawcode": e.obj_id,
                "abilityBase": e.base_id,
                "abilityName": name,
                "normalUnit": unit_view(str(normal)),
                "alternateUnit": unit_view(str(alternate)),
            })
            continue

        # C/split — the caster is replaced by the listed unit(s).
        per_level = written["Nef1"]
        forms: list[dict] = []
        for level in sorted(per_level):
            listed = [p.strip() for p in str(per_level[level]).split(",") if p.strip()]
            forms.append({
                "level": level,
                "unitsPerCast": len(listed),
                "units": [unit_view(rc) for rc in dict.fromkeys(listed)],
            })
        # `live` = the map actually gives this to somebody. An orphan is data
        # the author abandoned; counting it as a shipped transform is a lie.
        referenced_in_jass = f"'{e.obj_id}'" in jass_text
        caster = None
        sub = ""
        for o in owns:
            if o["slot"] == "uhab" or caster is None:
                caster = o
                sub = o.get("subName") or ""
        match = _HERO_NUMBER.match(sub.strip()) or _SUB_NAME_NUMBER.search(sub)
        splits.append({
            "abilityRawcode": e.obj_id,
            "abilityBase": e.base_id,
            "abilityName": name,
            "heroNumber": match.group(1) if match else None,
            "levelCount": e.get("alev"),
            "durationSecByLevel": {
                str(k): round(float(v), 4) for k, v in e.levels("ahdu").items()
                if isinstance(v, (int, float)) and v > 0
            },
            "cooldownSecByLevel": {
                str(k): round(float(v), 4) for k, v in e.levels("acdn").items()
                if isinstance(v, (int, float)) and v > 0
            },
            "manaCostByLevel": {
                str(k): round(float(v), 4) for k, v in e.levels("amcs").items()
                if isinstance(v, (int, float)) and v > 0
            },
            "casterUnits": owns,
            "live": bool(owns) or referenced_in_jass,
            "referencedInJass": referenced_in_jass,
            "formsByLevel": forms,
            "formAbilityDetail": {
                rc: ability_view(rc)
                for f in forms for u in f["units"]
                for rc in (u["abilities"] + u["heroAbilities"])
            },
        })

    metamorph.sort(key=lambda p: p["abilityRawcode"])
    splits.sort(key=lambda p: p["abilityRawcode"])

    jass = scan_jass_replacements(jass_path)
    for site in jass:
        site["target"] = unit_view(site["targetRawcode"])

    families = {
        alias: {k: v for k, v in row.items() if k != "stockNormal"}
        for alias, row in sorted(bases.items())
    }
    return {
        "schema": "w3x-unit-swap-census@1",
        "source": "src_gogodieEX227s.w3x — war3map.{w3a,w3u,wts,j} + out/stock/STOCK_*.json",
        "generatedBy": "tools/w3x-import/extract_unit_swap_census.py",
        "method": (
            "classify each w3a entry by the SHAPE of its Blizzard base row: "
            "A/metamorph = DataA1 and UnitID1 both name units (two-way caster "
            "morph); B/one-way = UnitID1 only (a summon — the caster keeps its "
            "body); C/split = DataA1 names 2+ units (Primal Split — the caster "
            "is replaced). A and C swap the caster; B does not."
        ),
        "counts": {
            "stockSwapShapedBases": len(bases),
            "metamorphEntries": len(metamorph),
            "splitEntries": len(splits),
            "splitEntriesLive": sum(1 for s in splits if s["live"]),
            "summonEntries": summons,
            "jassReplaceUnitSites": len(jass),
        },
        "metamorphEntries": metamorph,
        "splitEntries": splits,
        "jassReplaceUnitSites": jass,
        "stockFamilies": families,
    }


def main() -> None:
    doc = build()
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    c = doc["counts"]
    print(
        f"{c['metamorphEntries']} metamorph + {c['splitEntries']} split "
        f"({c['splitEntriesLive']} live) + {c['jassReplaceUnitSites']} JASS "
        f"replace sites -> {OUT_PATH}"
    )


if __name__ == "__main__":
    main()
