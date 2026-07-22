#!/usr/bin/env python3
"""Regenerate `ITEM_STOCK_DATA` in w3xlib/drafts.py from the stock MPQs.

    python3 tools/w3x-import/stock_item_data.py

WHY THIS EXISTS. A `war3map.w3a` records only the columns an object OVERRIDES.
An item that keeps a stock value therefore has no entry for it at all, and the
inherited number cannot be read from the map — it has to come from Blizzard's
own `Units\\AbilityData.slk`. 龍騎士之劍 is the plain case: it carries an
unmodified `AIaz`, its tooltip says 敏捷+10, and the only place that 10 exists
is the stock table.

`CRIT_BASE_MULT` in drafts.py already took this route by hand for the crit
multiplier. This generalises it to every item ability the mapper knows about,
so the value is derived rather than remembered.

COLUMNS ARE 1-BASED and mean different things per ability family; for the hero
attribute bonus they are 1=agility, 2=intelligence, 3=strength, which is why
the printed table keeps all three.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from w3xlib.mpq import W3XArchive  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
# Later archives patch earlier ones, so read in load order and let the last win.
ARCHIVES = ["war3.mpq", "War3x.mpq", "War3Patch.mpq"]
SLK = "Units\\AbilityData.slk"

# Every item-ability rawcode drafts.py maps
# (ITEM_STAT_TABLE + ITEM_ATTRIBUTE_BASES).
WANTED = [
    "AIt9", "AItf", "AItj", "AItn", "AItx",
    "AIl1", "AIlz", "AIbm", "AImv",
    "AIs2", "AIsx", "AIva", "AIrm", "AIcs",
    "AIs1", "AIs3", "AIs4", "AIs6",
    "AIa1", "AIa6", "AIaz", "AIi6",
]
# The SLK column names differ between archives (war3.mpq uses Data<col><level>,
# the expansions use Data<A-I><level>); both spellings of level-1 columns 1..3.
COL_NAMES = {1: ("DataA1", "Data11"), 2: ("DataB1", "Data21"), 3: ("DataC1", "Data31")}


def parse_slk(raw: bytes) -> tuple[dict, dict]:
    text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw
    cells: dict[tuple[int, int], str] = {}
    cx = cy = 1
    for line in text.splitlines():
        if not line.startswith("C;"):
            continue
        m = re.search(r"X(\d+)", line)
        cx = int(m.group(1)) if m else cx
        m = re.search(r"Y(\d+)", line)
        cy = int(m.group(1)) if m else cy
        k = re.search(r";K(.*)$", line)
        if k:
            cells[(cy, cx)] = k.group(1).strip('"')
    header = {cells[(1, x)]: x for (y, x) in cells if y == 1}
    rows: dict[int, dict[int, str]] = {}
    for (y, x), v in cells.items():
        rows.setdefault(y, {})[x] = v
    return header, rows


def main() -> int:
    found: dict[str, dict[int, float]] = {}
    for name in ARCHIVES:
        path = ROOT / name
        if not path.exists():
            print(f"  (skip {name} — not in {ROOT})", file=sys.stderr)
            continue
        raw = W3XArchive(str(path)).read_file(SLK)
        if not raw:
            continue
        header, rows = parse_slk(raw)
        alias = header.get("alias")
        if alias is None:
            continue
        for row in rows.values():
            code = row.get(alias)
            if code not in WANTED:
                continue
            cols: dict[int, float] = {}
            for col, names in COL_NAMES.items():
                for n in names:
                    if n not in header:
                        continue
                    v = row.get(header[n])
                    if v in (None, "", "-"):
                        continue
                    cols[col] = float(v) if "." in v else int(v)
                    break
            if cols:
                found[code] = cols

    missing = [c for c in WANTED if c not in found]
    print("# Stock level-1 data columns for the item abilities the tables above")
    print("# map, read from `Units\\\\AbilityData.slk` in the stock archives at the")
    print("# repo root. REGENERATE with tools/w3x-import/stock_item_data.py.")
    print("#")
    print("# The w3a records only OVERRIDDEN columns, so an item that keeps a stock")
    print("# value has no entry to read and the inherited number must come from")
    print("# here. Without it 龍騎士之劍's unmodified `AIaz` imported as no stat at")
    print("# all, against a tooltip that plainly says 敏捷+10.")
    print("ITEM_STOCK_DATA = {")
    for code in WANTED:
        cols = found.get(code)
        if not cols:
            continue
        body = ", ".join(f"{k}: {v}" for k, v in sorted(cols.items()))
        print(f'    "{code}": {{{body}}},')
    print("}")
    if missing:
        print(f"\n# NOT FOUND in any archive: {missing}", file=sys.stderr)
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
