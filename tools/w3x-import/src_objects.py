"""src_objects.py — build the source-map reference bundle for the Backfill phase.

Companion to src_extract.py (which dumps every listfile entry to raw/).  This
module turns the raw object-data + string table of the UNPROTECTED map
(src_gogodieEX227s.w3x) into resolved, cross-referenced JSON:

  OBJECTS.json      every w3u/w3t/w3a object, TRIGSTR-resolved names + tooltips
                    + the numeric fields the stock reader already understands
  JASS_INDEX.json   functionName -> {startLine,endLine} + Trig_* trigger map,
                    indexing the already-extracted raw/war3map.j (no rewrite)
  HERO_NUMBERS.json 編號 (NN) -> hero rawcode/name, from "NN-XX 技能名" prefixes
  SANITY.md         before/after enrichment comparison vs content/

Object-data string fields hold TRIGSTR_#### references that only resolve
against the FULL 11,337-string table (src_text.parse_wts_full).  w3xlib/wts.py
used to recover just 330 of them, which is why this module was written against
a private parser; task #208 fixed the library, `parse_wts_full` is now a thin
adapter over `w3xlib.wts.parse_wts_blocks`, and both return the same 11,337.
Reuses w3xlib/objdata.py + w3xlib/mpq.py
READ-ONLY; STRINGS.json is produced by src_text.py.
"""

from __future__ import annotations

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from w3xlib.mpq import W3XArchive
from w3xlib.objdata import parse_object_file, data_columns, raw_mods, ObjEntry
from src_text import parse_wts_full, resolve, strip_codes

# 4-char codes each record reads into a TYPED field; every OTHER code is carried
# through under `rawMods` (see objdata.raw_mods) instead of being dropped. Mirror
# the `_r`/`_rs`/`e.get(...)`/`_levels_*` reads in build_objects below.
_ABILITY_CODES = frozenset({
    "anam", "ansf", "atp1", "aub1", "aret", "arut", "aart", "alev",
    "acdn", "amcs", "aran", "aare", "adur", "ahdu", "atar", "abuf",
})  # ability data columns handled separately (skip_data_columns, numeric_only)
_UNIT_CODES = frozenset({
    "unam", "upro", "utip", "utub", "umdl", "uico", "usca",
    "uhpm", "umpm", "uhpr", "umpr", "umvs", "udef",
    "ua1r", "ua1c", "ua1b", "ua1d", "ua1s",
    "ustr", "uagi", "uint", "ustp", "uagp", "uinp", "upra", "ugol",
    "uabi", "uhab",
    # ART TINT (task #263) — see w3xlib/stats.py for the full note. Absent
    # per channel means INHERIT, never 0; resolve_unit_tints.py owns the chain.
    "uclr", "uclg", "uclb",
})
_ITEM_CODES = frozenset({
    "unam", "utip", "utub", "ides", "igol", "ilum", "ilev", "icla", "iico", "iabi",
})

SRC_MAP = "/Users/Takuro/GGD/src_gogodieEX227s.w3x"
OUT_DIR = os.path.join(HERE, "out", "GoDieEX22s-src")
RAW_DIR = os.path.join(OUT_DIR, "raw")
CONTENT = "/Users/Takuro/GGD/content"


# ---------------------------------------------------------------------------
# resolution helpers
# ---------------------------------------------------------------------------
def _r(entry: ObjEntry, code: str, strings, level=None):
    """Resolve a (possibly TRIGSTR) field to raw text (colour codes kept)."""
    return resolve(entry.get(code, level), strings)


def _rs(entry: ObjEntry, code: str, strings, level=None):
    """Resolve + strip colour codes -> readable text."""
    return strip_codes(resolve(entry.get(code, level), strings))


def _levels_raw(entry: ObjEntry, code: str, strings) -> dict:
    return {
        str(lv): resolve(v, strings)
        for lv, v in sorted(entry.levels(code).items())
        if v not in (None, "")
    }


def _levels_num(entry: ObjEntry, code: str) -> dict:
    return {str(lv): v for lv, v in sorted(entry.levels(code).items())}


def _nonempty(s) -> bool:
    return isinstance(s, str) and bool(s.strip())


