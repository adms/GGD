#!/usr/bin/env python3
"""Task #108 — rewrite each item's 效能 block from the stats it actually grants.

    python3 tools/economy/regen_descriptions.py --check    # diff only, no writes
    python3 tools/economy/regen_descriptions.py            # apply

RUN THIS AFTER rescale_items.py. It reads the modifiers on disk, so running it
first bakes the pre-rescale numbers back into the text.

THE PROBLEM IT SOLVES. An imported item's description hard-codes the magnitudes
the w3x author wrote — 武聖手鐲 says 「15%機率造成2倍傷害」. The task #82 AEP
rescale moves magnitudes and never touched the text, so 65 of the 102 rescaled
items advertised a number they do not grant. The modifiers are the oracle
(the item's behaviour is what the sim reads), so the text is what moves.

WHAT IS REWRITTEN, AND WHAT IS NOT. Only the stat lines inside the 效能 block:

    神器            <- kept: category header
    效能
    敏捷+20         <- REPLACED by the GGD stats it actually grants
    30%機率造成2.5倍傷害 <- REPLACED
    攻擊力+55        <- REPLACED
    50%格擋100點傷害   <- kept: describes an ability, not a modifier
                    <- kept
    解說            <- kept
    這把精良的重刀...    <- kept verbatim. The flavour is the item.

A line is a stat line only if it matches one of the map's own stat spellings
(surveyed off the corpus: 攻擊力/裝甲/生命/魔力/攻擊速度/每秒回復生命/魔力回復
速度/移動速度, plus the 「N%機率造成M倍傷害」 crit form) or an attribute line
(敏捷/力量/智慧/全能力), which the importer expands into several GGD stats and
so cannot survive as written. Everything else is prose about an unported active
or aura and is left exactly where it is — those mechanics still exist even
though `item@1` has nowhere to put them yet.

The generated lines use the map's vocabulary where the map has a word for the
stat. `ap`, `mr`, `lifesteal`, `cdr` and `range` have no WC3 equivalent the
author ever wrote, so they take the standard zh-TW game terms.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ITEMS = ROOT / "content" / "items"

# The block header is 「效能」, written with or without a colon (狂暴軒轅劍 uses
# 「效能：」), and the block ends at the blank line before the prose section —
# which is 「解說」 on most items and 「歷史」 on the two 製作書 chains.
EFFECT_HEADER = "效能"
SECTION_HEADERS = ("解說", "歷史")


def _is_effect_header(line: str) -> bool:
    return line.strip().rstrip("：:") == EFFECT_HEADER

# stat -> (label, kind). Order is the order lines are emitted in.
STAT_LABEL = [
    ("ad", "攻擊力", "flat"),
    ("ap", "法術強度", "flat"),
    ("armor", "裝甲", "flat"),
    ("mr", "魔法抗性", "flat"),
    ("maxHealth", "生命", "flat"),
    ("maxMana", "魔力", "flat"),
    ("healthRegen", "每秒回復生命", "flat"),
    ("manaRegen", "魔力回復速度", "percent"),
    ("as", "攻擊速度", "percent"),
    ("ms", "移動速度", "flat"),
    ("lifesteal", "吸血", "percent"),
    ("cdr", "冷卻縮減", "percent"),
    ("range", "攻擊距離", "flat"),
]
LABELS = {s: (label, kind) for s, label, kind in STAT_LABEL}

# Lines the generator OWNS: anything it could have written itself, plus the
# WC3 attribute lines that no longer survive as attributes.
OWNED_LABELS = {label for _, label, _ in STAT_LABEL} | {
    "敏捷", "力量", "智慧", "智力", "全能力",
    "生命最大", "魔力最大", "生命上限", "範圍裝甲", "範圍每秒回復生命",
}
STAT_LINE = re.compile(r"^([一-鿿]{2,10})\s*([+-])\s*([\d.]+)\s*(%?)$")

# Stat lines the map writes as a phrase rather than as `label ± number`. Each
# maps onto a GGD modifier the generator emits, so leaving them behind would
# put a contradiction two lines apart — 月牙魔杖 would read 「減少魔法傷害50%」
# above 「魔法抗性+200」. The trailing parenthetical on 吸血 is the WC3 (法球)
# orb / (結界) aura tag, which does not survive as a mechanic either.
PHRASE_LINES = [
    re.compile(r"^[\d.]+%機率造成[\d.]+倍傷害$"),          # crit
    re.compile(r"^減少魔法傷害[\d.]+%$"),                   # magic resist
    re.compile(r"^吸血[\d.]+%\s*[（(].*[）)]$"),            # lifesteal
    # 「力量、敏捷+15」 — one ability granting several attributes at once.
    re.compile(r"^(?:力量|敏捷|智慧|智力)(?:、(?:力量|敏捷|智慧|智力))+\s*[+-][\d.]+$"),
]


def fmt(value: float) -> str:
    """Trim a float to the shortest exact decimal: 3.0 -> '3', 2.198 -> '2.198'."""
    text = f"{value:.3f}".rstrip("0").rstrip(".")
    return text or "0"


def stat_lines(modifiers: list) -> list[str]:
    by_stat: dict[str, float] = {}
    percent: dict[str, float] = {}
    for m in modifiers or []:
        if m["op"] in ("pctAdd", "pctMult"):
            percent[m["stat"]] = percent.get(m["stat"], 0.0) + m["value"]
        else:
            by_stat[m["stat"]] = by_stat.get(m["stat"], 0.0) + m["value"]

    out = []
    for stat, label, kind in STAT_LABEL:
        # A stat can arrive flat AND as a percentage (as/manaRegen do); each
        # gets its own line so neither is silently folded into the other.
        for source, is_pct in ((by_stat, False), (percent, True)):
            if stat not in source:
                continue
            value = source[stat]
            if not value:
                continue
            if is_pct or (kind == "percent" and not is_pct):
                text = f"{label}{'+' if value > 0 else '-'}{fmt(abs(value) * 100)}%"
            else:
                text = f"{label}{'+' if value > 0 else '-'}{fmt(abs(value))}"
            out.append(text)

    chance = by_stat.get("critChance")
    if chance:
        # `critDamage` is a DELTA on the 1.75 champion base, and the tooltip
        # form states the absolute multiple — the same convention the source
        # descriptions use, so this line reads like the ones it replaces.
        multiplier = 1.75 + by_stat.get("critDamage", 0.0)
        out.append(f"{fmt(chance * 100)}%機率造成{fmt(multiplier)}倍傷害")
    return out


def is_owned(line: str) -> bool:
    if any(p.match(line) for p in PHRASE_LINES):
        return True
    m = STAT_LINE.match(line)
    return bool(m and m.group(1) in OWNED_LABELS)


def rewrite(description: str, modifiers: list) -> str | None:
    """New description, or None when there is nothing to rewrite.

    AN ITEM WITH NO MODIFIERS IS LEFT ALONE — its stat lines are not a lie this
    can correct, because there is nothing to correct them to. Callers that know
    better pass someone else's modifiers: a 製作書 recipe book grants nothing
    itself and its 效能 block describes the item it COMBINES INTO, so it is
    regenerated from that item (see `recipe_target`).
    """
    if not modifiers:
        return None
    lines = description.split("\n")
    header = next((i for i, l in enumerate(lines) if _is_effect_header(l)), None)
    if header is None:
        return None

    # The block ends at the blank line or the next section header.
    end = len(lines)
    for i in range(header + 1, len(lines)):
        if not lines[i].strip() or lines[i].strip() in SECTION_HEADERS:
            end = i
            break

    block = lines[header + 1:end]
    owned = [i for i, l in enumerate(block) if is_owned(l.strip())]
    generated = stat_lines(modifiers)
    if not owned and not generated:
        return None

    # Substitute at the first owned line so the surrounding prose keeps its
    # position; if the block had no stat lines at all, the stats lead it.
    anchor = owned[0] if owned else 0
    kept = [(i, l) for i, l in enumerate(block) if i not in owned]
    new_block: list[str] = []
    for i, l in kept:
        if i > anchor and generated:
            new_block.extend(generated)
            generated = []
        new_block.append(l)
    if generated:
        insert = anchor if not owned else len(new_block)
        new_block[insert:insert] = generated

    if new_block == block:
        return None
    return "\n".join(lines[:header + 1] + new_block + lines[end:])


RECIPE_SUFFIX = "製作書"


def recipe_target(name: str, by_name: dict) -> list | None:
    """The modifiers a 製作書's 效能 block is actually describing.

    The book is a no-op excluded from both shop and draft (starter.go S3), and
    its text is about the item it combines into — 斬龍刀製作書 quotes 斬龍刀's
    numbers. Resolved by name, which is unambiguous for 54 of the 55 books; the
    odd one out is reported rather than guessed at.
    """
    hits = by_name.get(name.replace(RECIPE_SUFFIX, ""), [])
    return hits[0] if len(hits) == 1 else None


def run(apply: bool) -> int:
    changed, skipped, unchanged = [], [], 0
    docs = []
    for path in sorted(ITEMS.glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        doc.setdefault("id", path.stem)
        docs.append((path, doc))
    by_name: dict[str, list] = {}
    for _, doc in docs:
        by_name.setdefault(doc.get("name"), []).append(doc.get("modifiers") or [])

    for path, doc in docs:
        description = doc.get("description")
        if not description:
            continue
        name = doc.get("name") or ""
        modifiers = doc.get("modifiers") or []
        if RECIPE_SUFFIX in name and not modifiers:
            modifiers = recipe_target(name, by_name) or []
            if not modifiers:
                skipped.append((doc.get("id"), name,
                                "recipe book whose target item could not be resolved "
                                "by name — its 效能 block is left as authored"))
                continue
        new = rewrite(description, modifiers)
        if new is None:
            has_stats = any(is_owned(l.strip()) for l in description.split("\n"))
            has_header = any(_is_effect_header(l) for l in description.split("\n"))
            if has_stats and not has_header:
                skipped.append((doc.get("id"), doc.get("name"),
                                "has stat lines but no 效能 header to anchor them"))
            else:
                unchanged += 1
            continue
        changed.append((doc.get("id"), doc.get("name"), description, new))
        if apply:
            doc["description"] = new
            path.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n",
                            encoding="utf-8")

    print("descriptions rewritten: %d   left alone: %d   %s"
          % (len(changed), unchanged, "APPLIED" if apply else "DRY RUN"))
    for iid, name, old, new in changed:
        print("\n  %s  %s" % (iid, name or ""))
        for line in ("  - " + old.replace("\n", "\n  - ")).split("\n"):
            print("  " + line)
        for line in ("  + " + new.replace("\n", "\n  + ")).split("\n"):
            print("  " + line)
    if skipped:
        print("\nSKIPPED (%d):" % len(skipped))
        for iid, name, why in skipped:
            print("  %-14s %-20s %s" % (iid, (name or "")[:18], why))
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="report only, write nothing")
    a = ap.parse_args()
    sys.exit(run(apply=not a.check))
