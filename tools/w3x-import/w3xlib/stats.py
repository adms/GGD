"""Stage 2 — structured stats out of the object data + wts strings.

Produces parsed/{units,heroes,abilities,items}.json with every TRIGSTR
resolved to its (Chinese) text. Values are kept RAW (WC3 numbers); the draft
generator (drafts.py) applies the documented rescaling to GGD units.
"""

from __future__ import annotations

import json
import os

from .objdata import parse_object_file, all_entries, data_columns, raw_mods, ObjEntry
from .wts import parse_wts, resolve

# The 4-char field codes each record reads into a TYPED field. Every code NOT
# in these sets used to be dropped; it is now carried through under `rawMods`
# (see objdata.raw_mods). Keep each set in sync with the `e.get(...)` reads in
# the matching builder below — a code here that is not read just stays absent
# (harmless), a read code missing here merely gets duplicated into rawMods.
ABILITY_FIELD_CODES = frozenset({
    "anam", "atp1", "aub1", "arut", "alev",
    "acdn", "amcs", "aran", "aare", "adur", "ahdu",
})  # ability data columns are handled separately (skip_data_columns=True)
UNIT_FIELD_CODES = frozenset({
    "unam", "upro", "utip", "utub", "umdl",
    "uhpm", "umpm", "uhpr", "umpr", "umvs", "usca", "udef",
    "ua1r", "ua1c", "ua1b", "ua1d", "ua1s",
    "ustr", "uagi", "uint", "ustp", "uagp", "uinp", "upra",
    "uabi", "uhab", "ugol",
    # ART TINT (task #263). `uclr/uclg/uclb` = Art Red/Green/Blue Tint, 0..255,
    # WC3 default 255. Left out of every whitelist until now, so the map's
    # per-unit vertex colour never reached `parsed/` at all and #49 had to
    # recover it by hand. NOTE these are the ENTRY's own mods only: an absent
    # channel means INHERIT (base entry -> stock UnitUI.slk -> 255), never 0 —
    # `resolve_unit_tints.py` owns that chain.
    "uclr", "uclg", "uclb",
})
ITEM_FIELD_CODES = frozenset({
    "unam", "utip", "utub", "ides", "igol", "ilum", "iabi", "iico",
})


def _res(entry: ObjEntry, code: str, wts: dict, level: int | None = None):
    return resolve(entry.get(code, level), wts)


def _levels(entry: ObjEntry, code: str, wts: dict) -> dict[int, object]:
    return {lv: resolve(v, wts) for lv, v in entry.levels(code).items()}


