#!/usr/bin/env python3
"""Extract per-spell JASS slices from the map script — **trigger-family driven**.

GH#542.  The artifact this replaces (``out/GoDieEX22s/jass-spells/``, 67 ``.j`` files)
was produced by a script that was **never committed**, so it could neither be re-run
nor audited, and it was frozen at whatever roster existed the day it ran.

Two things were wrong with how it selected work, both measured (see ``--stats``):

1. **It was content-driven, not JASS-driven.**  ``INDEX.json`` says it walked
   "178 TODO-placeholder targets" taken from ``content/champions/**`` + drafts and
   looked each rawcode up in the script.  It therefore *considered* 128 rawcodes
   while the script actually dispatches **317**.  220 spell rawcodes were never
   even looked at — and the output looks completely normal, it is just missing 85%.

2. **It read the obfuscated map.**  It sliced ``GoDieEX22s/raw/scripts__war3map.j``
   (protected: single-char function names, no trigger families), while
   ``GoDieEX22s-src/raw/war3map.j`` is the unprotected source of the same map with
   the full ``Trig_<base>_*`` naming intact.  ``docs/legacy/_vfx-fidelity-w3x.md``
   already says the src map is the primary source.  The src rawcode set is a strict
   superset of the protected one (317 ⊃ 314), so nothing is lost by switching.

The fix is to stop selecting spells at all and instead enumerate **trigger families**:
every ``InitTrig_<base>`` in the script owns a family ``Trig_<base>_Conditions`` /
``Trig_<base>_Func<NNN>[AC]`` / ``Trig_<base>_Actions``.  Taking the family as one
unit picks up, for free, the three shapes the old join dropped:

  (a) forwarded condition chains  (``Trig_X_Func001C`` never names the rawcode itself)
  (b) damage/attack/death-event passives (no ``GetSpellAbilityId`` at all — they gate
      on ``GetUnitAbilityLevel('AXXX', u) > 0`` deep inside the Actions body)
  (c) families bound to a hero through a ``udg_*`` global rather than a rawcode

Usage
-----
    python3 tools/w3x-import/extract_jass_spells.py                 # write slices
    python3 tools/w3x-import/extract_jass_spells.py --check         # byte-exact gate
    python3 tools/w3x-import/extract_jass_spells.py --stats         # JSON, no writes

``--stats`` is what ``packages/shared/src/ops/jassExtractionCoverage.test.ts`` reads.
It never writes, so the guard is safe to run from a test.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))

DEFAULT_JASS = os.path.join(HERE, "out", "GoDieEX22s-src", "raw", "war3map.j")
DEFAULT_META = os.path.join(HERE, "out", "GoDieEX22s", "parsed", "abilities.json")
DEFAULT_OUT = os.path.join(HERE, "out", "GoDieEX22s", "jass-spells")

GENERATOR = "tools/w3x-import/extract_jass_spells.py"

# A family may call shared helpers (polar projection, group wipes, dummy lifecycle).
# Pull them in at depth 1 so a slice reads standalone, but cap the body size: a handful
# of helpers in this map are 400+ line dispatch tables that would swamp every slice.
HELPER_DEPTH = 1
HELPER_MAX_LINES = 120

# ---------------------------------------------------------------------------
# Rawcodes that are dispatched in JASS but that no trigger family can be pinned to.
# ⛔ Anything added here needs a reason that can be argued with — "not collected yet"
# is not one.  The guard test reads this table, so an unexplained gap goes red.
#
# Currently empty, and that is the point: every rawcode the script dispatches lands in
# a family.  The one case that nearly escaped (A0ZI, gated inside the hand-named helper
# ``JudgeFunc`` rather than a ``Trig_FlyAway_*`` function) is why attribution walks the
# exclusive-helper closure below instead of trusting the naming convention alone.
# ---------------------------------------------------------------------------
UNATTRIBUTABLE: dict[str, str] = {}

SPELL_ID = re.compile(r"GetSpellAbilityId\(\)\s*==\s*'([^']{4})'")
ABIL_LVL = re.compile(r"GetUnitAbilityLevel(?:Swapped)?\(\s*'([^']{4})'")
UNIT_TYPE = re.compile(r"GetUnitTypeId\(.*?\)\s*==\s*'([^']{4})'")
TRIG_GLOBAL = re.compile(r"\bgg_trg_(\w+)\b")
FUNC_DEF = re.compile(r"^function\s+(\S+)\s+takes\b")
INIT_TRIG = re.compile(r"^function\s+InitTrig_(\S+)\s+takes\b")
CALLS = re.compile(r"\b([A-Za-z_]\w*)\s*\(")
EVENTS = re.compile(r"\b(EVENT_[A-Z_]+)\b")


def read_normalised(path: str) -> str:
    """The map script ships with CR line endings; every line number here is post-normalisation."""
    raw = open(path, "rb").read()
    return raw.decode("utf-8", errors="replace").replace("\r\n", "\n").replace("\r", "\n")


def parse_functions(text: str) -> dict[str, dict]:
    """name -> {start, end, body}.  1-indexed line numbers, matching the slice headers."""
    funcs: dict[str, dict] = {}
    name = None
    start = 0
    buf: list[str] = []
    for i, line in enumerate(text.split("\n")):
        m = FUNC_DEF.match(line)
        if m:
            name, start, buf = m.group(1), i + 1, [line]
        elif name is not None and line.strip() == "endfunction":
            buf.append(line)
            funcs[name] = {"start": start, "end": i + 1, "body": "\n".join(buf)}
            name, buf = None, []
        elif name is not None:
            buf.append(line)
    return funcs


def group_families(funcs: dict[str, dict], text: str) -> dict[str, list[str]]:
    """Every InitTrig_<base> owns Trig_<base>_* .  Longest base wins so that
    ``Trig_Fire_Actions`` never gets stolen by a base called ``Fire_Ball``."""
    bases = sorted(
        (m.group(1) for m in (INIT_TRIG.match(l) for l in text.split("\n")) if m),
        key=len,
        reverse=True,
    )
    fams: dict[str, list[str]] = {b: [] for b in bases}
    for fn in funcs:
        for b in bases:
            if fn == "InitTrig_" + b or fn == "Trig_" + b or fn.startswith("Trig_" + b + "_"):
                fams[b].append(fn)
                break
    return {b: sorted(v, key=lambda f: funcs[f]["start"]) for b, v in fams.items() if v}


def helper_closure(fam_fns: list[str], funcs: dict[str, dict]) -> tuple[list[str], list[str]]:
    """User-defined functions the family calls but does not own.  Natives and BJs are
    not in ``funcs`` so they fall out on their own."""
    seen, frontier, kept, truncated = set(fam_fns), list(fam_fns), [], []
    for _ in range(HELPER_DEPTH):
        nxt = []
        for fn in frontier:
            for callee in CALLS.findall(funcs[fn]["body"]):
                if callee in seen or callee not in funcs:
                    continue
                seen.add(callee)
                body = funcs[callee]["body"]
                if body.count("\n") + 1 > HELPER_MAX_LINES:
                    truncated.append(callee)
                else:
                    kept.append(callee)
                    nxt.append(callee)
        frontier = nxt
    return sorted(kept, key=lambda f: funcs[f]["start"]), sorted(truncated)


def analyse(jass_path: str) -> dict:
    text = read_normalised(jass_path)
    funcs = parse_functions(text)
    fams = group_families(funcs, text)

    dispatched = set(SPELL_ID.findall(text)) | set(ABIL_LVL.findall(text))

    closures = {b: helper_closure(fns, funcs) for b, fns in fams.items()}

    # A helper called by exactly one family belongs to it, so its rawcodes are that
    # family's rawcodes.  A helper shared by several families is a library routine —
    # attributing its rawcodes would smear one spell across every caller, which is the
    # over-collection docs/legacy/_vfx-fidelity-w3x.md already flags in the old slices.
    owners: dict[str, set[str]] = {}
    for base, (kept, _) in closures.items():
        for h in kept:
            owners.setdefault(h, set()).add(base)
    exclusive = {b: [h for h in kept if len(owners[h]) == 1] for b, (kept, _) in closures.items()}

    families: dict[str, dict] = {}
    for base, fns in fams.items():
        helpers, truncated = closures[base]
        body = "\n".join(funcs[f]["body"] for f in fns + exclusive[base])
        spell = sorted(set(SPELL_ID.findall(body)))
        passive = sorted(set(ABIL_LVL.findall(body)) - set(spell))
        if not spell and not passive:
            continue
        init = funcs.get("InitTrig_" + base)
        families[base] = {
            "base": base,
            "functions": fns,
            "spellRawcodes": spell,
            "passiveRawcodes": passive,
            "events": sorted(set(EVENTS.findall(init["body"]))) if init else [],
            "kind": "active" if spell else "passive",
            "helpers": helpers,
            "truncatedHelpers": truncated,
            "line": min(funcs[f]["start"] for f in fns),
        }

    by_rawcode: dict[str, list[str]] = {}
    for base, fam in families.items():
        for rc in fam["spellRawcodes"] + fam["passiveRawcodes"]:
            by_rawcode.setdefault(rc, []).append(base)

    # ── second keying axis: hero-activation clusters ────────────────────────────
    # A hero's signature triggers often carry no rawcode at all.  Saber's 理想鄉 is the
    # canonical case: ``Trig_ExcaliburMAX_*`` binds its caster through the global
    # ``udg_saber`` and is armed from outside by ``Trig_Open_Skill_of_Saber_Actions``,
    # which gates on the *unit* rawcode 'E002' and then EnableTrigger()s the whole
    # cluster.  This is the shape ggd-jass-passive-lookup describes — the JASS for an
    # innate hangs off the hero unit rawcode, not off an ability rawcode — so keying a
    # slice by that unit rawcode is the only way these families are reachable at all.
    arms: dict[str, set[str]] = {}
    for base, fns in fams.items():
        body = "\n".join(funcs[f]["body"] for f in fns)
        arms[base] = {t for t in TRIG_GLOBAL.findall(body) if t in fams and t != base}

    by_unit: dict[str, list[str]] = {}
    clusters: dict[str, dict] = {}
    for base, armed in arms.items():
        if not armed:
            continue
        units = sorted(set(UNIT_TYPE.findall("\n".join(funcs[f]["body"] for f in fams[base]))))
        if not units:
            continue
        clusters[base] = {"unitRawcodes": units, "arms": sorted(armed)}
        for u in units:
            by_unit.setdefault(u, []).append(base)

    covered = set(by_rawcode)
    return {
        "jass": os.path.relpath(jass_path, REPO),
        "funcs": funcs,
        "allFamilies": fams,
        "families": families,
        "clusters": clusters,
        "byRawcode": {k: sorted(v) for k, v in sorted(by_rawcode.items())},
        "byUnit": {k: sorted(v) for k, v in sorted(by_unit.items())},
        "dispatchedRawcodes": sorted(dispatched),
        "uncovered": sorted(dispatched - covered),
        "totalFunctions": len(funcs),
        "totalFamilies": len(fams),
    }


def stats(a: dict) -> dict:
    dispatched = a["dispatchedRawcodes"]
    uncovered = a["uncovered"]
    unexplained = [rc for rc in uncovered if rc not in UNATTRIBUTABLE]
    reachable = set(a["families"])
    for base, c in a["clusters"].items():
        reachable.add(base)
        reachable |= set(c["arms"])
    return {
        "generator": GENERATOR,
        "jass": a["jass"],
        "totalFunctions": a["totalFunctions"],
        "totalTriggerFamilies": a["totalFamilies"],
        "abilityTriggerFamilies": len(a["families"]),
        "heroActivationClusters": len(a["clusters"]),
        "reachableFamilies": len(reachable),
        "dispatchedRawcodes": len(dispatched),
        "coveredRawcodes": len(a["byRawcode"]),
        "coveredUnitRawcodes": len(a["byUnit"]),
        "sliceCount": len(a["byRawcode"]) + len(a["byUnit"]),
        "uncoveredRawcodes": uncovered,
        "unexplainedRawcodes": unexplained,
        "exempt": UNATTRIBUTABLE,
    }


def render_slice(header: list[str], bases: list[str], a: dict) -> str:
    funcs, out, emitted = a["funcs"], list(header), set()
    out.append(f"// source: {a['jass']} (CR-normalized line numbers)")
    out.append(f"// generator: {GENERATOR}")
    out.append(f"// trigger families: {', '.join(bases)}")
    for base in bases:
        fam = a["families"].get(base)
        fns = fam["functions"] if fam else a["allFamilies"][base]
        helpers = fam["helpers"] if fam else []
        kind = fam["kind"] if fam else "armed"
        events = ",".join(fam["events"]) if fam and fam["events"] else "none"
        out.append("")
        out.append(f"// === family {base} ({kind}) events={events} ===")
        if fam and fam["truncatedHelpers"]:
            out.append(f"// omitted oversized shared helpers: {', '.join(fam['truncatedHelpers'])}")
        for fn in fns + helpers:
            if fn in emitted:
                continue
            emitted.add(fn)
            out.append("")
            out.append(
                f"// --- {fn} ({'family' if fn in fns else 'helper'}, "
                f"line {funcs[fn]['start']}) ---"
            )
            out.append(funcs[fn]["body"])
    return "\n".join(out) + "\n"


def _ability_header(rc: str, meta: dict) -> list[str]:
    m = meta.get(rc) or {}
    out = [f"// rawcode: {rc}"]
    if m.get("name"):
        out.append(f"// nameZh: {m['name']}")
    if m.get("levels"):
        out.append(f"// w3a base: {m.get('base', '?')}  levels: {m['levels']}")
    for field in ("cooldown", "mana", "range", "area", "duration", "hero_duration"):
        if m.get(field):
            out.append(f"// {field}: {json.dumps(m[field], sort_keys=True)}")
    return out


def render_all(a: dict, meta: dict) -> dict[str, str]:
    files = {
        f"{rc}.j": render_slice(_ability_header(rc, meta), bases, a)
        for rc, bases in a["byRawcode"].items()
    }
    for unit, owners in a["byUnit"].items():
        bases: list[str] = []
        for owner in owners:
            for b in [owner] + a["clusters"][owner]["arms"]:
                if b not in bases:
                    bases.append(b)
        files[f"unit-{unit}.j"] = render_slice(
            [f"// unit rawcode: {unit}", "// keyed by hero-activation cluster (no ability rawcode)"],
            bases,
            a,
        )

    index = {
        "generator": GENERATOR,
        "jass": a["jass"],
        "coverage": {
            k: v
            for k, v in stats(a).items()
            if k not in ("generator", "jass", "exempt", "unexplainedRawcodes")
        },
        "exempt": UNATTRIBUTABLE,
        "byRawcode": {
            rc: {
                "sliceFile": f"{rc}.j",
                "nameZh": (meta.get(rc) or {}).get("name"),
                "families": bases,
                "kind": "active"
                if any(a["families"][b]["kind"] == "active" for b in bases)
                else "passive",
            }
            for rc, bases in a["byRawcode"].items()
        },
        "byUnit": {
            unit: {"sliceFile": f"unit-{unit}.j", "clusterOwners": owners}
            for unit, owners in a["byUnit"].items()
        },
        "families": {
            b: {
                k: f[k]
                for k in ("functions", "spellRawcodes", "passiveRawcodes", "events", "kind", "line")
            }
            for b, f in sorted(a["families"].items())
        },
    }
    files["INDEX.json"] = json.dumps(index, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    return files


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--jass", default=DEFAULT_JASS)
    ap.add_argument("--meta", default=DEFAULT_META, help="parsed/abilities.json for slice headers")
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--check", action="store_true", help="compare with --out, exit 1 if stale")
    ap.add_argument("--stats", action="store_true", help="print coverage JSON, write nothing")
    args = ap.parse_args(argv)

    a = analyse(args.jass)

    if args.stats:
        print(json.dumps(stats(a), ensure_ascii=False, indent=1, sort_keys=True))
        return 0

    unexplained = stats(a)["unexplainedRawcodes"]
    if unexplained:
        print(
            "FAIL: dispatched rawcodes with no trigger family and no reason in "
            f"UNATTRIBUTABLE: {', '.join(unexplained)}",
            file=sys.stderr,
        )
        return 2

    meta = json.load(open(args.meta, encoding="utf-8")) if os.path.exists(args.meta) else {}
    files = render_all(a, meta)

    if args.check:
        stale = []
        for name, text in sorted(files.items()):
            p = os.path.join(args.out, name)
            if not os.path.exists(p) or open(p, encoding="utf-8").read() != text:
                stale.append(name)
        extra = [
            f
            for f in (os.listdir(args.out) if os.path.isdir(args.out) else [])
            if f.endswith(".j") and f not in files
        ]
        if stale or extra:
            print(
                f"STALE: {len(stale)} slice(s) differ, {len(extra)} orphan(s). "
                f"Run: python3 {GENERATOR}",
                file=sys.stderr,
            )
            return 1
        print(f"OK: {len(files)} files up to date")
        return 0

    os.makedirs(args.out, exist_ok=True)
    for name, text in files.items():
        with open(os.path.join(args.out, name), "w", encoding="utf-8") as fh:
            fh.write(text)
    print(
        f"wrote {len(files)} files to {args.out} — "
        f"{len(a['byRawcode'])}/{len(a['dispatchedRawcodes'])} dispatched rawcodes covered "
        f"from {len(a['families'])} ability trigger families"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
