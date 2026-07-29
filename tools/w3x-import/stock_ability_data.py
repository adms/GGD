#!/usr/bin/env python3
"""Extract Blizzard's STOCK ability table from the Warcraft III MPQs.

    python3 tools/w3x-import/stock_ability_data.py
    -> tools/w3x-import/out/stock/STOCK_ABILITIES.json

WHY THIS EXISTS
---------------
`war3map.w3a` records only the (field, level) cells an ability OVERRIDES.
Every cell the map author left alone keeps the BASE ability's value — WC3
object data is a diff, not a full record. Any extractor that reads the w3a
alone therefore reports "no value" where the truth is "inherited value", and
the two are indistinguishable in the output.

That is not hypothetical. `Aphx` (61-00 百連我殺, 克勞薩II世 -> 鳳凰蛋) writes
`amcs`/`adur`/`Eme1`/`Emeu` and NOTHING for `ahdu`, so
`extract_transform_forms.py` emitted `durationSecByLevel: {}`. Blizzard's own
row says `HeroDur1 = 10`: the egg lasts ten seconds. The map never disagreed —
it simply never spoke, and 10 seconds fell out of the port.

`stock_unit_data.py` (task #248) already takes this route for units and
`stock_item_data.py` for item abilities; this is the same move for the
ABILITY table, which is where per-level durations/costs/cooldowns live.

LOAD ORDER. war3.mpq -> War3x.mpq -> War3Patch.mpq, later archives patch
earlier ones, so a row is replaced wholesale by the last archive that has it.
War3xLocal.mpq carries no AbilityData.slk at all (verified: read_file returns
None), so it is not in the list.

THE ARCHIVES ARE NOT IN VERSION CONTROL (`.gitignore` line 67: `*.mpq`), which
is exactly why the OUTPUT is. Only a machine with the retail MPQs at the repo
root can regenerate it, so `out/stock/STOCK_ABILITIES.json` is checked in and
`extract_transform_forms.py` reads the JSON, never the archives.

NEVER PRODUCE AN EMPTY FILE. A silently-empty stock table would make every
inherited value look absent again — the same failure this script exists to
kill, but now with a green pipeline. A missing archive is a hard error: the
script prints what it could not find and exits non-zero WITHOUT writing.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from stock_unit_data import MISSING, num, parse_slk  # noqa: E402
from w3xlib.mpq import W3XArchive  # noqa: E402

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT = HERE / "out" / "stock" / "STOCK_ABILITIES.json"

# Load order: later archives patch earlier ones.
ARCHIVES = ["war3.mpq", "War3x.mpq", "War3Patch.mpq"]
TABLE = "Units\\AbilityData.slk"

# The per-level numeric columns an ability diff can leave unspoken. Names are
# Blizzard's SLK column names, kept verbatim so a reader can grep the SLK.
LEVELED = ["HeroDur", "Dur", "Cost", "Cool"]
LEVELS = (1, 2, 3, 4)
# Level-1 identity columns: DataA1 is the family's first data field (for the
# morph family it is the alternate unit) and UnitID1 the unit the ability
# creates/becomes. Both are how you tell a stock row is the ability you think.
SCALAR = ["DataA1", "UnitID1"]
# Context that makes a row self-describing when someone reads the JSON.
CONTEXT = ["alias", "code", "comments", "levels", "hero", "sort", "race"]


def read_stock_table() -> tuple[dict[str, dict[str, str]], list[str]]:
    """Merge AbilityData.slk across every archive. Returns (rows, missing)."""
    merged: dict[str, dict[str, str]] = {}
    missing: list[str] = []
    for name in ARCHIVES:
        path = ROOT / name
        if not path.exists():
            missing.append(name)
            print(f"  MISSING ARCHIVE: {path}", file=sys.stderr)
            continue
        arc = W3XArchive(str(path))
        try:
            raw = arc.read_file(TABLE)
        finally:
            arc.close()
        if not raw:
            missing.append(f"{name}:{TABLE}")
            print(f"  MISSING TABLE: {name} has no {TABLE}", file=sys.stderr)
            continue
        rows = parse_slk(raw)
        print(f"  {name}:{TABLE} -> {len(rows)} rows", file=sys.stderr)
        merged.update(rows)
    return merged, missing


def build(rows: dict[str, dict[str, str]]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for alias in sorted(rows):
        row = rows[alias]
        rec: dict = {}
        for stem in LEVELED:
            for lvl in LEVELS:
                v = num(row.get(f"{stem}{lvl}"))
                if v is not None:
                    rec[f"{stem}{lvl}"] = v
        for col in SCALAR:
            v = row.get(col)
            if v is not None and v.strip().strip('"') not in MISSING:
                rec[col] = v.strip().strip('"')
        for col in CONTEXT:
            v = row.get(col)
            if v is not None and v.strip().strip('"') not in MISSING:
                rec[col] = num(v)
        out[alias] = rec
    return out


def main() -> int:
    print(f"reading {TABLE} from {ROOT}", file=sys.stderr)
    rows, missing = read_stock_table()

    if missing:
        print(
            "\nFATAL: the Warcraft III archives are required and incomplete.\n"
            f"  could not read: {', '.join(missing)}\n"
            f"  expected at:    {ROOT}/{{{','.join(ARCHIVES)}}}\n"
            "  (*.mpq is gitignored — only a machine with the retail install\n"
            "   can regenerate this table, which is why the OUTPUT is checked\n"
            "   in. NOTHING was written; the existing "
            f"{OUT.name} is untouched.)",
            file=sys.stderr,
        )
        return 2

    abilities = build(rows)
    if not abilities:
        print(
            f"\nFATAL: {TABLE} parsed to ZERO abilities — refusing to write an\n"
            "  empty stock table (an empty table makes every inherited value\n"
            "  look absent, which is the bug this file exists to prevent).",
            file=sys.stderr,
        )
        return 3

    # A canary: if this row ever stops carrying its duration the parse broke.
    canary = abilities.get("Aphx", {}).get("HeroDur1")
    if canary is None:
        print(
            "\nFATAL: Aphx (stock Phoenix) has no HeroDur1 — the SLK parse or\n"
            "  the load order is wrong; refusing to write.",
            file=sys.stderr,
        )
        return 4

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(
            {
                "meta": {
                    "generator": "tools/w3x-import/stock_ability_data.py",
                    "archives": ARCHIVES,
                    "table": TABLE,
                    "note": (
                        "Blizzard stock ability rows, keyed by alias. A w3a "
                        "entry's `base_id` names the row it inherits from: any "
                        "(field, level) the map does not write keeps the value "
                        "here. Column names are Blizzard's own."
                    ),
                    "count": len(abilities),
                },
                "abilities": abilities,
            },
            ensure_ascii=False,
            indent=1,
        )
        + "\n",
        encoding="utf-8",
    )
    print(
        f"wrote {OUT} ({len(abilities)} stock abilities; Aphx.HeroDur1={canary})",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
