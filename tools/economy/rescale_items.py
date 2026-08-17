#!/usr/bin/env python3
"""Task #82 phase 2 — apply the price tiers and the AEP rescale to content/items.

THE SCRIPT IS THE ARTEFACT. A later tweak to the valuation model (tools/economy/aep.py)
or to the tier assignment (tools/economy/tiers.json) regenerates the whole corpus:

    python3 tools/economy/rescale_items.py            # apply
    python3 tools/economy/rescale_items.py --check    # verify only, no writes
    python3 tools/economy/rescale_items.py --report   # apply + per-item table

WHAT IT DOES, per item named in tiers.json:
  1. writes `cost` and `tier` from the tier assignment (SIMPLE 300/1, POWERFUL 1200/2,
     LEGENDARY 0/3 — legendaries are draft-only, cost 0 so nothing can sell them);
  2. scales every entry in the `modifiers` array by one scalar so the item's total
     AEP equals its tier budget. ONE scalar for the whole array, so the stat mix is
     preserved exactly: an armour-and-health item stays armour-and-health in the
     same proportion. Only magnitude moves.

IDEMPOTENT BY CONSTRUCTION. The scalar is solved from the item's CURRENT value
(lambda = budget / AEP_current), not from a stored "authored" baseline, so running
it twice is a no-op (the second run solves lambda == 1) and running it on a
half-applied corpus finishes the job instead of double-scaling it. That property is
what makes it safe to re-run after a model change.

ROUNDING. Naive `round(v * lambda)` misses the budget by up to a rounding quantum —
on a maxHealth-only item the quantum is a whole hit point, ~1.5% of the SIMPLE
budget. So the scalar is not used directly: the script searches a narrow band around
it for the lambda whose ROUNDED output lands closest to the budget, breaking ties
toward the pure-proportional value. Result: shippable numbers (36.6 armour, never
36.6000000001) that still hit the budget.

TASK #83 (importer duplicates modifier arrays). Four items ship with their modifier
array literally concatenated with itself. Rescaling one of those bakes the doubling
in permanently, so they are DEDUPED FIRST — and only when the array is provably an
exact [A | A] concatenation. Anything else is left alone: several items legitimately
carry two rows for the same stat, because the w3x source granted it through two
different ability columns.
"""
from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from aep import (  # noqa: E402
    BUDGET_AEP,
    TIER_PRICE,
    TIER_RANK,
    item_aep,
    round_value,
)

ROOT = Path(__file__).resolve().parents[2]
ITEMS = ROOT / "content" / "items"
TIERS = Path(__file__).resolve().parent / "tiers.json"

# Budget tolerance. 0.5% of the tier budget — tight enough that a real modelling
# error shows up, loose enough to absorb one JSON rounding quantum.
TOL = 0.005

# packages/shared/src/content/schema/common.ts ITEM_MODIFIER_LIMITS / ITEM_PERCENT_LIMIT.
# A rescale that would push a modifier past the loader's guard must not be written
# silently — it is reported instead.
#
# ⛔ THIS IS A HAND-COPIED MIRROR OF A ZOD TABLE — i.e. a second home for a number
# that has no drift guard. It has already rotted twice, both times SILENTLY:
#   · a stat MISSING here disables the check entirely (`MODIFIER_LIMITS.get()`
#     returns None and every caller does `if lim is not None`), so the run reports
#     a clean bill of health on a band it never looked at. 8 stats were in that
#     state until 2026-08-18 — evasion / spellVamp plus the 6 added by GH#354.
#   · a stat whose band moved in schema/common.ts keeps the OLD number here; the
#     script then refuses a value the loader would happily accept.
# ⚠️ Two rows are still knowingly out of sync with the shipped Zod as of
# 2026-08-18 — NOT fixed here because raising a band loosens what the AEP rescale
# is allowed to write, and that is a balance call for the owner, not a typo:
#       as   here 2.5  ← shipped 4.0 (STAT_CLAMPS 一般上限, owner 2026-07-28)
#       cdr  here 0.45 ← shipped 1   (STAT_CLAMPS 上界 0.99, owner 2026-08-10)
MODIFIER_LIMITS = {
    "maxHealth": 2500, "healthRegen": 100, "maxMana": 2500, "manaRegen": 50,
    "ad": 400, "ap": 400, "armor": 150, "mr": 200, "as": 2.5, "ms": 5,
    "critChance": 1, "critDamage": 50, "cdr": 0.45, "lifesteal": 1, "range": 5,
    "evasion": 1, "spellVamp": 1,
    # GH#354 (2026-08-18). All six are rates whose band is a MIS-PARSE guard
    # ("0.2 typed as 20"), not a balance opinion — same wording as the Zod table.
    "outputDamagePct": 0.5, "outputHealingPct": 0.5, "outputShieldPct": 0.5,
    "maxHitPctMaxHp": 0.5, "unavoidablePct": 0.5, "cooldownDrainRate": 0.5,
}
PERCENT_LIMIT = 3