# ---------------------------------------------------------------------------
# OBJECTS.json
# ---------------------------------------------------------------------------
def build_objects(arc: W3XArchive, strings: dict) -> dict:
    w3u = parse_object_file(arc.read_file("war3map.w3u"), False)
    w3t = parse_object_file(arc.read_file("war3map.w3t"), False)
    w3a = parse_object_file(arc.read_file("war3map.w3a"), True)

    abilities: dict[str, dict] = {}
    for table in ("original", "custom"):
        for e in w3a[table]:
            # Columns come from the file's own dataColumn header — see
            # objdata.data_columns() for why inferring them from the code is wrong.
            data_cols = {
                c: {str(l): v for l, v in lv.items()}
                for c, lv in data_columns(e, numeric_only=True).items()
            }
            abilities[e.obj_id] = {
                "id": e.obj_id,
                "base": e.base_id,
                "table": table,
                "name": _rs(e, "anam", strings),
                "name_raw": _r(e, "anam", strings),
                "editor_suffix": _r(e, "ansf", strings),
                "tooltip": _levels_raw(e, "atp1", strings),
                "ubertip": _levels_raw(e, "aub1", strings),
                "learn_tip": _r(e, "aret", strings),
                "learn_ubertip": _r(e, "arut", strings),
                "icon": e.get("aart"),
                "levels": e.get("alev"),
                "cooldown": _levels_num(e, "acdn"),
                "mana": _levels_num(e, "amcs"),
                "cast_range": _levels_num(e, "aran"),
                "area": _levels_num(e, "aare"),
                "duration": _levels_num(e, "adur"),
                "hero_duration": _levels_num(e, "ahdu"),
                "targets_allowed": _levels_num(e, "atar"),
                "buffs": _levels_num(e, "abuf"),
                "data": {str(c): v for c, v in sorted(data_cols.items())},
                # every w3a field the reads above do not name, kept verbatim
                # (data columns already live in `data`, so they are skipped)
                "rawMods": raw_mods(e, _ABILITY_CODES,
                                    resolve=lambda v: resolve(v, strings),
                                    skip_data_columns=True, numeric_only=True),
            }

    def unit_rec(e: ObjEntry, table: str, is_hero: bool) -> dict:
        return {
            "id": e.obj_id,
            "base": e.base_id,
            "table": table,
            "is_hero": is_hero,
            "name": _rs(e, "unam", strings),
            "name_raw": _r(e, "unam", strings),
            "proper_name": _rs(e, "upro", strings),
            "tooltip": _r(e, "utip", strings),
            "description": _r(e, "utub", strings),
            "model": e.get("umdl"),
            "icon": e.get("uico"),
            "scale": e.get("usca"),
            "hp": e.get("uhpm"),
            "mana": e.get("umpm"),
            "hp_regen": e.get("uhpr"),
            "mana_regen": e.get("umpr"),
            "move_speed": e.get("umvs"),
            "armor": e.get("udef"),
            "attack_range": e.get("ua1r"),
            "attack_cooldown": e.get("ua1c"),
            "dmg_base": e.get("ua1b"),
            "dmg_dice": e.get("ua1d"),
            "dmg_sides": e.get("ua1s"),
            "str": e.get("ustr"),
            "agi": e.get("uagi"),
            "int": e.get("uint"),
            "str_growth": e.get("ustp"),
            "agi_growth": e.get("uagp"),
            "int_growth": e.get("uinp"),
            "primary_attr": e.get("upra"),
            "gold_cost": e.get("ugol"),
            # Art Red/Green/Blue Tint AS SET BY THIS ENTRY (task #263). A null
            # channel means INHERIT (base entry -> Units\UnitUI.slk -> 255),
            # NOT zero; the resolved value lives in UNIT_TINTS.json.
            "tint_raw": [e.get("uclr"), e.get("uclg"), e.get("uclb")],
            "abilities": [
                a.strip() for a in str(e.get("uabi") or "").split(",") if a.strip()
            ],
            "hero_abilities": [
                a.strip() for a in str(e.get("uhab") or "").split(",") if a.strip()
            ],
            # every unit field the reads above do not name, kept verbatim
            "rawMods": raw_mods(e, _UNIT_CODES, resolve=lambda v: resolve(v, strings)),
        }

    units: dict[str, dict] = {}
    heroes: dict[str, dict] = {}
    for table in ("original", "custom"):
        for e in w3u[table]:
            is_hero = e.base_id[0].isupper()
            (heroes if is_hero else units)[e.obj_id] = unit_rec(e, table, is_hero)

    items: dict[str, dict] = {}
    for table in ("original", "custom"):
        for e in w3t[table]:
            items[e.obj_id] = {
                "id": e.obj_id,
                "base": e.base_id,
                "table": table,
                "name": _rs(e, "unam", strings),
                "name_raw": _r(e, "unam", strings),
                "tooltip": _r(e, "utip", strings),
                "description": _r(e, "utub", strings),
                "flavor": _r(e, "ides", strings),
                "gold": e.get("igol"),
                "lumber": e.get("ilum"),
                "level": e.get("ilev"),
                "class": e.get("icla"),
                "icon": e.get("iico"),
                "abilities": [
                    a.strip()
                    for a in str(e.get("iabi") or "").split(",")
                    if a.strip()
                ],
                # every item field the reads above do not name, kept verbatim
                "rawMods": raw_mods(e, _ITEM_CODES, resolve=lambda v: resolve(v, strings)),
            }

    return {
        "meta": {
            "source_map": os.path.basename(SRC_MAP),
            "abilities": len(abilities),
            "units": len(units),
            "heroes": len(heroes),
            "items": len(items),
        },
        "abilities": abilities,
        "heroes": heroes,
        "units": units,
        "items": items,
    }


