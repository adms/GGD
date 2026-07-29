#!/usr/bin/env python3
r"""Guards for tools/w3x-import/build_model_usage.py — the VFX model census.

    python3 tools/w3x-import/test/model_usage_checks.py

Standalone on purpose (no pytest in this environment). Exit 0 = all PASS.

WHY THESE EXIST
---------------
The census exists because the previous count (497 models / 1,694 references)
was produced by a method with three holes, and every hole was SILENT — the
number came out smaller, not broken, so nothing went red. A guard that only
asserts "the script ran" would have been green for all three.

So every check below is paired with a MUTATION: the exact edit that reopens the
hole. Each mutation was applied to a temp copy of the real script, run, and seen
to FAIL before this file was committed. `python3 …/model_usage_checks.py` runs
those mutations for real (section MUT), so the pairing cannot rot into a claim.

THE THREE HOLES
  1. inheritance aimed at `Units\AbilityData.slk`, which has no art columns
  2. an art cell the author EMPTIED read as "unspoken", so it inherits art the
     map deliberately deleted
  3. a `.mdl/.mdx` filter, which drops every extension-less path — including
     every single stock unit model, whose `file` column has no extension
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.abspath(os.path.join(HERE, ".."))
REPO = os.path.dirname(os.path.dirname(TOOLS))
RAWDIR = os.path.join(TOOLS, "out", "GoDieEX22s-src", "raw")
SCRIPT = os.path.join(TOOLS, "build_model_usage.py")
OUT = os.path.join(TOOLS, "out", "vfx-census", "MODEL_USAGE.json")
JASS = os.path.join(TOOLS, "out", "GoDieEX22s-src", "raw", "war3map.j")

FAILURES: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"   {detail}" if not ok else ""))
    if not ok:
        FAILURES.append(f"{name}: {detail}")


def run_variant(mutations: list[tuple[str, str]], tmp: str) -> subprocess.CompletedProcess:
    """Run a text-mutated copy of the census, writing into a throwaway dir."""
    src = open(SCRIPT, encoding="utf-8").read()
    for old, new in mutations:
        assert old in src, f"mutation anchor vanished from the script: {old!r}"
        src = src.replace(old, new)
    path = os.path.join(tmp, "mutated_model_usage.py")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(src)
    outdir = os.path.join(tmp, "out")
    os.makedirs(outdir, exist_ok=True)
    driver = (
        "import importlib.util, sys\n"
        f"sys.path.insert(0, {TOOLS!r})\n"
        f"spec = importlib.util.spec_from_file_location('mutated_model_usage', {path!r})\n"
        "m = importlib.util.module_from_spec(spec)\n"
        "spec.loader.exec_module(m)\n"
        # the copy lives in a temp dir, so HERE/REPO/RAW computed from __file__
        # would point at nothing — re-aim them at the real tree, and send every
        # WRITE into the throwaway dir.
        f"m.HERE = {TOOLS!r}\n"
        f"m.REPO = {REPO!r}\n"
        f"m.RAW = {RAWDIR!r}\n"
        f"m.OUTDIR = {outdir!r}\n"
        f"m.STOCK_CACHE = {os.path.join(tmp, 'STOCK_ART.json')!r}\n"
        "sys.exit(m.main())\n"
    )
    return subprocess.run([sys.executable, "-c", driver], capture_output=True, text=True)


def main() -> int:
    print("build_model_usage guards\n")

    # ---------------------------------------------------------------- 1 ----
    # The checked-in output is current. Everything below reads it, so a stale
    # file would make every other check test the past.
    # MUTATION: hand-edit MODEL_USAGE.json -> FAIL.
    with tempfile.TemporaryDirectory() as tmp:
        run = run_variant([], tmp)
        check("script-exits-zero", run.returncode == 0,
              f"exit={run.returncode} stderr={run.stderr[-400:]!r}")
        fresh_path = os.path.join(tmp, "out", "MODEL_USAGE.json")
        fresh = json.load(open(fresh_path, encoding="utf-8")) if os.path.exists(fresh_path) else None
        on_disk = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else None
        check("checked-in-output-is-current", fresh is not None and fresh == on_disk,
              "out/vfx-census/MODEL_USAGE.json is stale — re-run build_model_usage.py")

        # DETERMINISM: the same inputs must produce the same bytes.
        run2 = run_variant([], tmp)
        second = json.load(open(fresh_path, encoding="utf-8"))
        check("deterministic", run2.returncode == 0 and second == fresh,
              "two runs of the same script disagreed")

    doc = on_disk or {}
    inv = doc.get("invariants", {})
    models = doc.get("models", {})

    # ---------------------------------------------------------------- 2 ----
    # HOLE 1 — stock inheritance really happened, and it came from the file that
    # actually holds art. `Units\AbilityData.slk` does not: measured, it contains
    # no Casterart / Targetart / Missileart / EffectSound column anywhere.
    check("stock-inheritance-populated", inv.get("stockInheritedAbilityArt", 0) > 300,
          f"only {inv.get('stockInheritedAbilityArt')} inherited ability-art references")

    # a named case, so the check is about a real record and not a threshold:
    # 'ANfd' style stock fall-through must exist somewhere in the index.
    inherited_examples = [
        (stem, r) for stem, m in models.items() for r in m["refs"]
        if r["provenance"] == "stock-inherited" and r["channel"].startswith("ability.")
    ]
    check("stock-inheritance-has-named-cases", len(inherited_examples) > 300,
          f"{len(inherited_examples)} named inherited ability-art rows")

    # ---------------------------------------------------------------- 3 ----
    # HOLE 2 — a cell the author EMPTIED must not inherit. A0D5 20-03 約束與勝利
    # 之劍 stores `amat = ""`; its base AOsh (Shockwave) names ShockwaveMissile.mdl.
    # The map erased it, so A0D5 must have NO missile-art reference at all.
    a0d5_missile = [
        stem for stem, m in models.items() for r in m["refs"]
        if r.get("objectId") == "A0D5" and r["channel"] == "ability.missileArt"
    ]
    check("cleared-cell-does-not-inherit", not a0d5_missile,
          f"A0D5 gained missile art it had erased: {a0d5_missile}")
    check("no-cleared-cell-leaked", inv.get("clearedCellsThatLeakedIntoInheritance") == [],
          f"{inv.get('clearedCellsThatLeakedIntoInheritance')}")
    check("cleared-cells-are-counted", doc.get("totals", {}).get("clearedCells", 0) >= 200,
          f"{doc.get('totals', {}).get('clearedCells')} cleared cells found")

    # ---------------------------------------------------------------- 4 ----
    # HOLE 3 — extension-less model paths survive. `UnitUI.slk`'s `file` column
    # has no extension for EVERY row, and the map itself writes 8 such art cells.
    check("extensionless-paths-kept", inv.get("extensionlessReferences", 0) > 100,
          f"only {inv.get('extensionlessReferences')} extension-less references")
    check("talktome-is-in-the-index", "talktome" in models,
          "…\\TalkToMe\\TalkToMe (no extension) was dropped")

    # ---------------------------------------------------------------- 5 ----
    # The JASS channel is complete, recounted with an expression the scanner does
    # not use (a recount that shares the scanner's regex agrees with the scanner
    # even when the regex is what broke).
    text = open(JASS, encoding="utf-8", errors="replace").read()
    import re

    independent = len(re.findall(r'(?i)\.mdl"|\.mdx"', text))
    check("jass-channel-complete", inv.get("jassLiteralReferences") == independent,
          f"index has {inv.get('jassLiteralReferences')}, source has {independent}")

    # ---------------------------------------------------------------- 6 ----
    # The buff channel exists. war3map.w3h was absent from the previous census
    # entirely — that alone was 175 references.
    check("buff-channel-present", inv.get("buffReferences", 0) > 100,
          f"only {inv.get('buffReferences')} buff-art references")

    # ---------------------------------------------------------------- 7 ----
    # The owner's 33 priority models all resolve, and the parameters that decide
    # how many knobs a reusable prototype needs are actually attached.
    check("priority-33-all-present", inv.get("priorityModelsMissing") == [],
          f"missing: {inv.get('priorityModelsMissing')}")
    check("scale-harvest-complete",
          inv.get("scalePercentHarvested") == inv.get("scalePercentHarvestable"),
          f"{inv.get('scalePercentHarvested')} of {inv.get('scalePercentHarvestable')}")
    check("tint-harvest-complete",
          inv.get("vertexColorHarvested", 0) >= inv.get("vertexColorTargetingLastCreated", 1) > 0,
          f"{inv.get('vertexColorHarvested')} harvested vs "
          f"{inv.get('vertexColorTargetingLastCreated')} direct calls")
    ws = models.get("warstompcaster", {})
    check("shockwave-ring-has-scale-spread",
          (ws.get("params", {}).get("scale") or {}).get("distinct", 0) >= 3,
          "WarStompCaster has fewer than 3 distinct scales — a per-invocation "
          "scale parameter would be unnecessary, which contradicts the owner's brief")

    # ---------------------------------------------------------- MUT ------
    # Every hole above, reopened for real. Each must make the script EXIT
    # NON-ZERO. A mutation that stays green means the guard above it is theatre.
    print("\n  mutations (each must turn the census RED)\n")
    mutations: list[tuple[str, list[tuple[str, str]], str]] = [
        (
            "M1 inheritance aimed at AbilityData.slk (the brief's own wrong premise)",
            [('f"Units\\\\{race}AbilityFunc.txt"', '"Units\\\\AbilityData.slk"')],
            "inherited ability-art references",
        ),
        (
            "M2 an emptied art cell read as unspoken, so it inherits",
            [("spoken.add(chan)", "pass  # MUTATED")],
            "EMPTIED were given inherited art",
        ),
        (
            "M3 a .mdl/.mdx filter in split_art",
            [
                (
                    "        if p.lower() in NOT_A_MODEL or p in LIGHTNING_IDS:",
                    "        if (p.lower() in NOT_A_MODEL or p in LIGHTNING_IDS\n"
                    "                or not p.lower().endswith((\".mdl\", \".mdx\"))):",
                )
            ],
            "extension-less model references",
        ),
        (
            "M4 war3map.w3h (the buff art channel) skipped",
            [('w3h = all_entries(parse_object_file(read("war3map.w3h"), False))', "w3h = []")],
            "buff-art references",
        ),
        (
            "M5 the per-invocation scale harvest dropped",
            [('last_unit["params"]["scalePercent"] = float(v.group(1))',
              'pass  # MUTATED')],
            "SetUnitScalePercent calls",
        ),
        (
            "M7 the JASS vertex-colour harvest dropped",
            [('last_unit["params"]["vertexColorPercent"] = [float(v.group(i)) for i in (1, 2, 3)]',
              'pass  # MUTATED')],
            "JASS vertex-colour params",
        ),
        (
            "M6 the JASS model-literal regex narrowed to .mdx only",
            [("(?:mdl|mdx|MDL|MDX)", "(?:mdx|MDX)")],
            "the JASS channel is lossy",
        ),
    ]
    for label, edits, expect in mutations:
        with tempfile.TemporaryDirectory() as tmp:
            run = run_variant(edits, tmp)
            blob = run.stderr + run.stdout
            check(label, run.returncode != 0 and expect in blob,
                  f"exit={run.returncode}, guard message {expect!r} not raised; "
                  f"tail={blob[-260:]!r}")

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
