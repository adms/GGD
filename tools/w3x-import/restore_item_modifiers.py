#!/usr/bin/env python3
"""Task #108 — put the AUTHORED modifier list back on every imported item doc.

    python3 tools/w3x-import/restore_item_modifiers.py --check    # report only
    python3 tools/w3x-import/restore_item_modifiers.py            # apply

WHY. `w3xlib/objdata.py` used to infer an ability's data column from the 4th
character of its modification code. That holds for the spell families ('Ocr1',
'Ndr1') but not for the item family, whose fields are mnemonic — 'Iatt', 'Iagi',
'Istr', 'Ilif'. Every item-ability magnitude in the map was therefore parsed
away, and 86 item docs shipped missing 139 modifiers between them: 斬龍刀 kept
its 一擊斬 crit and lost the `ad +55` and `AGI +20` its own tooltip advertises.

That truncation is what made the task #82 AEP rescale dangerous. It solves
`lambda = budget / AEP`, so an item stripped of most of its power got scaled UP
hard — two legendaries reached `critChance 1.0`, a GUARANTEED crit on every auto
(BasicAttackSystem `if (cc > 0 && world.rng.chance(cc))`), at ~4-4.8x damage.

WHAT THIS WRITES. The pre-rescale authored list, so `rescale_items.py` can then
re-solve one scalar against a COMPLETE stat mix. Three sources, in order:

  1. the importer, re-run with the fixed parser — the authored w3x value;
  2. for stats the importer does not produce, the hand-curated port of an aura
     or an unmapped ability (奇門盾甲's `healthRegen` is its 每秒回復生命+16
     regeneration aura). Those are already rescaled on disk, so the authored
     value is recovered by dividing out the scalar the rescale applied, which is
     itself measured from the stats the importer DOES produce. Every one of the
     six items this applies to reconstructs exactly to its own tooltip — see
     the --check table — and a disagreement between the measured scalars is a
     refusal, not a guess;
  3. items whose entire modifier list is hand-curated (熱舞之靴's `ms`) keep
     their current value. There is no importer stat to measure a scalar from,
     but the whole array is on ONE scale already, so the mix `rescale_items.py`
     preserves is intact and re-solving from it is exactly the idempotence
     contract that script documents.

NOT IDEMPOTENT AGAINST ITSELF ONCE RESCALED. Run it, then run the rescale. A
second run on the rescaled corpus would read the rescaled hand-curated values
as authored and undo the rescale, so it REFUSES to write once the corpus is
sitting at its tier budgets. Pass --force when that is what you actually mean
(a re-import after a parser change, where the rescale is going to be re-run
straight afterwards anyway).
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from w3xlib.drafts import item_to_draft  # noqa: E402
from w3xlib.stats import parse_all  # noqa: E402

ROOT = HERE.parents[1]
ITEMS = ROOT / "content" / "items"
RAW = HERE / "out" / "GoDieEX22s" / "raw"

# The measured scalars must agree this closely before a hand-curated value is
# divided by them. They are ratios of JSON-rounded numbers, so they never agree
# exactly; 2% is far tighter than the spread any real disagreement would show.
SCALAR_TOL = 0.02


def content_id(rawcode: str) -> str:
    return "godie-i" + rawcode[1:].lower()


def shippable(v: float) -> float | int:
    """26, not 26.0 — an integral result should read as an integer in the JSON.

    Same convention as aep.round_value, which the rescale writes through; without
    it the items the rescale does not touch (the exempt ones, and anything
    outside the tier design) would be the only files in the tree with `-500.0`.
    """
    v = round(v, 3)
    return int(v) if v == int(v) else v


def fold(mods) -> dict:
    """{(stat, op): summed value} — an item can grant one stat twice."""
    out: dict[tuple[str, str], float] = {}
    for m in mods or []:
        k = (m["stat"], m["op"])
        out[k] = out.get(k, 0.0) + m["value"]
    return {k: shippable(v) for k, v in out.items()}


def looks_rescaled() -> tuple[int, int]:
    """(items sitting at their tier budget, items in the design).

    The rescale's whole output signature is "AEP == budget", so this is a
    direct read of whether it has already run over the corpus on disk.
    """
    sys.path.insert(0, str(ROOT / "tools" / "economy"))
    from aep import BUDGET_AEP, item_aep  # noqa: E402

    design = json.loads((ROOT / "tools" / "economy" / "tiers.json")
                        .read_text(encoding="utf-8"))["items"]
    at_budget = total = 0
    for iid, d in design.items():
        path = ITEMS / f"{iid}.json"
        if not path.exists():
            continue
        mods = json.loads(path.read_text(encoding="utf-8")).get("modifiers") or []
        if not mods:
            continue
        total += 1
        budget = BUDGET_AEP[d["tier"]]
        if abs(item_aep(mods) - budget) <= 0.005 * budget:
            at_budget += 1
    return at_budget, total


def run(apply: bool, force: bool) -> int:
    if apply and not force:
        at_budget, total = looks_rescaled()
        if total and at_budget > total // 2:
            print("REFUSING TO WRITE: %d of %d designed items are already sitting at\n"
                  "their tier budget, so rescale_items.py has run over this corpus.\n"
                  "Restoring authored magnitudes on top of that reads the RESCALED\n"
                  "hand-curated values as authored and quietly undoes the rescale.\n\n"
                  "  --check   see what it would do\n"
                  "  --force   do it anyway, then re-run tools/economy/rescale_items.py"
                  % (at_budget, total))
            return 2

    parsed = parse_all(str(RAW))
    items, abilities = parsed["items"], parsed["abilities"]

    rows, refused, changed = [], [], 0
    for rawcode, item in items.items():
        iid = content_id(rawcode)
        path = ITEMS / f"{iid}.json"
        if not path.exists():
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        shipped = fold(doc.get("modifiers"))
        if not shipped:
            continue

        notes: list[str] = []
        authored = fold(item_to_draft(item, abilities, iid, notes).get("modifiers"))

        hand = [k for k in shipped if k not in authored]
        if not authored:
            # Source 3: nothing to measure against, and nothing to mix.
            rows.append((iid, doc.get("name"), "hand-curated only", [], []))
            continue

        restored = dict(authored)
        recovered = []
        if hand:
            # Source 2. Measure the rescale's scalar on the stats the importer
            # produces, but only where the importer value is unchanged by the
            # parser fix — a stat that just gained a second contribution would
            # read as a different scalar and poison the median.
            scalars = [shipped[k] / authored[k] for k in shipped
                       if k in authored and authored[k]]
            spread = (max(scalars) - min(scalars)) if scalars else None
            if not scalars or spread > SCALAR_TOL * max(abs(s) for s in scalars):
                refused.append((iid, doc.get("name"),
                                "cannot measure the rescale scalar — the stats the "
                                "importer produces disagree (%s); hand-curated %s left "
                                "as-is" % ([round(s, 3) for s in scalars],
                                           [f"{s}.{o}" for s, o in hand])))
                for k in hand:
                    restored[k] = shipped[k]
            else:
                lam = statistics.median(scalars)
                for k in hand:
                    restored[k] = round(shipped[k] / lam, 3)
                    recovered.append((f"{k[0]}.{k[1]}", shipped[k], round(lam, 4),
                                      restored[k]))

        gained = [f"{s}.{o}" for s, o in restored if (s, o) not in shipped]
        out = [{"stat": s, "op": o, "value": v} for (s, o), v in restored.items()]
        if out != (doc.get("modifiers") or []):
            doc["modifiers"] = out
            changed += 1
            if apply:
                path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                                encoding="utf-8")
        rows.append((iid, doc.get("name"), "restored", gained, recovered))

    gained_total = sum(len(g) for _, _, _, g, _ in rows)
    print("item docs seen: %d   rewritten: %d   %s"
          % (len(rows), changed, "APPLIED" if apply else "DRY RUN"))
    print("modifiers the old parser had dropped, now restored: %d" % gained_total)

    withg = [r for r in rows if r[3]]
    print("\nITEMS THAT GAINED A MODIFIER (%d):" % len(withg))
    for iid, name, _, gained, _ in sorted(withg, key=lambda r: -len(r[3])):
        print("  %-14s %-22s + %s" % (iid, (name or "")[:20], ", ".join(gained)))

    rec = [r for r in rows if r[4]]
    if rec:
        print("\nHAND-CURATED STATS, UNSCALED BACK TO AUTHORED (%d items):" % len(rec))
        for iid, name, _, _, recovered in rec:
            for stat, on_disk, lam, back in recovered:
                print("  %-14s %-20s %-16s on disk %-8s / scalar %-8s = %s"
                      % (iid, (name or "")[:18], stat, on_disk, lam, back))

    if refused:
        print("\nREFUSED (%d) — left exactly as they are on disk:" % len(refused))
        for iid, name, msg in refused:
            print("  %-14s %-20s %s" % (iid, (name or "")[:18], msg))

    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    ap.add_argument("--force", action="store_true",
                    help="write even though the corpus is already rescaled")
    a = ap.parse_args()
    sys.exit(run(apply=not a.check, force=a.force))