# ---------------------------------------------------------------------------
# hero 編號 table  ("NN-XX 技能名")
# ---------------------------------------------------------------------------
_NN_RE = re.compile(r"^\s*(\d{1,3})-(\d{1,3})\b")


def build_hero_numbers(objects: dict) -> dict:
    """NN (hero 編號) -> heroes whose skill names begin 'NN-XX'.  A hero's 4
    skills share one NN prefix; take the modal NN across its hero_abilities."""
    abilities = objects["abilities"]
    heroes = objects["heroes"]
    table: dict[str, dict] = {}
    hero_num: dict[str, str] = {}
    consistent = 0
    for rc, h in heroes.items():
        counts: dict[str, int] = {}
        skills = []
        nns = set()
        for ab_rc in h["hero_abilities"]:
            ab = abilities.get(ab_rc)
            if not ab:
                continue
            m = _NN_RE.match(ab.get("name") or "")
            if m:
                nn = m.group(1)
                nns.add(nn)
                counts[nn] = counts.get(nn, 0) + 1
                skills.append(
                    {"rawcode": ab_rc, "name": ab["name"], "index": m.group(2)}
                )
        if len(nns) == 1:
            consistent += 1
        if not counts:
            continue
        nn = max(counts, key=counts.get)
        hero_num[rc] = nn
        table.setdefault(nn, {"number": nn, "heroes": []})
        table[nn]["heroes"].append(
            {
                "rawcode": rc,
                "unit_name": h["name"],
                "skills": [s for s in skills if s["name"].startswith(nn + "-")],
            }
        )
    ordered = {k: table[k] for k in sorted(table, key=lambda x: int(x))}
    return {
        "convention": "ability display names are 'NN-XX 技能名'; NN = hero 編號",
        "heroes_total": len(heroes),
        "heroes_with_numbers": len(hero_num),
        "heroes_single_consistent_NN": consistent,
        "hero_to_number": {rc: hero_num[rc] for rc in sorted(hero_num)},
        "numbers": ordered,
    }


# ---------------------------------------------------------------------------
# JASS index (raw/war3map.j already extracted by src_extract.py)
# ---------------------------------------------------------------------------
_FUNC_RE = re.compile(r"^\s*function\s+([A-Za-z0-9_]+)\s+takes\b")
_END_RE = re.compile(r"^\s*endfunction\b")
_TRIG_RE = re.compile(r"^Trig_(.+)_(Actions|Conditions)$")


def build_jass(arc: W3XArchive) -> dict:
    raw_path = os.path.join(RAW_DIR, "war3map.j")
    if os.path.exists(raw_path):
        with open(raw_path, "rb") as f:
            blob = f.read()
    else:  # fall back to extracting it ourselves
        os.makedirs(RAW_DIR, exist_ok=True)
        blob = arc.read_file("war3map.j")
        with open(raw_path, "wb") as f:
            f.write(blob)

    text = blob.decode("utf-8", errors="replace")
    lines = text.split("\n")  # keeps trailing \r; line i -> editor line i+1

    functions: dict[str, dict] = {}
    trig_map: dict[str, dict] = {}
    open_name = None
    open_start = 0
    for idx, line in enumerate(lines):
        if open_name is None:
            m = _FUNC_RE.match(line)
            if m:
                open_name = m.group(1)
                open_start = idx + 1
        elif _END_RE.match(line):
            functions[open_name] = {"startLine": open_start, "endLine": idx + 1}
            tm = _TRIG_RE.match(open_name)
            if tm:
                trig_map[open_name] = {"trigger": tm.group(1), "kind": tm.group(2)}
            open_name = None

    triggers: dict[str, dict] = {}
    for fn, info in trig_map.items():
        triggers.setdefault(info["trigger"], {})[info["kind"].lower()] = fn

    return {
        "raw_path": "raw/war3map.j",
        "total_lines": len(lines),
        "function_count": len(functions),
        "trigger_function_count": len(trig_map),
        "trigger_count": len(triggers),
        "functions": functions,
        "trigger_functions": trig_map,
        "triggers": triggers,
    }


