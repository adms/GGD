#!/usr/bin/env python3
"""Guards for the stock-ability inheritance added to extract_transform_forms.py.

    python3 tools/w3x-import/test/stock_inheritance_checks.py

Standalone on purpose (no pytest in this environment, and w3x-import.test.ts is
concurrently edited). Exit 0 = all PASS, non-zero = a guard failed.

WHAT IS BEING PROTECTED
-----------------------
`Aphx` (61-00 百連我殺) writes no `ahdu` in war3map.w3a. Blizzard's row says
`HeroDur1 = 10`. Before this change the extractor emitted `{}`, the fixture said
`{}`, championForms.ts said `{}` with a comment explaining why, and the pin test
compared `{}` to `{}` and passed — four layers agreeing on a value nobody had
ever read out of the MPQ.

Every check below is mutation-verified: the mutation that would make it pass
vacuously is named in its own comment, and each was actually applied and seen to
turn the check RED before this file was committed.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, TOOLS)

from extract_transform_forms import (  # noqa: E402
    INHERITED,
    OUT_PATH,
    RAW_DIR,
    _entries,
    build,
    load_stock,
)

FAILURES: list[str] = []


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

    stock = load_stock()
    doc = build()
    pairs = {p["abilityRawcode"]: p for p in doc["pairs"]}
    w3a = {
        e.obj_id: e
        for e in _entries(os.path.join(RAW_DIR, "war3map.w3a"), True)
        if e.obj_id in pairs
    }

    # ---------------------------------------------------------------- 1 ----
    # The premise itself. If `Aphx` ever starts writing `ahdu` in the map, the
    # inheritance below stops being the thing under test and this file lies.
    # MUTATION: assert the map DOES write ahdu -> FAIL (it writes none).
    aphx = w3a["Aphx"]
    check(
        "premise-map-is-silent",
        aphx.levels("ahdu") == {},
        f"war3map.w3a Aphx DOES write ahdu: {aphx.levels('ahdu')}",
    )

    # The stock side of the chain, straight out of the MPQ-derived table.
    # MUTATION: change stock_ability_data's LEVELED stems -> HeroDur1 vanishes
    #           -> FAIL here (and the generator's own canary refuses to write).
    check(
        "premise-stock-has-10",
        stock.get("Aphx", {}).get("HeroDur1") == 10,
        f"STOCK_ABILITIES.json Aphx.HeroDur1 = {stock.get('Aphx', {}).get('HeroDur1')!r}",
    )

    # ---------------------------------------------------------------- 2 ----
    # The chain's RESULT: silent map + stock 10 -> 10, labelled "stock".
    # MUTATION: drop stock_row from the `ahdu` _levels() call -> {} -> FAIL.
    p = pairs["Aphx"]
    check(
        "aphx-inherits-10",
        p["durationSecByLevel"] == {"1": 10.0},
        f"durationSecByLevel = {p['durationSecByLevel']!r}, want {{'1': 10.0}}",
    )
    check(
        "aphx-provenance-stock",
        p["provenance"]["durationSecByLevel"] == {"1": "stock"},
        f"provenance = {p['provenance']['durationSecByLevel']!r}",
    )

    # ---------------------------------------------------------------- 3 ----
    # DIRECTION. `Aphx` writes adur = 0.01; stock Dur1 = 0.5. If inheritance
    # ran the wrong way (or if "written" were tested against the stock side)
    # this would read 0.5. Two independent values, so the assertion has a
    # direction — it cannot pass by accident.
    # MUTATION: swap the map/stock branches in _levels() -> 0.5 -> FAIL.
    check(
        "aphx-map-adur-wins",
        p["unitDurationSecByLevel"] == {"1": 0.01}
        and p["provenance"]["unitDurationSecByLevel"] == {"1": "map"},
        f"unitDuration={p['unitDurationSecByLevel']!r} "
        f"prov={p['provenance']['unitDurationSecByLevel']!r}; "
        f"stock Dur1={stock['Aphx'].get('Dur1')!r}",
    )

    # ---------------------------------------------------------------- 4 ----
    # The same direction rule across ALL 26, both halves:
    #   (a) a level the map wrote with a positive value survives unchanged and
    #       is labelled "map";
    #   (b) a level the map wrote as ZERO is an OVERRIDE, not a hole — it must
    #       stay dropped, never fall through to the stock value. e.g. A0SZ
    #       writes adur = 0 on levels 1-4 while stock AEIl says Dur1..4 = 1.5.
    FIELD_TO_KEY = {
        "ahdu": "durationSecByLevel",
        "adur": "unitDurationSecByLevel",
        "amcs": "manaCostByLevel",
    }
    overwritten: list[str] = []
    zero_leaked: list[str] = []
    for aid, pair in pairs.items():
        entry = w3a[aid]
        for code, key in FIELD_TO_KEY.items():
            emitted = pair[key]
            prov = pair["provenance"][key]
            for level, value in entry.levels(code).items():
                slot = str(level)
                if isinstance(value, (int, float)) and value > 0:
                    if emitted.get(slot) != round(float(value), 4) or prov.get(slot) != "map":
                        overwritten.append(
                            f"{aid}.{code}[{slot}] map={value!r} -> "
                            f"{emitted.get(slot)!r}/{prov.get(slot)!r}"
                        )
                elif slot in emitted:
                    zero_leaked.append(
                        f"{aid}.{code}[{slot}] map wrote {value!r} but "
                        f"output has {emitted[slot]!r}/{prov.get(slot)!r}"
                    )
    # MUTATION: make _levels() prefer stock over map -> 60+ entries listed.
    check("map-values-never-overwritten", not overwritten, "; ".join(overwritten[:6]))
    # MUTATION: treat a map-written 0 as "absent" -> A0SZ/A0DZ/... leak 1.5.
    check("map-written-zero-is-an-override", not zero_leaked, "; ".join(zero_leaked[:6]))

    # Both halves must have had something to check, or they are vacuous.
    positives = sum(
        1
        for aid in pairs
        for code in FIELD_TO_KEY
        for v in w3a[aid].levels(code).values()
        if isinstance(v, (int, float)) and v > 0
    )
    zeros = sum(
        1
        for aid in pairs
        for code in FIELD_TO_KEY
        for v in w3a[aid].levels(code).values()
        if isinstance(v, (int, float)) and v <= 0
    )
    check("direction-guard-is-not-vacuous", positives >= 50 and zeros >= 50,
          f"only {positives} positive / {zeros} zero map cells to check")

    # ---------------------------------------------------------------- 5 ----
    # Inheritance may not INVENT a level. 13 of the 26 write no `alev` and so
    # have one level in game; stock AEme carries HeroDur1..4 = 60, which a
    # blind 1..4 fill would splice onto abilities that have no level 2.
    # MUTATION: drop the level_count bound in _levels() -> A0IR/A0OH/A0VG…
    #           gain levels 2-4 -> FAIL.
    invented: list[str] = []
    for aid, pair in pairs.items():
        cap = pair["stockBase"]["levelCount"]
        for key, prov in pair["provenance"].items():
            for slot, src in prov.items():
                if src == "stock" and int(slot) > cap:
                    invented.append(f"{aid}.{key}[{slot}] > levelCount {cap}")
    check("stock-never-invents-a-level", not invented, "; ".join(invented[:6]))

    # ---------------------------------------------------------------- 6 ----
    # Every ability really does resolve to a stock row — otherwise inheritance
    # is silently a no-op for it and nobody would notice.
    no_base = [a for a, p in pairs.items() if not p["stockBase"]["inStockTable"]]
    check("every-base-resolves-to-stock", not no_base, f"unresolved: {no_base}")

    # ---------------------------------------------------------------- 7 ----
    # THE SHIPPED ARTIFACT IS THE TESTED ONE. Everything above ran build() in
    # memory; this proves the checked-in JSON downstream reads is that output.
    # MUTATION: hand-edit TRANSFORM_FORMS.json -> FAIL.
    with open(OUT_PATH, encoding="utf-8") as fh:
        on_disk = json.load(fh)
    check(
        "checked-in-fixture-is-current",
        on_disk == doc,
        "out/GoDieEX22s-src/TRANSFORM_FORMS.json is stale — re-run "
        "extract_transform_forms.py",
    )
    check(
        "fixture-has-the-10",
        next(x for x in on_disk["pairs"] if x["abilityRawcode"] == "Aphx")[
            "durationSecByLevel"
        ]
        == {"1": 10.0},
        "the checked-in fixture does not carry Aphx duration 10",
    )

    # ---------------------------------------------------------------- 8 ----
    # The generator refuses to run without the MPQs: non-zero exit, loud
    # message, and NO file written. A silently-empty stock table would make
    # every inherited value look absent again, with a green pipeline.
    # MUTATION: return 0 instead of 2 on missing archives -> FAIL.
    with tempfile.TemporaryDirectory() as tmp:
        empty_root = os.path.join(tmp, "no-mpqs-here")
        os.makedirs(empty_root)
        out_file = os.path.join(tmp, "STOCK_ABILITIES.json")
        driver = (
            "import sys; from pathlib import Path\n"
            f"sys.path.insert(0, {TOOLS!r})\n"
            "import stock_ability_data as m\n"
            f"m.ROOT = Path({empty_root!r})\n"
            f"m.OUT = Path({out_file!r})\n"
            "sys.exit(m.main())\n"
        )
        run = subprocess.run(
            [sys.executable, "-c", driver], capture_output=True, text=True
        )
        check(
            "no-mpq-exits-non-zero",
            run.returncode != 0,
            f"exit={run.returncode} (must be non-zero without the archives)",
        )
        check(
            "no-mpq-writes-nothing",
            not os.path.exists(out_file),
            "it wrote a file anyway — that is the silent-empty-table failure",
        )
        check(
            "no-mpq-says-so-loudly",
            "MISSING ARCHIVE" in run.stderr and "FATAL" in run.stderr,
            f"stderr did not name the problem: {run.stderr[-200:]!r}",
        )

    print()
    if FAILURES:
        print(f"{len(FAILURES)} FAILED")
        for f in FAILURES:
            print(f"  - {f}")
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