# Task #83. Listed explicitly so the fix is auditable, and re-verified structurally
# before anything is removed.
DOUBLED_BY_IMPORTER = ["godie-i00w", "godie-i00z", "godie-i02g", "godie-i049"]

# A sanity band is a MAGNITUDE guard, but for a few stats the band sits exactly
# on a QUALITATIVE cliff, and capping there does not under-power the item — it
# changes the mechanic. `critChance` is the one that bit: the band is 1, and
# `critChance 1.0` is not "a lot of crit", it is every auto attack critting
# (BasicAttackSystem.ts `if (cc > 0 && world.rng.chance(cc))`, and chance(1.0)
# is always true). Task #82 phase 2 shipped 斬龍刀 and 龍騎士之劍 exactly there,
# at ~4-4.8x damage on 100% of autos, and --report called it a rounding
# shortfall ("reaches 88% of budget") because it only measured the AEP gap.
#
# So this is a FAILED RUN, not a note: nothing is written, because a corpus
# half-written with a degenerate item in it is worse than one not written at
# all. Fix the input (the item was missing modifiers, so the solver had to
# scale what was left through the roof) or exempt the item — do not raise the
# band, which is what the "verified w3x value can earn that, a synthetic
# rescale cannot" rule in lambda_ceiling() is about.
DEGENERATE_AT = {
    "critChance": (1.0, "a guaranteed crit on every auto attack"),
    "lifesteal": (1.0, "every point of damage dealt returned as health"),
}

# Items the AEP rescale must not touch the modifiers of. `cost` and `tier` are
# still written — they are surface facts, not magnitudes.
#
# 天堂之劍 is a 3%-chance 50x crit, confirmed three ways (its 「3%機率造成50倍
# 傷害」 tooltip, its A110 DataB1, and the stock AIcs default), and that 50x IS
# the item: it is a quest reward built around one absurd swing. Under Formula A
# it prices at 226 AEP against a 26-AEP POWERFUL budget, so ANY rescale crushes
# it back to ~5.5x — which is what phase 2 did, silently reverting the explicit
# decision recorded at packages/shared/src/content/schema/common.ts (the
# ITEM_MODIFIER_LIMITS band was raised from 5 to 50 *for this item*). Listing it
# here is what stops the next re-run from reverting it again.
RESCALE_EXEMPT = {
    "godie-i01n": "天堂之劍's crit multiplier is OWNER-SET, not budget-derived — "
                  "the w3x says 3%/50x (+48.25) and the owner overruled it to "
                  "6%/10x (+8.25) on 2026-07-30 「不然太誇張了」. Either way the "
                  "AEP model prices it far over budget and would crush it, "
                  "reverting a human decision (it did once already). See "
                  "ITEM_MODIFIER_LIMITS.CritDamage in schema/common.ts.",
}


def load_design() -> dict:
    return json.loads(TIERS.read_text(encoding="utf-8"))


