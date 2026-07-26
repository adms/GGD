#!/usr/bin/env python3
"""Extract Blizzard's GAMEPLAY CONSTANTS from the stock MPQs (task #248 follow-up).

    python3 tools/w3x-import/stock_misc_data.py
    -> tools/w3x-import/out/stock/STOCK_MISCGAME.json

WHY THIS EXISTS. #248 took the eight 三圍 coefficients (力量→生命 25, 敏捷→護甲
0.30 …) from memory and then credited them to `Units\\UnitBalance.slk`. That file
does not contain a single coefficient — it is a PER-UNIT table (60 columns:
STR/AGI/INT/STRplus/HP/def/…). The derivation constants live in
`Units\\MiscGame.txt`, and the SOURCE MAP SHIPS ITS OWN OVERRIDE of that table
(`war3mapMisc.txt`, already extracted next to the other raw map files).

So there are two first-party sources and they disagree:

    field                  Blizzard MiscGame.txt   GoDieEX22s war3mapMisc.txt
    StrHitPointBonus       25                      23.0
    StrRegenBonus          0.05                    0.04
    StrAttackBonus         1.0                     1.0
    AgiDefenseBonus        0.30                    0.15
    AgiDefenseBase         -2                      0.0
    AgiAttackSpeedBonus    0.02                    (not overridden)
    AgiMoveBonus           0                       0.1
    IntManaBonus           15                      15.0
    IntRegenBonus          0.05                    0.07
    MaxHeroLevel           10                      40

The MAP wins (「一律以 JASS 實際參數為準」); Blizzard is the documented fallback
for the fields the map leaves alone. This script commits Blizzard's side so
`attributeCoefficients.test.ts` can READ both numbers instead of trusting a
copy someone typed into a comment — the MPQs themselves are gitignored.

LOAD ORDER is the same as stock_unit_data.py: war3.mpq -> War3x.mpq ->
War3Patch.mpq, later archives patching earlier ones. In practice only
War3Patch.mpq carries Units\\MiscGame.txt, but the merge is done properly rather
than assumed.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from w3xlib.mpq import W3XArchive  # noqa: E402

ROOT = HERE.parents[1]
# The stock MPQs are gitignored, so a git WORKTREE does not have them even
# though the repo it belongs to does. GGD_MPQ_DIR points at the checkout that
# holds them; without it we look next to this repo, like stock_unit_data.py.
MPQ_DIR = Path(os.environ.get("GGD_MPQ_DIR", ROOT))
ARCHIVES = ["war3.mpq", "War3x.mpq", "War3Patch.mpq"]
MISCGAME = "Units\\MiscGame.txt"
OUT = HERE / "out" / "stock" / "STOCK_MISCGAME.json"

# The [Misc] fields that drive attribute -> stat derivation, plus the two the
# GGD model deliberately does NOT implement (AgiDefenseBase / AgiMoveBonus) and
# the level cap, all of which the owner needs to see side by side with the map.
HERO_CONSTANTS = [
    "StrAttackBonus",
    "StrHitPointBonus",
    "StrRegenBonus",
    "AgiDefenseBonus",
    "AgiDefenseBase",
    "AgiAttackSpeedBonus",
    "AgiMoveBonus",
    "IntManaBonus",
    "IntRegenBonus",
    "MaxHeroLevel",
    "MaxUnitLevel",
    "DefenseArmor",
]


def parse_misc(raw: bytes) -> dict[str, str]:
    """`key=value` lines of a WC3 gameplay-constants txt. `//` starts a comment.

    Section headers are ignored: MiscGame.txt is a single [Misc] section and the
    map's war3mapMisc.txt puts its dependency blocks AFTER it, none of which
    reuse a [Misc] key name.
    """
    out: dict[str, str] = {}
    for line in raw.decode("utf-8-sig", errors="replace").splitlines():
        line = line.split("//", 1)[0].strip()
        if not line or line.startswith("[") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def main() -> int:
    merged: dict[str, str] = {}
    seen_in: dict[str, str] = {}
    for name in ARCHIVES:
        path = MPQ_DIR / name
        if not path.exists():
            print(f"  (skip {name} — not at {MPQ_DIR})", file=sys.stderr)
            continue
        arc = W3XArchive(str(path))
        try:
            raw = arc.read_file(MISCGAME)
        finally:
            arc.close()
        if not raw:
            continue
        fields = parse_misc(raw)
        print(f"  {name}:{MISCGAME} -> {len(fields)} fields", file=sys.stderr)
        for k, v in fields.items():
            merged[k] = v
            seen_in[k] = name

    if not merged:
        print(
            f"FATAL: no {MISCGAME} read — put war3.mpq/War3x.mpq/War3Patch.mpq at {MPQ_DIR}\n"
            f"            (or set GGD_MPQ_DIR to the checkout that has them)",
            file=sys.stderr,
        )
        return 1

    missing = [k for k in HERO_CONSTANTS if k not in merged]
    if missing:
        print(f"FATAL: MiscGame.txt is missing {missing}", file=sys.stderr)
        return 1

    doc = {
        "_source": f"Blizzard {MISCGAME} from {', '.join(ARCHIVES)} (later archives win)",
        "_generator": "tools/w3x-import/stock_misc_data.py",
        "_note": (
            "Blizzard's DEFAULT gameplay constants. The source map overrides several of "
            "them in tools/w3x-import/out/GoDieEX22s-src/raw/war3mapMisc.txt, and the "
            "MAP wins — see ATTRIBUTE_ENV_DEFAULTS in packages/shared/src/sim/combatEnv.ts."
        ),
        "heroConstants": {k: merged[k] for k in HERO_CONSTANTS},
        "seenIn": {k: seen_in[k] for k in HERO_CONSTANTS},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)}", file=sys.stderr)
    for k in HERO_CONSTANTS:
        print(f"  {k:24} = {merged[k]}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
