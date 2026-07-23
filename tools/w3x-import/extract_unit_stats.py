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

# attacks/sec = 1 / cooldown, matching hero_to_champion.
AS_CLAMP = (0.4, 1.2)


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def convert_ms(raw: Optional[float]) -> Optional[float]:
    """WC3 move speed -> game ms, or None when the source has no real value."""
    if raw is None or raw < MS_MIN_SOURCE:
        return None
    return round(_clamp(raw * MS_PER_WC3, *MS_CLAMP), 1)


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

        raw_ms = hero.get("move_speed")
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

    if as_changes:
        print("attackSpeed adjustments:")
        for name, old, new, cd in as_changes:
            print(f"  {name:24s} {old} -> {new}  (cd={cd})")
        print()

    # A few spot-checks straddling the range.
    spot = ["godie-e001", "godie-e00x", "godie-h02r", "godie-ogld", "godie-hblm"]
    print("spot-checks (champion : source move_speed -> game ms):")
    for cid in spot:
        hero = heroes.get(cid[len("godie-"):])
        if hero is None:
            continue
        print(f"  {cid:16s} {hero.get('move_speed')} -> {convert_ms(hero.get('move_speed'))}")

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