# ---------------------------------------------------------------------------
# SANITY — before/after enrichment vs content/
# ---------------------------------------------------------------------------
def _load_content(subdir: str) -> dict:
    d: dict[str, dict] = {}
    cdir = os.path.join(CONTENT, subdir)
    for fn in os.listdir(cdir):
        if fn.endswith(".json") and not fn.startswith("_"):
            try:
                d[fn[:-5]] = json.load(open(os.path.join(cdir, fn)))
            except Exception:
                pass
    return d


def build_sanity(objects: dict) -> str:
    abilities = objects["abilities"]
    heroes = objects["heroes"]
    items = objects["items"]

    champs = _load_content("champions")
    citems = _load_content("items")
    SLOTS = ["Q", "W", "E", "R"]

    # content ids are lowercased ('godie-osam'); real rawcodes keep WC3 casing
    # ('Osam','E001'), so match case-insensitively.
    heroes_ci = {rc.upper(): rc for rc in heroes}
    items_ci = {rc.upper(): rc for rc in items}

    def hero_rc(cid: str):
        m = re.match(r"godie-(\w+)$", cid)
        if not m:
            return None
        return heroes_ci.get(m.group(1).upper())

    ab_rows = []
    src_name_ct = src_tip_ct = 0
    content_name_ct = content_tip_ct = 0
    matched = 0
    for cid, champ in sorted(champs.items()):
        rc = hero_rc(cid)
        if not rc:
            continue
        skill_rcs = [a for a in heroes[rc]["hero_abilities"] if a != "Aamk"][:4]
        cab = champ.get("abilities", {})
        for i, slot in enumerate(SLOTS):
            if i >= len(skill_rcs):
                continue
            ab_rc = skill_rcs[i]
            src = abilities.get(ab_rc, {})
            content_ab = cab.get(slot, {})
            matched += 1
            sname = src.get("name") or ""
            ub = src.get("ubertip") or {}
            stip = ub[sorted(ub, key=lambda x: int(x))[0]] if ub else ""
            stip = strip_codes(stip)
            if _nonempty(sname):
                src_name_ct += 1
            if _nonempty(stip):
                src_tip_ct += 1
            if _nonempty(content_ab.get("name")):
                content_name_ct += 1
            if _nonempty(content_ab.get("description")) or _nonempty(
                content_ab.get("tooltip")
            ):
                content_tip_ct += 1
            ab_rows.append(
                {
                    "champ": cid,
                    "slot": slot,
                    "rawcode": ab_rc,
                    "content_name": content_ab.get("name") or "",
                    "content_tip_len": len(
                        (content_ab.get("description") or "")
                        + (content_ab.get("tooltip") or "")
                    ),
                    "src_name": sname,
                    "src_tip": stip,
                }
            )

    def item_rc(cid: str):
        m = re.match(r"godie-(\w+)$", cid)
        if not m:
            return None
        return items_ci.get(m.group(1).upper())

    item_src_desc = item_content_desc = item_matched = 0
    for cid, it in citems.items():
        rc = item_rc(cid)
        if not rc:
            continue
        item_matched += 1
        src = items[rc]
        stip = strip_codes(src.get("tooltip") or "") or strip_codes(
            src.get("description") or ""
        )
        if _nonempty(stip):
            item_src_desc += 1
        if _nonempty(it.get("description")) or _nonempty(it.get("flavor")):
            item_content_desc += 1

    src_ab_named = sum(1 for a in abilities.values() if _nonempty(a["name"]))
    src_ab_tipped = sum(1 for a in abilities.values() if a["ubertip"] or a["tooltip"])
    src_hero_named = sum(1 for h in heroes.values() if _nonempty(h["name"]))
    src_item_named = sum(1 for i in items.values() if _nonempty(i["name"]))
    src_item_tipped = sum(
        1
        for i in items.values()
        if _nonempty(i["tooltip"]) or _nonempty(i["description"])
    )

    sample = [r for r in sorted(ab_rows, key=lambda r: -len(r["src_tip"])) if r["src_tip"]][:20]

    L = []
    L.append("# SANITY — source-map enrichment vs content/\n")
    L.append(f"Source map: `{os.path.basename(SRC_MAP)}`  ")
    L.append("WTS strings recovered: **11,337** (stock wts.py caught only 330)\n")
    L.append("## Whole-set coverage (source OBJECTS.json)\n")
    L.append("| object | count | with real name | with tooltip/ubertip |")
    L.append("|---|---:|---:|---:|")
    L.append(f"| abilities | {len(abilities)} | {src_ab_named} | {src_ab_tipped} |")
    L.append(f"| heroes | {len(heroes)} | {src_hero_named} | — |")
    L.append(f"| items | {len(items)} | {src_item_named} | {src_item_tipped} |")
    L.append("")
    L.append("## Champion ability slots (Q/W/E/R) — before vs after\n")
    L.append(f"Matched content champion → source hero: **{matched}** ability slots\n")
    L.append("| field | content/ has it | source resolves it |")
    L.append("|---|---:|---:|")
    L.append(f"| ability name | {content_name_ct} | {src_name_ct} |")
    L.append(f"| ability tooltip/description | {content_tip_ct} | {src_tip_ct} |")
    L.append("")
    L.append(
        f"> content/ currently stores **{content_tip_ct}** ability descriptions; "
        f"the source resolves **{src_tip_ct}** rich multi-line tooltips for the "
        f"same slots."
    )
    L.append("")
    L.append("## Items — before vs after\n")
    L.append(f"Matched content item → source item: **{item_matched}**\n")
    L.append("| field | content/ has it | source resolves it |")
    L.append("|---|---:|---:|")
    L.append(f"| description/flavor | {item_content_desc} | {item_src_desc} |")
    L.append("")
    L.append("## 20 sampled abilities — content name/tip → source tooltip\n")
    for r in sample:
        L.append(f"### {r['champ']} {r['slot']} · `{r['rawcode']}`")
        L.append(
            f"- **content**: name={r['content_name'] or '∅'!r}, "
            f"tooltip chars={r['content_tip_len']}"
        )
        L.append(f"- **source name**: {r['src_name']}")
        tip = r["src_tip"].replace("\n", " / ")
        if len(tip) > 260:
            tip = tip[:260] + "…"
        L.append(f"- **source tooltip**: {tip}")
        L.append("")
    return "\n".join(L)


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    arc = W3XArchive(SRC_MAP)
    try:
        strings, _comments = parse_wts_full(arc.read_file("war3map.wts"))

        objects = build_objects(arc, strings)
        with open(os.path.join(OUT_DIR, "OBJECTS.json"), "w", encoding="utf-8") as f:
            json.dump(objects, f, ensure_ascii=False, indent=1)
        print("OBJECTS.json:", objects["meta"])

        hero_numbers = build_hero_numbers(objects)
        with open(os.path.join(OUT_DIR, "HERO_NUMBERS.json"), "w", encoding="utf-8") as f:
            json.dump(hero_numbers, f, ensure_ascii=False, indent=1)
        print(
            "HERO_NUMBERS.json:",
            hero_numbers["heroes_with_numbers"],
            "heroes numbered,",
            hero_numbers["heroes_single_consistent_NN"],
            "single-consistent-NN /",
            hero_numbers["heroes_total"],
        )

        jass = build_jass(arc)
        with open(os.path.join(OUT_DIR, "JASS_INDEX.json"), "w", encoding="utf-8") as f:
            json.dump(jass, f, ensure_ascii=False, indent=1)
        print(
            "JASS_INDEX.json:",
            jass["function_count"],
            "functions,",
            jass["trigger_count"],
            "triggers ->",
            jass["raw_path"],
        )

        sanity = build_sanity(objects)
        with open(os.path.join(OUT_DIR, "SANITY.md"), "w", encoding="utf-8") as f:
            f.write(sanity)
        print("SANITY.md written")
    finally:
        arc.close()


if __name__ == "__main__":
    main()