def parse_all(raw_dir: str) -> dict:
    def rd(name: str) -> bytes | None:
        p = os.path.join(raw_dir, name)
        return open(p, "rb").read() if os.path.exists(p) else None

    wts = parse_wts(rd("war3map.wts") or b"")
    w3u = parse_object_file(rd("war3map.w3u"), False)
    w3t = parse_object_file(rd("war3map.w3t"), False)
    w3a = parse_object_file(rd("war3map.w3a"), True)

    abilities = {}
    for e in all_entries(w3a):
        # Columns come from the file's own dataColumn header — see
        # objdata.data_columns() for why inferring them from the code is wrong.
        data_cols = data_columns(e)
        abilities[e.obj_id] = {
            "id": e.obj_id,
            "base": e.base_id,
            "name": _res(e, "anam", wts),
            "tooltip": _res(e, "atp1", wts, 1),
            "description": _res(e, "aub1", wts, 1),
            "research_tip": _res(e, "arut", wts),
            "levels": e.get("alev"),
            "cooldown": _levels(e, "acdn", wts),
            "mana": _levels(e, "amcs", wts),
            "range": _levels(e, "aran", wts),
            "area": _levels(e, "aare", wts),
            "duration": _levels(e, "adur", wts),
            "hero_duration": _levels(e, "ahdu", wts),
            "data": {str(c): {str(l): v for l, v in lv.items()}
                     for c, lv in sorted(data_cols.items())},
            # everything the whitelist above does not name, kept verbatim so no
            # w3a field is lost (data columns already live in `data`, skipped)
            "rawMods": raw_mods(e, ABILITY_FIELD_CODES,
                                resolve=lambda v: resolve(v, wts),
                                skip_data_columns=True),
        }

    def unit_rec(e: ObjEntry) -> dict:
        return {
            "id": e.obj_id,
            "base": e.base_id,
            "name": _res(e, "unam", wts),
            "proper_name": _res(e, "upro", wts),
            "tooltip": _res(e, "utip", wts),
            "description": _res(e, "utub", wts),
            "model": e.get("umdl"),
            "hp": e.get("uhpm"),
            "mana": e.get("umpm"),
            "hp_regen": e.get("uhpr"),
            "mana_regen": e.get("umpr"),
            "move_speed": e.get("umvs"),
            # 'usca' = the unit's Scaling Value (visual model scale the map
            # author set); drives per-hero size in the model docs (drafts).
            "scale": e.get("usca"),
            "armor": e.get("udef"),
            "attack_range": e.get("ua1r"),
            "attack_cooldown": e.get("ua1c"),
            "dmg_base": e.get("ua1b"),
            "dmg_dice": e.get("ua1d"),
            "dmg_sides": e.get("ua1s"),
            "str": e.get("ustr"), "agi": e.get("uagi"), "int": e.get("uint"),
            "str_growth": e.get("ustp"), "agi_growth": e.get("uagp"),
            "int_growth": e.get("uinp"),
            "primary_attr": e.get("upra"),
            # Art Red/Green/Blue Tint AS SET BY THIS ENTRY (task #263). `None`
            # per channel = INHERIT, not 0 — resolve with resolve_unit_tints.py
            # (entry -> w3u base -> stock Units\UnitUI.slk -> 255).
            "tint_raw": [e.get("uclr"), e.get("uclg"), e.get("uclb")],
            "abilities": [
                a.strip() for a in str(e.get("uabi") or "").split(",") if a.strip()
            ],
            "hero_abilities": [
                a.strip() for a in str(e.get("uhab") or "").split(",") if a.strip()
            ],
            "gold_cost": e.get("ugol"),
            # every unit field the whitelist above does not name, kept verbatim
            # (in this map ~150 of 180 w3u codes have no typed field)
            "rawMods": raw_mods(e, UNIT_FIELD_CODES,
                                resolve=lambda v: resolve(v, wts)),
        }

    units = {}
    heroes = {}
    for e in w3u["custom"]:
        is_hero = e.base_id[0].isupper()
        (heroes if is_hero else units)[e.obj_id] = unit_rec(e)

    # ORIGINAL-table entries: standard Blizzard rawcodes modified in place
    # (obj_id == base_id).  Kept in separate maps so the custom-table champion
    # pipeline is untouched; the roster/pool step draws heroes from here.
    units_original = {}
    heroes_original = {}
    for e in w3u["original"]:
        is_hero = e.base_id[0].isupper()
        (heroes_original if is_hero else units_original)[e.obj_id] = unit_rec(e)

    items = {}
    for e in w3t["custom"]:
        items[e.obj_id] = {
            "id": e.obj_id,
            "base": e.base_id,
            "name": _res(e, "unam", wts),
            "tooltip": _res(e, "utip", wts),
            "description": _res(e, "utub", wts),
            "flavor": _res(e, "ides", wts),
            "gold": e.get("igol"),
            "lumber": e.get("ilum"),
            "abilities": [
                a.strip() for a in str(e.get("iabi") or "").split(",") if a.strip()
            ],
            "icon": e.get("iico"),
            # every item field the whitelist above does not name, kept verbatim
            "rawMods": raw_mods(e, ITEM_FIELD_CODES,
                                resolve=lambda v: resolve(v, wts)),
        }

    return {
        "wts": {str(k): v for k, v in wts.items()},
        "abilities": abilities,
        "units": units,
        "heroes": heroes,
        "units_original": units_original,
        "heroes_original": heroes_original,
        "items": items,
    }


def write_parsed(parsed: dict, out_dir: str) -> None:
    os.makedirs(out_dir, exist_ok=True)
    for key in ("units", "heroes", "units_original", "heroes_original",
                "abilities", "items"):
        with open(os.path.join(out_dir, f"{key}.json"), "w", encoding="utf-8") as f:
            json.dump(parsed[key], f, ensure_ascii=False, indent=1)
