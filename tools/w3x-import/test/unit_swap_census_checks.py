#!/usr/bin/env python3
"""Guards for task #208 — the unit-swap census and the war3map.wts parser fix.

    python3 tools/w3x-import/test/unit_swap_census_checks.py

Standalone on purpose: there is no pytest in this environment, and
`w3x-import.test.ts` is concurrently edited by other lanes. Exit 0 = all PASS.

WHAT IS BEING PROTECTED
-----------------------
Two silent failures, both of which had already shipped:

  1. `w3xlib/wts.py::parse_wts` recovered 330 of the map's 11,337 strings. The
     miss was invisible because `resolve()` leaves an unresolved reference as
     the literal text "TRIGSTR_1234" — so `w3xlib/stats.py` and everything under
     `import_w3x.py` emitted rawcode-shaped placeholders where names belong and
     nothing anywhere reported an error.

  2. `extract_transform_forms.py` reads `Eme1`/`Emeu` only, and its docstring
     called that 「every champion transform」. 37 巴恩大魔王's 「37-04 魔界之王」
     is a caster swap built on `ANef` (Primal Split) — it writes `Nef1` and
     never touches `Eme1`/`Emeu`, so it was invisible to that reader and to the
     26-pair table, the fixture and every test built on them.

MUTATION VERIFICATION
---------------------
Each check names, in its own comment, the exact edit that would make it pass
vacuously. Every one of those edits was APPLIED and the check was seen to turn
RED before this file was committed; see the commit message for the log.
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, TOOLS)

from w3xlib.wts import parse_wts, parse_wts_blocks, resolve  # noqa: E402
import src_text  # noqa: E402
from extract_unit_swap_census import (  # noqa: E402
    CASTER_SWAP_CODES,
    RAW_DIR,
    build,
    classify_stock_bases,
)

FAILURES: list[str] = []

# The map's real string count. Before the fix the regex found 330 — a number
# `src_objects.py` has been quoting in its report for months.
WTS_TOTAL = 11337
WTS_OLD_REGEX_TOTAL = 330

# The census, as measured. Each is a claim about the MAP, not about the code.
EXPECT_METAMORPH = 26     # the known Eme1/Emeu pairs
EXPECT_SPLIT = 2          # A01Z 37-04 魔界之王 + A0SJ 28-002 無限分裂
EXPECT_SPLIT_LIVE = 1     # only A01Z is on a unit / in the JASS
EXPECT_JASS_SITES = 3     # ReplaceUnitBJ — all player-name-gated easter eggs

BARN_TIERS = {
    1: ("u001", "(LV1)", 1600, 500, 5, 100, 350, 3),
    2: ("u00D", "(LV2)", 2600, 750, 10, 140, 390, 4),
    3: ("u00E", "(LV3)", 3600, 1150, 15, 180, 430, 5),
}


def check(cid: str, ok: bool, detail: str = "") -> None:
    if ok:
        print(f"PASS {cid}")
    else:
        FAILURES.append(f"{cid}: {detail}")
        print(f"FAIL {cid}: {detail}")


def main() -> int:
    if not os.path.isdir(RAW_DIR):
        print("SKIP: no out/GoDieEX22s-src/raw (map not extracted here)")
        return 0

    wts_path = os.path.join(RAW_DIR, "war3map.wts")
    with open(wts_path, "rb") as fh:
        blob = fh.read()

    # ------------------------------------------------------------------ wts --
    # MUTATION: restore the old single regex in w3xlib/wts.py
    #   _BLOCK_RE = re.compile(r"STRING\s+(\d+)\s*(?:--[^\r\n]*)?\s*\{...")
    # -> 330, RED. Pinning ">0" or ">300" would NOT have caught the bug, which
    # is exactly why the number is exact and the old number is named beside it.
    table = parse_wts(blob)
    check(
        "w3x-wts-full-table",
        len(table) == WTS_TOTAL,
        f"parse_wts recovered {len(table)}, want {WTS_TOTAL} "
        f"(the broken regex recovered {WTS_OLD_REGEX_TOTAL})",
    )
    check(
        "w3x-wts-not-the-old-regex",
        len(table) != WTS_OLD_REGEX_TOTAL,
        "parse_wts is back to the comment-blind regex",
    )

    # MUTATION: make src_text.parse_wts_full reimplement its own parse again
    # -> the two can drift; this asserts they are literally the same table.
    check(
        "w3x-wts-single-parser",
        src_text.parse_wts_full(blob)[0] == table,
        "src_text.parse_wts_full disagrees with w3xlib.wts.parse_wts",
    )

    # The comment-carrying blocks are the ones the old regex choked on, so a
    # parser that somehow found 11,337 ids WITHOUT reading comments would be
    # doing something else. 11,007 of the entries carry a `//` provenance line.
    # MUTATION: drop the `stripped.startswith("//")` branch -> comments 0, RED.
    _, comments = parse_wts_blocks(blob)
    with_comments = sum(1 for v in comments.values() if v)
    check(
        "w3x-wts-provenance-comments",
        with_comments > 10_000,
        f"only {with_comments} provenance comments recovered",
    )

    # A resolved string must be TEXT, never a passed-through TRIGSTR literal —
    # the shape the silent failure took downstream.
    # MUTATION: `return {}` from parse_wts -> resolve echoes the literal, RED.
    sample = resolve("TRIGSTR_1190", table)
    check(
        "w3x-wts-trigstr-resolves",
        not sample.startswith("TRIGSTR_") and "克勞德" in sample,
        f"TRIGSTR_1190 resolved to {sample[:40]!r}",
    )

    # --------------------------------------------------------------- census --
    doc = build()
    counts = doc["counts"]

    # MUTATION: in extract_unit_swap_census.classify_stock_bases, delete the
    # `elif len(normal) >= 2: shape = "C/split"` branch -> splitEntries 0, RED.
    check(
        "w3x-swap-census-counts",
        (counts["metamorphEntries"] == EXPECT_METAMORPH
         and counts["splitEntries"] == EXPECT_SPLIT
         and counts["splitEntriesLive"] == EXPECT_SPLIT_LIVE
         and counts["jassReplaceUnitSites"] == EXPECT_JASS_SITES),
        json.dumps(counts, ensure_ascii=False),
    )

    # The census must AGREE with the older extractor on the family they share —
    # on the UNIT RAWCODES, not just on which abilities exist.
    #
    # This compared only the set of `abilityRawcode`s at first, and mutation M9
    # (`e.get("Emeu")` — last-writer-wins instead of level 1) SURVIVED it: the
    # ability set is identical either way, only the units it points at change,
    # and ~9 of the 26 then cross-link unrelated heroes. That is failure form ④
    # from CLAUDE.md, an assertion whose direction has nothing to do with the
    # defect. Comparing the triple kills it.
    # MUTATION: `alternate = e.get("Emeu")` -> RED on 9 pairs.
    forms_path = os.path.join(TOOLS, "out", "GoDieEX22s-src", "TRANSFORM_FORMS.json")
    if os.path.exists(forms_path):
        with open(forms_path, encoding="utf-8") as fh:
            forms = json.load(fh)
        want = sorted(
            (p["abilityRawcode"], p["normalUnit"]["rawcode"].upper(),
             p["alternateUnit"]["rawcode"].upper())
            for p in forms["pairs"]
        )
        got = sorted(
            (p["abilityRawcode"], p["normalUnit"]["rawcode"].upper(),
             p["alternateUnit"]["rawcode"].upper())
            for p in doc["metamorphEntries"]
        )
        check(
            "w3x-swap-census-agrees-with-pairs",
            want == got,
            f"census {len(got)} vs TRANSFORM_FORMS {len(want)}; "
            f"only-in-census={sorted(set(got) - set(want))[:4]} "
            f"only-in-pairs={sorted(set(want) - set(got))[:4]}",
        )

    splits = {s["abilityRawcode"]: s for s in doc["splitEntries"]}
    check("w3x-swap-census-a01z-present", "A01Z" in splits, sorted(splits))
    if "A01Z" in splits:
        barn = splits["A01Z"]
        # MUTATION: read `Nef1` with entry.get(code, 1) (level 1 only, the way
        # the Metamorphosis reader does) -> 1 tier instead of 3, RED. The two
        # families genuinely differ: Metamorphosis MUST be read at level 1,
        # Primal Split must NOT.
        tiers = {f["level"]: f for f in barn["formsByLevel"]}
        ok = len(tiers) == 3
        detail = f"{len(tiers)} tiers"
        for level, exp in BARN_TIERS.items():
            f = tiers.get(level)
            if not f or len(f["units"]) != 1:
                ok, detail = False, f"level {level} has no single unit"
                break
            u = f["units"][0]
            got = (u["rawcode"], u["subName"], u["maxHealth"], u["maxMana"],
                   u["armor"], u["attackDamageBase"], u["moveSpeed"],
                   len(u["abilities"]))
            if got != exp:
                ok, detail = False, f"level {level}: {got} != {exp}"
                break
        check("w3x-swap-census-a01z-tiers", ok, detail)

        # The proof it is a TIERED form and not Blizzard's three-at-once: each
        # level lists exactly ONE unit, and the ability lists GROW.
        # MUTATION: emit `unitsPerCast: 3` unconditionally -> RED.
        sizes = [len(f["units"][0]["abilities"]) for f in barn["formsByLevel"]]
        check(
            "w3x-swap-census-a01z-is-tiered",
            all(f["unitsPerCast"] == 1 for f in barn["formsByLevel"])
            and sizes == sorted(sizes) and sizes[0] < sizes[-1],
            f"unitsPerCast={[f['unitsPerCast'] for f in barn['formsByLevel']]} sizes={sizes}",
        )

        # It is LIVE — on 巴恩's hero-ability list, and cast-handled in the JASS.
        # MUTATION: hardcode `live: True` -> A0SJ also goes live, splitEntriesLive
        # becomes 2 and `w3x-swap-census-counts` goes RED.
        check(
            "w3x-swap-census-a01z-live",
            barn["live"] and barn["heroNumber"] == "37"
            and any(o["unitRawcode"] == "Ubal" and o["slot"] == "uhab"
                    for o in barn["casterUnits"]),
            json.dumps(barn["casterUnits"], ensure_ascii=False),
        )

    # A0SJ is a real 5-clone split that NOTHING references — keeping it visible
    # and marked dead is the honest answer; dropping it would make "2" a lie.
    # MUTATION: `continue` on entries with no owner -> splitEntries 1, RED.
    check(
        "w3x-swap-census-a0sj-dead",
        "A0SJ" in splits and splits["A0SJ"]["live"] is False
        and splits["A0SJ"]["casterUnits"] == []
        and splits["A0SJ"]["referencedInJass"] is False,
        json.dumps(splits.get("A0SJ", {}).get("casterUnits"), ensure_ascii=False),
    )

    # `areq` (tech requirements) also holds 4-char rawcodes and matched a naive
    # "looks like a unit id" scan on AHav/AEme. Only DataA1/UnitID1 may count.
    # MUTATION: add "areq" to CASTER_SWAP_CODES -> extra bogus entries, RED.
    check(
        "w3x-swap-census-no-areq-false-positive",
        "areq" not in CASTER_SWAP_CODES
        and all("areq" not in json.dumps(s) or s["abilityRawcode"]
                for s in doc["splitEntries"]),
        "areq leaked into the swap field set",
    )

    # Shape classification must actually SEPARATE summons from morphs: Inferno
    # and Raise Dead are B, Metamorphosis and Primal Split are not.
    # MUTATION: set `swapsCaster` to True for every shape -> the 68 summons get
    # counted as transforms, RED.
    stock = json.load(open(os.path.join(TOOLS, "out", "stock", "STOCK_ABILITIES.json"),
                           encoding="utf-8"))["abilities"]
    stock_units = json.load(open(os.path.join(TOOLS, "out", "stock", "STOCK_UNITS.json"),
                                 encoding="utf-8"))["units"]
    bases = classify_stock_bases(stock, {k.upper() for k in stock_units})
    expect_shape = {
        "AEIl": "A/metamorph", "AEme": "A/metamorph", "ANrg": "A/metamorph",
        "Aphx": "A/metamorph", "Abrf": "A/metamorph", "Astn": "A/metamorph",
        "ANef": "C/split", "Acef": "C/split",
        "ANin": "B/one-way", "Arai": "B/one-way", "AUls": "B/one-way",
        "Sca1": "B/one-way", "Srtt": "B/one-way",
    }
    bad = {k: bases.get(k, {}).get("shape") for k, v in expect_shape.items()
           if bases.get(k, {}).get("shape") != v}
    check("w3x-swap-census-shapes", not bad, json.dumps(bad, ensure_ascii=False))

    # `swapsCaster` is the field the summon branch actually reads, so it has to
    # be asserted on its own: a summon must be False, a morph and a split True.
    # MUTATION: `"swapsCaster": True` for every family -> RED here, and RED on
    # `w3x-swap-census-counts` too because the 68 summons stop being counted.
    # (Before `swapsCaster` was made load-bearing this mutation SURVIVED all 15
    # guards — the field was emitted into the JSON and read by nobody.)
    emitted = doc["stockFamilies"]
    swaps_bad = {
        k: emitted.get(k, {}).get("swapsCaster")
        for k, v in expect_shape.items()
        if emitted.get(k, {}).get("swapsCaster") != (v != "B/one-way")
    }
    check("w3x-swap-census-swapscaster", not swaps_bad,
          json.dumps(swaps_bad, ensure_ascii=False))

    # All three JASS replacements are easter eggs, and both targets ALREADY
    # ship as ordinary champions — so nothing is missing from content because
    # of them. MUTATION: make scan_jass_replacements return [] -> RED.
    targets = sorted(s["targetRawcode"] for s in doc["jassReplaceUnitSites"])
    check(
        "w3x-swap-census-jass-sites",
        targets == ["H02K", "H02K", "O02P"],
        f"{targets}",
    )

    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILURE(S)")
        for f in FAILURES:
            print("  -", f)
        return 1
    print("all census guards pass")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
