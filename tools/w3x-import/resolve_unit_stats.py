#!/usr/bin/env python3
"""Resolve every champion's EFFECTIVE w3x stats by walking the `base` chain (task #248).

    python3 tools/w3x-import/resolve_unit_stats.py
    -> tools/w3x-import/out/GoDieEX22s-src/RESOLVED_HERO_STATS.json

THE BUG THIS EXISTS TO KILL. A previous pass read `str`/`agi`/`int` straight out
of OBJECTS.json and treated `null` as ZERO, and so "found" 53 heroes with a zero
attribute. Wrong. `war3map.w3u` stores only the columns an object OVERRIDES;
`null` means "the map did not touch this field — INHERIT FROM THE BASE UNIT".

    Hmkg   name/str/agi/int all null   -> a stock Blizzard hero, never customised
    O02N   曹操孟德, base Ofar          -> attributes null, growths overridden
    Ofar   神奇寶貝兒                    -> only `str` overridden; agi/int inherit
    E002   亞瑟王, base Ewrd            -> str/agi own, `int` from Ewrd's override
    Hblm   賈修貝爾                      -> all three overridden; passes through

RESOLUTION RULE. For unit X and field F, take the nearest non-null value walking
    X -> map[X].base -> ... -> stock table
where a map entry whose `base` equals its own id (the w3u "original" table, i.e.
a customised stock object) hands off to the STOCK row of that same id. Stock rows
come from `out/stock/STOCK_UNITS.json` (see stock_unit_data.py).

PROVENANCE IS A DELIVERABLE, not debug output: every resolved field records
whether the number is the map author's choice (`self` / `map:<ancestor>`) or a
Blizzard default (`stock:<id>`), because that is what tells the owner which
numbers he may re-tune freely.

GUARDS. A cycle in the base chain and a base id present in neither the map nor
the stock table are both reported (`chain_error`), never silently defaulted.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OBJECTS = HERE / "out" / "GoDieEX22s-src" / "OBJECTS.json"
STOCK = HERE / "out" / "stock" / "STOCK_UNITS.json"
OUT = HERE / "out" / "GoDieEX22s-src" / "RESOLVED_HERO_STATS.json"

FIELDS = [
    "str", "agi", "int",
    "str_growth", "agi_growth", "int_growth",
    "primary_attr",
    "hp", "mana", "hp_regen", "mana_regen",
    "armor", "move_speed",
    "attack_range", "attack_cooldown",
    "dmg_base", "dmg_dice", "dmg_sides",
    "gold_cost",
]
ATTRS = ("str", "agi", "int")


def load():
    objs = json.loads(OBJECTS.read_text(encoding="utf-8"))
    stock = json.loads(STOCK.read_text(encoding="utf-8"))["units"]
    map_units = {**objs["units"], **objs["heroes"]}
    return objs, map_units, stock


def chain_of(uid: str, map_units: dict, stock: dict):
    """Ordered resolution chain for `uid`, plus any error found walking it.

    Nodes are ("map", id) or ("stock", id); the stock node is terminal.
    """
    chain: list[tuple[str, str]] = []
    err = None
    seen: set[str] = set()
    cur = uid
    while True:
        if cur in seen:
            err = f"cycle in base chain at {cur} (path {[c[1] for c in chain]})"
            break
        seen.add(cur)
        if cur in map_units:
            chain.append(("map", cur))
            base = map_units[cur]["base"]
            if base == cur:
                # w3u "original" entry: a customised stock object. Its parent is
                # Blizzard's own row for the same id.
                if cur in stock:
                    chain.append(("stock", cur))
                else:
                    err = f"base {cur} is its own id but has no stock row"
                break
            cur = base
            continue
        if cur in stock:
            chain.append(("stock", cur))
            break
        err = f"base id {cur!r} exists in neither the map nor the stock table"
        break
    return chain, err


def resolve(uid: str, map_units: dict, stock: dict):
    chain, err = chain_of(uid, map_units, stock)
    values: dict = {}
    prov: dict = {}
    for f in FIELDS:
        for i, (kind, nid) in enumerate(chain):
            src = map_units[nid] if kind == "map" else stock[nid]
            v = src.get(f)
            if v is None:
                continue
            values[f] = v
            if kind == "stock":
                prov[f] = f"stock:{nid}"
            elif i == 0:
                prov[f] = "self"
            else:
                prov[f] = f"map:{nid}"
            break
        else:
            values[f] = None
            prov[f] = "unresolved"
    return values, prov, chain, err


# The five cases named in the task-#248 correction. `None` means "must resolve
# to a real inherited value from this exact source", which is the whole point.
PROOF = [
    # id,    field, expected value, expected provenance
    ("Hmkg", "str", 24, "stock:Hmkg"),      # untouched stock Mountain King
    ("Hmkg", "agi", 11, "stock:Hmkg"),
    ("Hmkg", "int", 15, "stock:Hmkg"),
    ("O02N", "str", 17, "map:Ofar"),        # 曹操孟德: attrs inherit, growths own
    ("O02N", "agi", 18, "stock:Ofar"),
    ("O02N", "int", 19, "stock:Ofar"),
    ("O02N", "str_growth", 1.7, "self"),
    ("Ofar", "str", 17, "self"),            # 神奇寶貝兒 overrode STR only
    ("Ofar", "agi", 18, "stock:Ofar"),
    ("Ofar", "int", 19, "stock:Ofar"),
    ("E002", "str", 23, "self"),            # 亞瑟王 -> Ewrd -> stock Ewrd
    ("E002", "agi", 16, "self"),
    ("E002", "int", 20, "map:Ewrd"),
    ("Ewrd", "str", 18, "stock:Ewrd"),      # 棗真夜 kept the Warden's STR
    ("Ewrd", "agi", 18, "self"),
    ("Ewrd", "int", 20, "self"),
    ("Hblm", "str", 17, "self"),            # 賈修 overrode all three: pass-through
    ("Hblm", "agi", 13, "self"),
    ("Hblm", "int", 21, "self"),
]


def selftest(out_heroes: dict) -> int:
    bad = 0
    print("--- resolver proof cases (task #248 correction) ---")
    for uid, field, want, want_prov in PROOF:
        rec = out_heroes.get(uid)
        got = rec["resolved"][field] if rec else None
        prov = rec["provenance"][field] if rec else "MISSING"
        ok = rec is not None and abs(float(got) - want) < 0.011 and prov == want_prov
        bad += 0 if ok else 1
        raw = rec["raw"][field] if rec else None
        print(
            f"  {'PASS' if ok else 'FAIL'} {uid}.{field}: raw={raw} -> "
            f"{got} [{prov}]  (expected {want} [{want_prov}])"
        )
    print(f"--- {len(PROOF) - bad}/{len(PROOF)} proof assertions pass ---")
    return bad


def shipped_ids() -> set[str]:
    """Champion doc ids that actually ship in content/champions."""
    d = HERE.parents[1] / "content" / "champions"
    if not d.is_dir():
        return set()
    return {p.stem for p in d.glob("*.json") if p.stem != "_index"}


def main() -> int:
    objs, map_units, stock = load()
    heroes = objs["heroes"]
    ships = shipped_ids()

    out_heroes: dict[str, dict] = {}
    errors: list[str] = []
    for uid in sorted(heroes):
        h = heroes[uid]
        values, prov, chain, err = resolve(uid, map_units, stock)
        if err:
            errors.append(f"{uid}: {err}")
        out_heroes[uid] = {
            "id": uid,
            "content_id": f"godie-{uid.lower()}",
            "shipped": f"godie-{uid.lower()}" in ships,
            "name": h.get("name"),
            "proper_name": h.get("proper_name"),
            "base": h.get("base"),
            "table": h.get("table"),
            "chain": [f"{k}:{i}" for k, i in chain],
            "chain_error": err,
            "raw": {f: h.get(f) for f in FIELDS},
            "resolved": values,
            "provenance": prov,
        }

    out_units: dict[str, dict] = {}
    for uid in sorted(objs["units"]):
        u = objs["units"][uid]
        values, prov, chain, err = resolve(uid, map_units, stock)
        if err:
            errors.append(f"unit {uid}: {err}")
        out_units[uid] = {
            "id": uid,
            "name": u.get("name"),
            "base": u.get("base"),
            "chain": [f"{k}:{i}" for k, i in chain],
            "chain_error": err,
            "resolved": values,
            "provenance": prov,
        }

    # --- the owner's question: real zeros, after resolution -------------------
    zeros = []
    for uid, rec in out_heroes.items():
        hits = {a: rec["provenance"][a] for a in ATTRS if rec["resolved"][a] == 0}
        if hits:
            zeros.append(
                {
                    "id": uid,
                    "content_id": rec["content_id"],
                    "name": rec["name"],
                    "proper_name": rec["proper_name"],
                    "shipped": rec["shipped"],
                    "chain": rec["chain"],
                    "zero_fields": hits,
                    "resolved_attrs": {a: rec["resolved"][a] for a in ATTRS},
                }
            )

    # Adjacent real zeros the owner will also want to hand-tune: an explicit 0
    # GROWTH means the hero never scales with level, and a 0 MOVE SPEED is not a
    # speed at all. `armor`/`dmg_base`/`mana` zeros are excluded — those are the
    # Blizzard stock defaults for every hero (heroes derive mana from INT), so
    # they are inheritance, not authored intent.
    OTHER = ("str_growth", "agi_growth", "int_growth", "move_speed", "hp_regen")
    other_zeros = []
    for uid, rec in out_heroes.items():
        hits = {f: rec["provenance"][f] for f in OTHER if rec["resolved"][f] == 0}
        if hits:
            other_zeros.append(
                {
                    "id": uid,
                    "content_id": rec["content_id"],
                    "name": rec["name"],
                    "proper_name": rec["proper_name"],
                    "shipped": rec["shipped"],
                    "chain": rec["chain"],
                    "zero_fields": hits,
                    "resolved": {f: rec["resolved"][f] for f in ATTRS + OTHER},
                }
            )
    unresolved = [
        {"id": uid, "fields": [f for f in FIELDS if rec["provenance"][f] == "unresolved"]}
        for uid, rec in out_heroes.items()
        if any(rec["provenance"][f] == "unresolved" for f in FIELDS)
    ]

    # naive (buggy) reading, for the before/after headline
    naive_zero = sorted(
        uid for uid, h in heroes.items()
        if any(h.get(a) in (None, 0) for a in ATTRS)
    )
    naive_zero_shipped = [u for u in naive_zero if out_heroes[u]["shipped"]]

    prov_counts: dict[str, int] = {}
    for rec in out_heroes.values():
        for f in ATTRS:
            prov_counts[rec["provenance"][f].split(":")[0]] = (
                prov_counts.get(rec["provenance"][f].split(":")[0], 0) + 1
            )

    OUT.write_text(
        json.dumps(
            {
                "meta": {
                    "generator": "tools/w3x-import/resolve_unit_stats.py",
                    "objects": os.path.relpath(OBJECTS, HERE.parents[1]),
                    "stock": os.path.relpath(STOCK, HERE.parents[1]),
                    "hero_count": len(out_heroes),
                    "rule": (
                        "null in OBJECTS.json = inherit; walk base to the "
                        "nearest non-null, else Blizzard stock."
                    ),
                    "shipped_champion_count": sum(
                        1 for r in out_heroes.values() if r["shipped"]
                    ),
                    "attr_provenance_counts": prov_counts,
                    "naive_null_as_zero_count": len(naive_zero),
                    "naive_null_as_zero_count_shipped": len(naive_zero_shipped),
                    "genuine_zero_count": len(zeros),
                    "chain_errors": errors,
                },
                "genuine_attribute_zeros": zeros,
                "genuine_zeros_other_fields": other_zeros,
                "unresolved": unresolved,
                "heroes": out_heroes,
                # non-hero units resolved the same way — creeps, summons and the
                # second-form units #249 will need. Same rule, same provenance.
                "units": out_units,
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )

    bad = selftest(out_heroes)
    print(f"wrote {OUT}")
    print(f"heroes: {len(out_heroes)}  units: {len(out_units)}  chain errors: {len(errors)}")
    print(
        f"naive null-as-zero would report: {len(naive_zero)} heroes "
        f"({len(naive_zero_shipped)} of them shipped champions)"
    )
    print(f"GENUINE str/agi/int zeros      : {len(zeros)} heroes")
    for z in zeros:
        print(f"  {z['id']} {z['name']} {z['proper_name']} {z['zero_fields']} chain={z['chain']}")
    print(f"GENUINE zeros in growth/speed  : {len(other_zeros)} heroes")
    for z in other_zeros:
        print(f"  {z['id']} {z['name']} {z['proper_name']} {z['zero_fields']}")
    if unresolved:
        print(f"unresolved fields on {len(unresolved)} heroes: {unresolved}")
    for e in errors:
        print(f"CHAIN ERROR {e}")
    return 1 if (bad or errors) else 0


if __name__ == "__main__":
    sys.exit(main())
