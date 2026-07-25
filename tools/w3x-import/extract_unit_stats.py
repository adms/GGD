#!/usr/bin/env python3
"""Read-only per-champion movement/attack-speed extractor (task #144).

The user reported every champion appears to walk at the same speed. The cause
was the movement-speed conversion in `w3xlib/drafts.py::hero_to_champion`, an
AFFINE map with a large baseline offset:

    ms = 5.5 + (clamp(raw, 270, 522) - 270) * (8.0 - 5.5) / 252.0

Two things flattened the spread:
  * the +5.5 offset squashes RELATIVE differences — WC3 295 vs 315 (a real 6.8%
    gap) becomes 5.75 vs 5.95, a 3.4% gap the player can't feel;
  * the 270 floor collapses every slow unit (240, 250, 270) onto 5.5.

So the bulk of the roster (WC3 290..315) landed in the tiny 5.6..5.9 band.

FIX — a PROPORTIONAL conversion anchored on the shop's reference scale:

    ms = clamp(round(raw * 5.8 / 300, 1), 4.0, 11.0)

Anchor: WC3 300 move speed == game 5.8 (verified — 龍宮禮奈 godie-e001 ships
「基礎跑速 300」and baseStats.ms 5.8; 300 is also the roster's modal speed). A
pure ratio preserves relative differences exactly: a WC3 320 unit ends up faster
than a 270 one, and the 522-cap heroes (the game's fastest) sit at ~10.1, still
inside the sim's MoveSpeed clamp [2, 14].

Clamp band [4.0, 11.0] only guards the degenerate tails (it is far wider than the
real data 4.6..10.1, so it does NOT flatten the spread): source move speeds below
`MS_MIN_SOURCE` (0 and the joke value 1) are not real speeds and are left at the
champion's existing default.

INHERITED (None) MOVE SPEED — an absent `umvs` is NOT a missing stat: the WC3
engine falls through to the BASE unit's speed (exactly the rule
`ggd-w3x-item-rawcodes` records for item modifiers — "absent from the w3a
inherited the stock value; it does not lack one"). Six roster heroes carry no
own move speed and are all based on stock hero units (Ofar/Udea/Usyl/Nbrn), every
one of which is `spd 320` in the stock `Units\\UnitBalance.slk` → game ms 6.2.
The importer had left them at the flat 5.8/6.0 default. `STOCK_MOVE_SPEED` below
is that inheritance, read once from the stock MPQ SLK and embedded (the MPQs are
gitignored, so the value is pinned here rather than re-read at runtime, matching
`stock_item_data.py`). A base with a real per-unit override in the source is
resolved first; only a genuinely stock-inherited hero falls to this table.

ATTACK SPEED is recomputed the same way the importer already does — as = 1/cooldown
(attacks/sec), clamped [0.4, 1.2] — but only when the source has a real cooldown,
so hand-set values on cooldown-less casters survive. In practice this is a no-op:
content `as` already tracks the source cooldown and already varies per champion.

HP/MANA REGEN are deliberately NOT sourced from the raw uhpr/umpr fields: those
are dominated by the flat WC3 defaults (0.25 hp on 48 heroes, 0.10 mana on 97)
plus a few garbage spikes (75.0 hp, 1000.0 mana). The real per-champion regen
spread comes from the WC3 hero STR/INT model the importer already applies
(healthRegen = 0.25 + 0.05·STR, manaRegen = 0.8 + 0.04·INT), which already
differs per champion (0.3..2.0 / 0.88..5.88). Importing the raw fields would
REPLACE that variation with a constant — the opposite of the goal.

This script only ever READS the object data and PATCHES two numeric baseStats
fields (ms, as) in content/champions/*.json. It never regenerates content and
never touches abilities/vfx/name/model. Run with --apply to write; default is a
dry-run report.

  python3 tools/w3x-import/extract_unit_stats.py            # dry-run report
  python3 tools/w3x-import/extract_unit_stats.py --apply    # write ms/as
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
from typing import Optional

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
DEFAULT_OBJECTS = os.path.join(
    HERE, "out", "GoDieEX22s-src", "OBJECTS.json"
)
CHAMPIONS_DIR = os.path.join(REPO, "content", "champions")

# WC3 300 move speed == game 5.8 (shop scale, verified on godie-e001).
MS_PER_WC3 = 5.8 / 300.0
MS_CLAMP = (4.0, 11.0)
MS_MIN_SOURCE = 100  # below this a "move speed" is a non-speed (0 / joke 1)

# Stock base-unit move speeds for the heroes whose own `umvs` is absent (None),
# read once from `Units\UnitBalance.slk` (col `spd`) across war3/War3x/War3Patch
# in the repo root and pinned here (the MPQs are gitignored, so this is not
# re-read at runtime — same pattern as stock_item_data.ITEM_STOCK_DATA). Every
# stock hero these six inherit from is 320. Regenerate with:
#   from w3xlib.mpq import W3XArchive; from stock_item_data import parse_slk
#   -> row col 1 = alias, col 35 = spd.
STOCK_MOVE_SPEED = {
    "Ofar": 320.0,  # Far Seer   — o00k, o02l, ofar(=self)
    "Udea": 320.0,  # Death Knight — udea(=self)
    "Usyl": 320.0,  # Banshee/Sylvanas — usyl(=self)
    "Nbrn": 320.0,  # Bandit Lord — n01l
}

# attacks/sec = 1 / cooldown, matching hero_to_champion.
AS_CLAMP = (0.4, 1.2)


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def convert_ms(raw: Optional[float]) -> Optional[float]:
    """WC3 move speed -> game ms, or None when the source has no real value."""
    if raw is None or raw < MS_MIN_SOURCE:
        return None
    return round(_clamp(raw * MS_PER_WC3, *MS_CLAMP), 1)


def source_move_speed(hero: dict, heroes: dict) -> Optional[float]:
    """Resolve a hero's effective WC3 move speed, honouring base-unit inheritance.

    A real per-unit `move_speed` wins. When it is absent (None) the WC3 engine
    falls through to the base unit: a custom base with its own real speed is
    followed first, then the stock table. An explicit joke value (0/1, i.e.
    < MS_MIN_SOURCE) is a deliberate override and is left to convert_ms (which
    returns None → the champion keeps its default). Guarded against base cycles.
    """
    seen: set[str] = set()
    cur = hero
    while cur is not None:
        raw = cur.get("move_speed")
        if raw is not None:
            # A real speed (incl. an explicit joke 0/1) STOPS the walk — we do
            # not paper over a deliberate 0 with a grandparent's speed.
            return raw
        base = cur.get("base")
        if not base or base.lower() in seen:
            break
        seen.add(base.lower())
        if base in STOCK_MOVE_SPEED:
            return STOCK_MOVE_SPEED[base]
        nxt = heroes.get(base.lower())
        if nxt is cur or nxt is None:
            break
        cur = nxt
    return None


def convert_as(cooldown: Optional[float]) -> Optional[float]:
    """WC3 attack cooldown (s) -> game as (attacks/sec), or None if no value."""
    if cooldown is None or cooldown <= 0:
        return None
    return round(_clamp(1.0 / cooldown, *AS_CLAMP), 2)


def load_heroes(objects_path: str) -> dict:
    with open(objects_path, encoding="utf-8") as fh:
        data = json.load(fh)
    return {k.lower(): v for k, v in data.get("heroes", {}).items()}


def iter_champion_files():
    for name in sorted(os.listdir(CHAMPIONS_DIR)):
        if not name.endswith(".json") or name == "_index.json":
            continue
        if not name.startswith("godie-"):
            continue
        yield name


def run(objects_path: str, apply: bool) -> int:
    heroes = load_heroes(objects_path)
    ms_changes: list[tuple] = []
    as_changes: list[tuple] = []
    new_ms_values: list[float] = []
    no_source: list[str] = []
    written = 0

    for name in iter_champion_files():
        path = os.path.join(CHAMPIONS_DIR, name)
        orig = open(path, encoding="utf-8").read()
        doc = json.loads(orig)
        base = doc.get("baseStats")
        if not isinstance(base, dict):
            continue
        suffix = name[len("godie-"):-len(".json")]
        hero = heroes.get(suffix)
        if hero is None:
            no_source.append(name)
            continue

        raw_ms = source_move_speed(hero, heroes)
        new_ms = convert_ms(raw_ms)
        if new_ms is not None:
            new_ms_values.append(new_ms)
            if base.get("ms") != new_ms:
                ms_changes.append((name, base.get("ms"), new_ms, raw_ms))
                base["ms"] = new_ms
        else:
            no_source.append(name)  # move speed kept at existing default

        raw_cd = hero.get("attack_cooldown")
        new_as = convert_as(raw_cd)
        if new_as is not None and base.get("as") != new_as:
            as_changes.append((name, base.get("as"), new_as, raw_cd))
            base["as"] = new_as

        if apply:
            out = json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
            if out != orig:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(out)
                written += 1

    # ---- report ----
    print(f"objects : {objects_path}")
    print(f"mode    : {'APPLY (wrote files)' if apply else 'dry-run'}")
    print()
    print(f"moveSpeed changes : {len(ms_changes)}")
    print(f"attackSpeed changes: {len(as_changes)}")
    print(f"no source move speed (kept default): {len(no_source)}")
    if written:
        print(f"files written: {written}")
    print()
    if new_ms_values:
        vals = sorted(new_ms_values)
        print("NEW move-speed spread across %d champions:" % len(vals))
        print("  min=%.1f  p25=%.1f  median=%.1f  p75=%.1f  max=%.1f  (span %.1f)"
              % (vals[0], vals[len(vals)//4], statistics.median(vals),
                 vals[(3*len(vals))//4], vals[-1], vals[-1] - vals[0]))
        print()

    if ms_changes:
        print("moveSpeed adjustments:")
        for name, old, new, raw in ms_changes:
            tag = "(stock-inherited base)" if raw == 320.0 and old in (5.8, 6.0) else ""
            print(f"  {name:24s} {old} -> {new}  (wc3={raw}) {tag}")
        print()

    if as_changes:
        print("attackSpeed adjustments:")
        for name, old, new, cd in as_changes:
            print(f"  {name:24s} {old} -> {new}  (cd={cd})")
        print()

    # ---- regen audit (READ-ONLY — see the module docstring) --------------
    # HP/mana regen are deliberately NOT raw-imported. This block surfaces WHY
    # so the decision is reproducible: the raw uhpr/umpr fields are the flat WC3
    # defaults on the overwhelming majority, and the non-default values on real
    # roster heroes are raid-boss-tier spikes (曹操 75/s, 張飛 15/s, 死之王 8/s,
    # 普烏 12/s) inherited from the units' original PvE roles — transplanting
    # them onto PvP arena champions makes them unkillable in a 3-min round. The
    # arena-meaningful per-champion regen already in content is derived from the
    # WC3 hero attribute model (STR->HP regen, INT->mana regen), which varies
    # correctly per champion. See task #144 / memory ggd-faithful-import.
    hpr_def = mpr_def = 0
    hpr_nondef: list[tuple] = []
    mpr_nondef: list[tuple] = []
    for name in iter_champion_files():
        hero = heroes.get(name[len("godie-"):-len(".json")])
        if hero is None:
            continue
        r = hero.get("hp_regen")
        if r is None or abs(r - 0.25) < 1e-6:
            hpr_def += 1
        else:
            hpr_nondef.append((name, r))
        m = hero.get("mana_regen")
        if m is None or abs(m - 0.10) < 1e-6:
            mpr_def += 1
        else:
            mpr_nondef.append((name, m))
    print("regen audit (NOT imported — attribute-model kept, see docstring):")
    print(f"  hp_regen  : {hpr_def} at WC3 default/None, "
          f"{len(hpr_nondef)} non-default (max {max((r for _, r in hpr_nondef), default=0)})")
    print(f"  mana_regen: {mpr_def} at WC3 default/None, "
          f"{len(mpr_nondef)} non-default (max {max((m for _, m in mpr_nondef), default=0)})")
    print()

    # A few spot-checks straddling the range (incl. a stock-inherited hero).
    spot = ["godie-e001", "godie-e00x", "godie-h02r", "godie-ogld", "godie-ofar"]
    print("spot-checks (champion : effective wc3 move_speed -> game ms):")
    for cid in spot:
        hero = heroes.get(cid[len("godie-"):])
        if hero is None:
            continue
        eff = source_move_speed(hero, heroes)
        print(f"  {cid:16s} {eff} -> {convert_ms(eff)}")

    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--objects", default=DEFAULT_OBJECTS,
                    help="path to the src map's OBJECTS.json")
    ap.add_argument("--apply", action="store_true",
                    help="write ms/as into content/champions/*.json")
    args = ap.parse_args(argv)
    if not os.path.exists(args.objects):
        print(f"OBJECTS.json not found: {args.objects}", file=sys.stderr)
        return 2
    return run(args.objects, args.apply)


if __name__ == "__main__":
    raise SystemExit(main())
