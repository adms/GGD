#!/usr/bin/env python3
"""
#248 STEP 3 — push the RESOLVED w3x attributes into `content/champions/*.json`.

WHAT THIS DOES
--------------
`resolve_unit_stats.py` already walked every hero's `base` chain (map override →
map ancestor → Blizzard stock MPQ) and produced RESOLVED_HERO_STATS.json. This
script turns that into the two content edits #248 asks for:

  1. every champion doc gains an `attributes` block
     (str/agi/int + per-level growths + primary + provenance), and
  2. `baseStats` is REBASED to the raw w3x numbers, because the attribute term
     is now added by the sim at runtime through the combat-env coefficients:

        maxHealth   = w3x_hp        + strToMaxHealth      · STR      (25)
        healthRegen = w3x_hp_regen  + strToHealthRegen    · STR      (0.05)
        ad          = dice mean     + strToAttackDamage   · STR      (1)
        armor       = w3x_armor     + agiToArmor          · AGI      (0.3)
        as          = 1/attack_cd   · (1 + agiToAttackSpeed · AGI)   (0.02)
        maxMana     = w3x_mana      + intToMaxMana        · INT      (15)
        manaRegen   = w3x_mana_regen+ intToManaRegen      · INT      (0.05)
        ap          = 0             + intToAbilityPower   · INT      (1)

  3. `growth` is left ENTIRELY ALONE, and so are `ms`, `mr`, `range`,
     `critChance`, `critDamage`, `cdr`, `lifesteal` and `evasion`.

WHY `growth` SURVIVES (owner ruling, #248)
------------------------------------------
An earlier draft of this task had the script delete the seven `growth.*` rows
the attribute growths now also supply. The owner overruled that:

    「growth 區塊就是重複來源 => 本來就可以重複沒有衝突」

Two additive sources is only double-counting if they are meant to represent the
SAME thing, and these are not. `attributes.*Growth` carries the w3x-faithful
part of the curve; `growth.*` stays as the per-hero designer knob layered on
top, so a hero's progression is not locked to his three attributes. The law is

    stat(L) = baseStats + attr(L)·coefficient + growth·(L−1)

and it lives in exactly one place, `championStatBase` (sim/stats/attributes.ts).
`growth.mr` is simply the row where the attribute term is zero, because
Warcraft III has no magic-resistance attribute.

CONSEQUENCE, measured so nobody re-derives it: at level 12, with the maxHealth
multiplier at its new ×4, keeping both sources lands at 78–91% of today's
effective HP (Saber 9392→8246, 魯夫 9032→8241, 揍敵客 6000→5070,
喪標麥可 7000→5480). Deleting `growth` would have landed at 50–63%.

WHY IT IS A LINE EDITOR AND NOT `json.dump`
-------------------------------------------
A champion doc embeds a full mirror copy of its four abilities (the MIRROR RULE,
packages/shared/src/content/editModel.ts). Re-serialising the whole document
would reflow ~300 lines of ability JSON per champion and make the diff unreadable
and unreviewable, and any key-order or float-formatting difference would look
like a content change. So this only rewrites the `baseStats` / `growth` blocks
line by line and splices an `attributes` block in after them; every other byte of
the file is preserved exactly.

USAGE
    python3 tools/w3x-import/apply_attributes_to_content.py [--check]

`--check` reports what would change and exits non-zero if anything would.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RESOLVED = os.path.join(ROOT, "tools", "w3x-import", "out", "GoDieEX22s-src", "RESOLVED_HERO_STATS.json")
CHAMPS = os.path.join(ROOT, "content", "champions")

# The eight owner-approved coefficients. They are ALSO the shipped defaults of
# the combat-env keys of the same name (packages/shared/src/sim/combatEnv.ts and
# content/config/combat-env.json) — this table only decides what the REBASED
# baseStats must be so that base + coef·attr reproduces the derivation.
COEF = {
    "strToMaxHealth": 25.0,
    "strToHealthRegen": 0.05,
    "strToAttackDamage": 1.0,
    "agiToArmor": 0.3,
    "agiToAttackSpeed": 0.02,
    "intToMaxMana": 15.0,
    "intToManaRegen": 0.05,
    "intToAbilityPower": 1.0,
}

# ---------------------------------------------------------------------------
# The three champions with no w3x source (#248 (e)). Their attributes are
# AUTHORED, chosen so that the level-1 sheet reproduces today's card EXACTLY for
# every attribute-derived stat; `ap` is the one deliberate exception (it goes
# 0 → INT for the whole roster, that IS the change).
#
# Their GROWTH curves are not reproduced and are not meant to be: `growth` is
# kept untouched (owner ruling above), so the attribute growths are an ADDITION
# to it, exactly as they are for the 111 w3x champions. Each is pinned to the
# curve it reads most naturally against:
#   strGrowth ← the maxHealth curve   (HP is the balance-critical one)
#   agiGrowth ← the attack-speed curve (armor growth of 4.0/level on sela and
#               thorne is a hand-authored outlier; pinning to it instead would
#               push their level-18 attack speed past the 2.5 clamp)
#   intGrowth ← the maxMana curve
# godie-zombiex uses the attributes named in the #248 brief: #244's deliberate
# 380 HP is reproduced to the digit at level 1 (80 raw + 25×12), and its +45
# per level is reproduced by str +1.8 — on top of the doc's own growth.maxHealth
# 45, which survives, giving the effective ×4 level-12 figure of 5480 the brief
# states. championZombiexTuning.test.ts pins both halves.
# ---------------------------------------------------------------------------
AUTHORED = {
    "sela": dict(str=18, agi=16, int=26, str_growth=3.6, agi_growth=None, int_growth=3.0, primary="INT"),
    "thorne": dict(str=24, agi=18, int=14, str_growth=4.4, agi_growth=None, int_growth=2.0, primary="STR"),
    "godie-zombiex": dict(str=12, agi=8, int=6, str_growth=1.8, agi_growth=0.6, int_growth=0.8, primary="STR"),
}


def r(x: float, n: int = 6) -> float:
    """Round and drop a pointless trailing .0 so the JSON reads like the rest."""
    v = round(float(x) + 0.0, n)
    return int(v) if v == int(v) else v


def dice_mean(base: float, dice: float, sides: float) -> float:
    """WC3 attack damage = base + dice·(sides+1)/2 (the mean roll)."""
    return base + dice * (sides + 1.0) / 2.0


def derive_from_w3x(res: dict) -> dict:
    """Rebased baseStats fields + the attributes block, from a resolved unit."""
    st, ag, it = res["str"], res["agi"], res["int"]
    cd = res["attack_cooldown"] or 1.0
    return {
        "base": {
            "maxHealth": r(res["hp"]),
            "healthRegen": r(res["hp_regen"]),
            "maxMana": r(res["mana"]),
            "manaRegen": r(res["mana_regen"]),
            "ad": r(dice_mean(res["dmg_base"], res["dmg_dice"], res["dmg_sides"])),
            "ap": 0,
            "armor": r(res["armor"]),
            "as": r(1.0 / cd),
        },
        "attributes": {
            "str": r(st, 3),
            "agi": r(ag, 3),
            "int": r(it, 3),
            "strGrowth": r(res["str_growth"], 3),
            "agiGrowth": r(res["agi_growth"], 3),
            "intGrowth": r(res["int_growth"], 3),
            "primary": res["primary_attr"] or "STR",
            "source": "w3x",
        },
    }


def derive_authored(cur_base: dict, cur_growth: dict, a: dict) -> dict:
    """Back-solve the raw base values so level 1 is byte-identical to today."""
    st, ag, it = a["str"], a["agi"], a["int"]
    as_base = cur_base["as"] / (1.0 + COEF["agiToAttackSpeed"] * ag)
    agi_growth = a["agi_growth"]
    if agi_growth is None:
        # preserve today's per-level attack speed exactly
        agi_growth = cur_growth.get("as", 0.0) / (as_base * COEF["agiToAttackSpeed"])
    return {
        "base": {
            "maxHealth": r(cur_base["maxHealth"] - COEF["strToMaxHealth"] * st),
            "healthRegen": r(cur_base["healthRegen"] - COEF["strToHealthRegen"] * st),
            "maxMana": r(cur_base["maxMana"] - COEF["intToMaxMana"] * it),
            "manaRegen": r(cur_base["manaRegen"] - COEF["intToManaRegen"] * it),
            "ad": r(cur_base["ad"] - COEF["strToAttackDamage"] * st),
            "ap": 0,
            "armor": r(cur_base["armor"] - COEF["agiToArmor"] * ag),
            "as": r(as_base),
        },
        "attributes": {
            "str": r(st, 3),
            "agi": r(ag, 3),
            "int": r(it, 3),
            "strGrowth": r(a["str_growth"], 3),
            "agiGrowth": r(agi_growth, 3),
            "intGrowth": r(a["int_growth"], 3),
            "primary": a["primary"],
            "source": "authored",
        },
    }


# ------------------------------------------------------------------ editing --

BLOCK_RE = r'(^  "%s": \{\n)(.*?)(^  \},?\n)'


def _block(text: str, key: str):
    m = re.search(BLOCK_RE % key, text, re.S | re.M)
    if not m:
        raise SystemExit(f'could not find the "{key}" block')
    return m


def rewrite_base(text: str, new_vals: dict) -> str:
    m = _block(text, "baseStats")
    body = m.group(2)
    for k, v in new_vals.items():
        pat = re.compile(r'^(    "%s": )(-?[0-9.eE+-]+)(,?)$' % re.escape(k), re.M)
        if not pat.search(body):
            raise SystemExit(f'baseStats has no "{k}" line to rewrite')
        body = pat.sub(lambda mm: mm.group(1) + json.dumps(v) + mm.group(3), body, count=1)
    return text[: m.start(2)] + body + text[m.end(2) :]


def splice_attributes(text: str, attrs: dict) -> str:
    """Insert (or replace) the `attributes` block right after `growth`."""
    lines = ['  "attributes": {\n']
    items = list(attrs.items())
    for i, (k, v) in enumerate(items):
        comma = "," if i < len(items) - 1 else ""
        lines.append('    "%s": %s%s\n' % (k, json.dumps(v, ensure_ascii=False), comma))
    lines.append("  },\n")
    block = "".join(lines)

    existing = re.search(BLOCK_RE % "attributes", text, re.S | re.M)
    if existing:
        return text[: existing.start(0)] + block + text[existing.end(0) :]
    collapsed = re.search(r'^  "growth": \{\},?\n', text, re.M)
    end = collapsed.end(0) if collapsed else _block(text, "growth").end(0)
    return text[:end] + block + text[end:]


def unrebased_base(doc: dict) -> dict:
    """
    The PRE-#248 stat card, whether or not this doc has already been processed.

    `derive_authored` back-solves the raw values from today's card, so it must
    be fed today's card. On a second run `baseStats` is already rebased and the
    doc carries an `attributes` block; adding the attribute term back recovers
    the original exactly, which is what makes `--check` idempotent instead of
    reporting a diff on every invocation.
    """
    base = dict(doc["baseStats"])
    a = doc.get("attributes")
    if a is None:
        return base
    base["maxHealth"] += COEF["strToMaxHealth"] * a["str"]
    base["healthRegen"] += COEF["strToHealthRegen"] * a["str"]
    base["ad"] += COEF["strToAttackDamage"] * a["str"]
    base["armor"] += COEF["agiToArmor"] * a["agi"]
    base["as"] *= 1.0 + COEF["agiToAttackSpeed"] * a["agi"]
    base["maxMana"] += COEF["intToMaxMana"] * a["int"]
    base["manaRegen"] += COEF["intToManaRegen"] * a["int"]
    return base


def process(path: str, resolved_by_cid: dict, check: bool) -> bool:
    cid = os.path.basename(path)[:-5]
    if cid == "_index":
        return False
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    doc = json.loads(text)

    if cid in AUTHORED:
        d = derive_authored(unrebased_base(doc), doc.get("growth", {}), AUTHORED[cid])
    else:
        res = resolved_by_cid.get(cid)
        if res is None:
            raise SystemExit(f"{cid}: no resolved w3x stats and not in AUTHORED")
        d = derive_from_w3x(res["resolved"])
        d["attributes"]["source"] = "w3x"

    # `growth` is NOT touched — see the module docstring (owner ruling).
    out = rewrite_base(text, d["base"])
    out = splice_attributes(out, d["attributes"])

    if out == text:
        return False
    if not check:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(out)
    return True


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    R = json.load(open(RESOLVED, encoding="utf-8"))
    by_cid = {h["content_id"]: h for h in R["heroes"].values() if h.get("content_id")}

    changed = []
    for path in sorted(glob.glob(os.path.join(CHAMPS, "*.json"))):
        if process(path, by_cid, args.check):
            changed.append(os.path.basename(path))
    print(f"{len(changed)} champion doc(s) {'would change' if args.check else 'rewritten'}")
    if args.check and changed:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