def is_exact_duplicate_array(mods: list) -> bool:
    """True when `mods` is provably [A | A] — the task #83 importer signature."""
    n = len(mods)
    if n < 2 or n % 2 != 0:
        return False
    half = n // 2
    return mods[:half] == mods[half:]


def dedupe(mods: list) -> list:
    return mods[: len(mods) // 2]


def scale(mods: list, lam: float) -> list:
    out = []
    for m in mods:
        v = round_value(m["stat"], m["op"], m["value"] * lam)
        n = dict(m)
        n["value"] = v
        out.append(n)
    return out


def lambda_ceiling(mods: list) -> float:
    """Largest scalar that keeps every modifier inside the loader's item band.

    Scaling UP is what makes this bite: a legendary whose authored mix is
    dominated by a stat Formula A prices near zero needs a huge multiplier to
    reach 52 AEP, and that multiplier drives the stat through the guard. The
    guard is not raised to accommodate a number this script invented — a
    verified w3x value can earn that, a synthetic rescale cannot. The item is
    capped and reported instead.
    """
    ceil = float("inf")
    for m in mods:
        v = abs(m["value"])
        if v == 0:
            continue
        pct = m["op"] in ("pctAdd", "pctMult")
        lim = PERCENT_LIMIT if pct else MODIFIER_LIMITS.get(m["stat"])
        if lim is not None:
            ceil = min(ceil, lim / v)
    return ceil


def solve_lambda(mods: list, budget: float) -> tuple[float, list, float, bool]:
    """Find the scalar whose ROUNDED output lands closest to `budget`.

    Returns (lambda, rounded modifiers, resulting AEP, capped). Searches a narrow
    band around the exact proportional scalar and prefers, among equally-good
    candidates, the one nearest that scalar — so the mix stays as close to pure
    proportional scaling as the JSON rounding grid allows.
    """
    cur = item_aep(mods)
    if cur <= 0:
        return 1.0, [dict(m) for m in mods], cur, False
    lam0 = budget / cur
    ceil = lambda_ceiling(mods)
    capped = lam0 > ceil
    if capped:
        lam0 = ceil
    best = None
    steps = 2000
    for i in range(-steps, steps + 1):
        lam = lam0 * (1.0 + i * 5e-5)  # +/- 10% band, 0.005% resolution
        if lam > ceil:
            continue
        cand = scale(mods, lam)
        if guard_violations(cand):
            continue
        err = abs(item_aep(cand) - budget)
        key = (round(err, 9), abs(lam - lam0))
        if best is None or key < best[0]:
            best = (key, lam, cand)
        if err == 0 and i >= 0:
            break
    if best is None:  # nothing in band clears the guard — leave the item alone
        return 1.0, [dict(m) for m in mods], cur, True
    _, lam, cand = best
    return lam, cand, item_aep(cand), capped


def degenerate_values(mods: list) -> list:
    """Modifiers sitting ON a value that is a broken mechanic, not a big number."""
    bad = []
    for m in mods:
        hit = DEGENERATE_AT.get(m["stat"])
        if hit and m["op"] == "flat" and abs(m["value"]) >= hit[0]:
            bad.append((m["stat"], m["value"], hit[1]))
    return bad


def guard_violations(mods: list) -> list:
    bad = []
    for m in mods:
        pct = m["op"] in ("pctAdd", "pctMult")
        lim = PERCENT_LIMIT if pct else MODIFIER_LIMITS.get(m["stat"])
        if lim is not None and abs(m["value"]) > lim:
            bad.append((m["stat"], m["op"], m["value"], lim))
    return bad


def run(apply: bool, report: bool) -> int:
    design = load_design()
    rows, problems, deduped, exempt = [], [], [], []
    degenerate: list[tuple] = []
    # Writes are held until every item has been solved. A degenerate result
    # anywhere aborts the whole run, and a corpus half-rewritten around one
    # broken item is harder to reason about than one not rewritten at all.
    pending: list[tuple[Path, dict]] = []

    for iid, d in design["items"].items():
        path = ITEMS / f"{iid}.json"
        if not path.exists():
            problems.append((iid, "MISSING FILE", "no content/items/%s.json" % iid))
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        before = copy.deepcopy(doc)
        tier = d["tier"]
        budget = BUDGET_AEP[tier]

        mods = doc.get("modifiers") or []

        # --- task #83: undo the importer's array duplication BEFORE scaling.
        if iid in DOUBLED_BY_IMPORTER:
            if is_exact_duplicate_array(mods):
                mods = dedupe(mods)
                deduped.append((iid, doc.get("name"), len(before.get("modifiers") or []), len(mods)))
            elif len(mods) != len(set((m["stat"], m["op"], m["value"]) for m in mods)):
                problems.append((iid, "DEDUPE REFUSED",
                                 "listed as doubled but the array is not an exact [A|A] "
                                 "concatenation — left untouched for review"))

        aep_in = item_aep(mods)
        if iid in RESCALE_EXEMPT:
            exempt.append((iid, doc.get("name"), aep_in, budget, RESCALE_EXEMPT[iid]))
            lam, out_mods, aep_out, capped = 1.0, mods, aep_in, False
        elif aep_in <= 0:
            problems.append((iid, "NOT RESCALABLE",
                             "no priceable modifiers (AEP 0) — all of its power is in a "
                             "scripted passive, which has no magnitude for a stat rescale to move"))
            lam, out_mods, aep_out, capped = 1.0, mods, 0.0, False
        elif abs(aep_in - budget) <= TOL * budget and not guard_violations(mods):
            # Already at budget. Leave the bytes alone rather than chase the last
            # thousandth of an AEP — without this dead-zone the solver flips a
            # trailing digit on a couple of items every run and the script is no
            # longer idempotent, which is the whole point of it being re-runnable.
            lam, out_mods, aep_out, capped = 1.0, mods, aep_in, False
        else:
            lam, out_mods, aep_out, capped = solve_lambda(mods, budget)
            if capped:
                binding = sorted(
                    ((abs(m["value"]) / (PERCENT_LIMIT if m["op"] != "flat"
                                         else MODIFIER_LIMITS.get(m["stat"], 1e18)), m)
                     for m in out_mods if m["value"]), key=lambda x: -x[0])[0][1]
                problems.append((iid, "BUDGET CAPPED",
                                 "cannot reach %.1f AEP in its authored stat mix — %s %s is "
                                 "already at the loader's sanity band (%s); reaches %.1f AEP "
                                 "(%.0f%% of budget)"
                                 % (budget, binding["stat"], binding["op"], binding["value"],
                                    aep_out, 100 * aep_out / budget)))

        # Price comes from the SURFACE, not the tier. A quest-card reward is a
        # POWERFUL-budget item that must still be free: it is won, not bought, and
        # a non-zero cost would put it back on a shelf (and make it sellable).
        # Only `shop` items carry the tier price.
        for stat, value, why in degenerate_values(out_mods):
            degenerate.append((iid, doc.get("name"), stat, value, why,
                               "capped at the sanity band" if capped else "authored"))

        # Price comes from the SURFACE, not the tier. A quest-card reward is a
        # POWERFUL-budget item that must still be free: it is won, not bought, and
        # a non-zero cost would put it back on a shelf (and make it sellable).
        # Only `shop` items carry the tier price.
        doc["cost"] = TIER_PRICE[tier] if d["surface"] == "shop" else 0
        doc["tier"] = TIER_RANK[tier]
        if out_mods:
            doc["modifiers"] = out_mods
        rows.append(dict(id=iid, name=doc.get("name"), surface=d["surface"], tier=tier,
                         budget=budget, aep_in=round(aep_in, 4), lam=round(lam, 6),
                         aep_out=round(aep_out, 4), ratio=round(aep_out / budget, 5),
                         passive=bool(doc.get("passive")),
                         exempt=iid in RESCALE_EXEMPT))

        if doc != before:
            pending.append((path, doc))

    # Task #83 also names items the economy design does not cover (they are not
    # whitelisted, so they never reach a shop). Undo the duplication anyway — a
    # known-doubled array left on disk is a trap for the next pass — but do NOT
    # rescale, because an item outside the design has no budget to normalise to.
    for iid in DOUBLED_BY_IMPORTER:
        if iid in design["items"]:
            continue
        path = ITEMS / f"{iid}.json"
        if not path.exists():
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        mods = doc.get("modifiers") or []
        if not is_exact_duplicate_array(mods):
            continue
        doc["modifiers"] = dedupe(mods)
        deduped.append((iid, doc.get("name"), len(mods), len(doc["modifiers"])))
        problems.append((iid, "DEDUPED, NOT RESCALED",
                         "outside the tier design (not whitelisted) — the importer "
                         "duplication is undone, but it has no tier budget to "
                         "normalise to, so its magnitude is left as authored "
                         "(%.2f AEP)" % item_aep(doc["modifiers"])))
        pending.append((path, doc))

    # --- the run either lands whole or not at all.
    if degenerate:
        print("DEGENERATE RESULT — NOTHING WAS WRITTEN (%d):\n" % len(degenerate))
        for iid, name, stat, value, why, how in degenerate:
            print("  %-14s %-22s %s = %s (%s) — %s"
                  % (iid, (name or "")[:20], stat, value, how, why))
        print("\nA sanity band is a magnitude guard; these values are a broken\n"
              "mechanic, so capping to them is not an under-powered item. Either\n"
              "fix the input (an item missing modifiers forces the solver to scale\n"
              "what is left through the roof) or add the item to RESCALE_EXEMPT.")
        return 2

    if apply:
        for path, doc in pending:
            path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                            encoding="utf-8")

    off = [r for r in rows if abs(r["ratio"] - 1.0) > TOL and not r["exempt"]]

    print("items in design: %d   files rewritten: %d   %s"
          % (len(rows), len(pending), "APPLIED" if apply else "DRY RUN"))
    if exempt:
        print("\nEXEMPT FROM RESCALE (%d) — modifiers untouched, cost/tier still written:"
              % len(exempt))
        for iid, name, aep, budget, why in exempt:
            print("  %-14s %-22s %.1f AEP against a %.1f budget — %s"
                  % (iid, (name or "")[:20], aep, budget, why))
    if deduped:
        print("\ntask #83 — deduplicated importer-doubled modifier arrays (%d):" % len(deduped))
        for iid, name, n0, n1 in deduped:
            print("  %-14s %-24s %d rows -> %d" % (iid, name, n0, n1))
    print("\nAT BUDGET: %d / %d  (tolerance +/-%.1f%%)" % (len(rows) - len(off), len(rows), TOL * 100))
    if off:
        print("OFF BUDGET (%d):" % len(off))
        for r in sorted(off, key=lambda x: -abs(x["ratio"] - 1)):
            print("  %-14s %-22s %-9s B=%-5s AEP=%-8s x%s"
                  % (r["id"], (r["name"] or "")[:20], r["tier"], r["budget"], r["aep_out"], r["ratio"]))
    if problems:
        print("\nPROBLEMS (%d):" % len(problems))
        for iid, kind, msg in problems:
            print("  [%s] %s: %s" % (kind, iid, msg))

    if report:
        print("\n%-14s %-24s %-16s %-9s %8s %8s %9s %s"
              % ("id", "name", "surface", "tier", "AEP_in", "lambda", "AEP_out", "passive"))
        for r in sorted(rows, key=lambda x: (x["tier"], x["id"])):
            print("%-14s %-24s %-16s %-9s %8.3f %8.4f %9.3f %s"
                  % (r["id"], (r["name"] or "")[:22], r["surface"], r["tier"],
                     r["aep_in"], r["lam"], r["aep_out"], "yes" if r["passive"] else ""))

    return 1 if (off or problems) else 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="verify only, write nothing")
    ap.add_argument("--report", action="store_true", help="print the full per-item table")
    a = ap.parse_args()
    sys.exit(run(apply=not a.check, report=a.report))
