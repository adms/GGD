"""AEP (AD-Equivalent Point) valuation of an item's modifier list.

Task #82. The marginal rates are FORMULA A from phase 1 (valuation.py), which
derived them numerically from the shipped sim (combat/damage.ts mitigate(),
BasicAttackSystem crit/cadence, RegenSystem, stats/statPipeline.ts layering,
STAT_CLAMPS) on the roster-median reference champion at level 5, normalised so
that 1 point of AD == 1.0 AEP.

This module is the single source of truth for "what is this item worth".
Both the rescale (rescale_items.py) and its verification import from here.
"""
from __future__ import annotations

# ---------------------------------------------------------------- Formula A
# d(ln POWER)/d(stat), normalised to 1 AD = 1 AEP.  Verbatim from
# PHASE1_pricing.json -> formulaA_rates_L5 (produced by valuation.py
# marginal_rates(level=5)).  Do not hand-edit: regenerate from valuation.py.
RATES_L5 = {
    "maxHealth": 0.09814376339700233,
    "healthRegen": 1.9838944595366166,
    "maxMana": 0.034255615552292985,
    "manaRegen": 0.5897322737576802,
    "ad": 1.0,
    "ap": 0.20544822085454337,
    "armor": 0.38223904166936246,
    "mr": 0.171894520333211,
    "as": 72.7579088696102,
    "ms": 7.848078700485038,
    "critChance": 28.448894666337612,
    "critDamage": 5.6897708920337555,
    "cdr": 0.0,
    "lifesteal": 24.412581181774023,
    "range": 20.32189599701004,
}

# Reference champion base stats at L5 (roster median base + median growth x4).
# Needed because statPipeline.ts applies `pctAdd` against (base + flat), so a
# percentage modifier is only worth rate * base * value.
BASE_L5 = {
    "maxHealth": 480.0 + 37.0 * 4,
    "healthRegen": 1.15 + 0.14 * 4,
    "maxMana": 304.0 + 22.0 * 4,
    "manaRegen": 1.48 + 0.07 * 4,
    "ad": 35.0 + 1.8 * 4,
    "ap": 0.0,
    "armor": 8.0 + 0.6 * 4,
    "mr": 28.0 + 1.2 * 4,
    "as": 0.50 + 0.02 * 4,
    "ms": 5.8,
    "critChance": 0.15,
    "critDamage": 1.75,
    "cdr": 0.0,
    "lifesteal": 0.0,
    "range": 1.6,
}

# Tier budgets, in AEP.  PHASE1_pricing.json -> budgets_AEP.
BUDGET_AEP = {"SIMPLE": 6.5, "POWERFUL": 26.0, "LEGENDARY": 52.0, "STAT_TICK": 6.5}
TIER_PRICE = {"SIMPLE": 300, "POWERFUL": 1200, "LEGENDARY": 0, "STAT_TICK": 375}
# content `tier` is an integer rank, not the tier name.
TIER_RANK = {"SIMPLE": 1, "POWERFUL": 2, "LEGENDARY": 3}


def modifier_aep(stat: str, op: str, value: float) -> float:
    """AEP contributed by one modifier row."""
    rate = RATES_L5.get(stat)
    if rate is None:
        return 0.0
    if op == "flat":
        return rate * value
    if op == "pctAdd":
        # (base + flat) * (1 + pctAdd): the delta is base * value.
        return rate * BASE_L5.get(stat, 0.0) * value
    if op == "pctMult":
        return rate * BASE_L5.get(stat, 0.0) * value
    # override / unknown ops carry no priced delta
    return 0.0


def item_aep(modifiers) -> float:
    """Total AEP of a modifier list (as stored in a content/items/*.json)."""
    return sum(modifier_aep(m["stat"], m["op"], m["value"]) for m in modifiers)


# Rounding: one decimal for most stats reads fine in a tooltip; the fractional
# stats (crit chance, lifesteal, percentages) are fractions of 1.0 and need three.
DECIMALS = {
    "maxHealth": 0,
    "maxMana": 0,
    "ad": 1,
    "ap": 1,
    "armor": 1,
    "mr": 1,
    # healthRegen carries the largest rate in the table (1.98 AEP per point), so
    # one decimal is a 0.2 AEP quantum — 3% of the SIMPLE budget, coarse enough
    # to miss the budget on its own. Two decimals brings it back under tolerance.
    "healthRegen": 2,
    "manaRegen": 3,
    "ms": 3,
    "as": 3,
    "critChance": 3,
    "critDamage": 3,
    "lifesteal": 3,
    "cdr": 3,
    "range": 2,
}


def round_value(stat: str, op: str, value: float) -> float:
    """Round a rescaled modifier to a value that ships cleanly in JSON."""
    nd = 3 if op != "flat" else DECIMALS.get(stat, 2)
    r = round(value, nd)
    # never round a real bonus away to nothing
    if r == 0 and value > 0:
        r = round(10 ** -nd, nd)
    # emit 26, not 26.0 — an integral result should read as an integer in the JSON
    return int(r) if r == int(r) else r
