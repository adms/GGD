#!/usr/bin/env python3
"""
scan_ability_effects.py — the all-hero JASS→content ability audit (掃描任務).

Owner directive (2026-07-25): every ability must be checked on THREE axes —
  特效 VFX   (3d model / particle / orb / locust dummies the WC3 trigger spawns)
  傷害 damage (the real numbers usually live in JASS triggers, NOT object data:
              AOsh shells ship DataA=0 and a trigger deals the damage)
  音效 SFX   (gg_snd_* the WC3 trigger plays; content has no per-ability sound
              field yet, so this axis is an INVENTORY of what should exist)

Ground-truth priority (see memory/PORTED_ABILITIES.md): JASS formula > object
data / per-level ubertip colour-span > tooltip prose. This script FINDS and
CITES; it does not edit content. Porting stays a reviewed, per-batch human task.

Join chain (proven on Saber godie-e002 → E002 → NN 20 → A0CM/A0DZ/A0D5/A0CT):
  content/champions/godie-<rc>.json  →  hero rawcode <RC>
    →  HERO_NUMBERS.hero_to_number[<RC>]  →  numbers[NN].heroes[rc].skills[]
    →  ability rawcode  →  OBJECTS.abilities[rawcode] (object data + ubertip)
    →  war3map.j  GetSpellAbilityId() == '<rawcode>'  →  Trig_<Stem> cluster
Fallback join: exact `name` match against OBJECTS.abilities (62/62 held on the
first port pass; ~65 duplicate names disambiguate on the NN- prefix).

Outputs (next to the other archaeology artifacts):
  out/GoDieEX22s-src/EFFECT_AUDIT.json   — machine-readable, per ability
  out/GoDieEX22s-src/EFFECT_AUDIT.md     — human summary, worst-first

Usage:  python3 tools/w3x-import/scan_ability_effects.py
"""

from __future__ import annotations

import json
import re
from bisect import bisect_right
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "tools" / "w3x-import" / "out" / "GoDieEX22s-src"
CONTENT = ROOT / "content"
OUT_JSON = SRC / "EFFECT_AUDIT.json"
OUT_MD = SRC / "EFFECT_AUDIT.md"

# ---------------------------------------------------------------- load sources

OBJECTS = json.loads((SRC / "OBJECTS.json").read_text())
HERO_NUMBERS = json.loads((SRC / "HERO_NUMBERS.json").read_text())
JASS_INDEX = json.loads((SRC / "JASS_INDEX.json").read_text())
JASS_LINES = (SRC / "raw" / "war3map.j").read_text(errors="replace").splitlines()

ABILITIES_OBJ = OBJECTS["abilities"]
HERO_TO_NUMBER = HERO_NUMBERS["hero_to_number"]
NUMBERS = HERO_NUMBERS["numbers"]

# name → [rawcode] (fallback join; NN- prefix usually disambiguates duplicates)
NAME_TO_RAW: dict[str, list[str]] = defaultdict(list)
for rc, entry in ABILITIES_OBJ.items():
    if entry.get("name"):
        NAME_TO_RAW[entry["name"]].append(rc)

# function line-ranges, sorted, for enclosing-function lookup (same approach as
# dummy_orb_scan.py — kept standalone so this script has no import-order coupling)
FUNC_RANGES = sorted(
    ((v["startLine"], v["endLine"], k) for k, v in JASS_INDEX["functions"].items()),
)
FUNC_STARTS = [r[0] for r in FUNC_RANGES]
TRIG_FUNCTIONS = JASS_INDEX["trigger_functions"]

TRIG_STEM_RE = re.compile(r"^Trig_(.+?)_(?:Actions|Conditions|Func.*)$")


def enclosing_func(line_no: int) -> str | None:
    i = bisect_right(FUNC_STARTS, line_no) - 1
    if i >= 0 and FUNC_RANGES[i][0] <= line_no <= FUNC_RANGES[i][1]:
        return FUNC_RANGES[i][2]
    return None


def func_trigger(fname: str) -> str | None:
    meta = TRIG_FUNCTIONS.get(fname)
    if meta:
        return meta["trigger"]
    m = TRIG_STEM_RE.match(fname)
    return m.group(1) if m else None


# rawcode literal occurrences, one pass over the whole file
RAWCODE_RE = re.compile(r"'([A-Za-z0-9]{4})'")
RAWCODE_LINES: dict[str, list[int]] = defaultdict(list)
for ln, text in enumerate(JASS_LINES, 1):
    for m in RAWCODE_RE.finditer(text):
        RAWCODE_LINES[m.group(1)].append(ln)

# trigger stem → set of line ranges (its whole function cluster)
TRIG_FUNCS: dict[str, list[tuple[int, int, str]]] = defaultdict(list)
for start, end, fname in FUNC_RANGES:
    stem = func_trigger(fname)
    if stem:
        TRIG_FUNCS[stem].append((start, end, fname))

# ---------------------------------------------------- per-trigger extraction

DAMAGE_CALL_RE = re.compile(r"UnitDamageTarget(?:BJ)?\s*\(")
SET_UDG_RE = re.compile(r"^\s*set\s+(udg_\w+)\s*=\s*(.+)$")
SFX_RE = re.compile(r"gg_snd_\w+")
MODEL_RE = re.compile(r'"([^"]+\.(?:mdl|mdx))"')
DUMMY_RE = re.compile(r"CreateNUnitsAtLoc\s*\(\s*\d+\s*,\s*'([A-Za-z0-9]{4})'")
LEVEL_LINEAR_RE = re.compile(
    r"GetUnitAbilityLevel(?:Swapped)?\([^)]*\)\s*\)?\s*\*\s*(\d+(?:\.\d+)?)"
)


def call_args_span(text: str, start: int) -> str:
    """Return the raw argument text of the call opening at `start` (best effort,
    single line — WC3-generated JASS never wraps a damage call)."""
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "(":
            depth += 1
        elif text[i] == ")":
            depth -= 1
            if depth == 0:
                return text[start + 1 : i]
    return text[start:]


def scan_trigger(stem: str) -> dict:
    """Extract the damage/vfx/sfx facts from one Trig_<stem> function cluster."""
    damage_calls: list[dict] = []
    udg_defs: dict[str, list[dict]] = defaultdict(list)
    sfx: set[str] = set()
    models: set[str] = set()
    dummies: set[str] = set()
    for start, end, fname in TRIG_FUNCS.get(stem, []):
        for ln in range(start, min(end, len(JASS_LINES)) + 1):
            text = JASS_LINES[ln - 1]
            m = DAMAGE_CALL_RE.search(text)
            if m:
                args = call_args_span(text, text.index("(", m.start()))
                damage_calls.append({"line": ln, "fn": fname, "args": args.strip()})
            m = SET_UDG_RE.match(text)
            if m:
                udg_defs[m.group(1)].append({"line": ln, "expr": m.group(2).strip()})
            sfx.update(SFX_RE.findall(text))
            models.update(MODEL_RE.findall(text))
            dummies.update(DUMMY_RE.findall(text))
    # attach udg definitions referenced by damage args (the WolfDamage lesson:
    # only SAME-cluster containment is sound — we never chase across triggers)
    for call in damage_calls:
        used = [v for v in udg_defs if v in call["args"]]
        call["udg"] = {v: udg_defs[v] for v in used}
    return {
        "damage_calls": damage_calls,
        "sfx": sorted(sfx),
        "models": sorted(models),
        "dummy_units": sorted(dummies),
    }


# --------------------------------------------------------- ubertip extraction

# the colour-span extraction (precise per memory): numbers inside |cAARRGGBB…|r
SPAN_RE = re.compile(r"\|c[0-9a-fA-F]{8}([^|]*?)\|r")
NUM_RE = re.compile(r"(\d+(?:\.\d+)?)")


def ubertip_numbers(entry: dict) -> dict[str, list[float]]:
    """Per-level list of numeric values found inside colour spans."""
    out: dict[str, list[float]] = {}
    for lvl, tip in (entry.get("ubertip") or {}).items():
        vals: list[float] = []
        for span in SPAN_RE.findall(tip):
            vals.extend(float(n) for n in NUM_RE.findall(span))
        if vals:
            out[lvl] = vals
    return out


# ------------------------------------------------------------- content facts

def walk_damage(effects: list) -> list[list[float]]:
    """All damage perRank arrays, recursing through spawnProjectile.onHit —
    the wrapping that hid these 20 from the earlier placeholder scan."""
    out = []
    for e in effects or []:
        if e.get("kind") == "damage":
            pr = (e.get("amount") or {}).get("perRank")
            if isinstance(pr, list):
                out.append([float(x) for x in pr])
        if e.get("kind") == "spawnProjectile":
            out.extend(walk_damage(e.get("onHit")))
    return out


def content_facts(doc: dict) -> dict:
    effects = doc.get("effects") or []
    dmg = walk_damage(effects)
    kinds = sorted({e.get("kind", "?") for e in effects})
    p = doc.get("passive")
    if p:
        kinds.append("passive")
    return {
        "kinds": kinds,
        "damage_perRank": dmg,
        "vfxKey": doc.get("vfxKey"),
        "projectileIds": [e.get("projectileId") for e in effects if e.get("kind") == "spawnProjectile"],
        "hitFeel": "hitFeel" in doc,
    }


# --------------------------------------------------------------- the sweep

def classify_damage(facts: dict, jass: dict, tips: dict) -> tuple[str, str]:
    """Damage-axis verdict + short reason. Conservative: MISMATCH only when a
    source number exists to disagree with."""
    dmg = facts["damage_perRank"]
    jass_deals = bool(jass and jass["damage_calls"])
    if not dmg:
        if jass_deals:
            return "NO_DAMAGE_EFFECT", "JASS cluster deals damage but content has no damage effect"
        return "N/A", "no damage on either side (buff/heal/summon/aura family)"
    flat = [x for pr in dmg for x in pr]
    if all(x == 0 for x in flat):
        return "ZERO", "content damage is all-zero"
    if all(x <= 2 for x in flat):
        return "TRIVIAL", "content damage <= 2 across all ranks"
    if not jass_deals and not tips:
        return "UNVERIFIED", "no JASS handler and no ubertip numbers to check against"
    # per-level ubertip spans: is every content rank value present in SOME
    # level's span set? (representative check, not a proof)
    if tips:
        tipvals = {v for vals in tips.values() for v in vals}
        missing = [x for pr in dmg for x in pr if x not in tipvals]
        if missing and len(missing) >= len(flat) // 2:
            return "SUSPECT", f"content values {sorted(set(missing))[:4]} absent from ubertip spans"
    return "OK", "non-zero and not contradicted by the checked sources"


def main() -> None:
    rows: list[dict] = []
    champs = sorted(CONTENT.glob("champions/godie-*.json"))
    for cpath in champs:
        cdoc = json.loads(cpath.read_text())
        cid = cdoc["id"]  # godie-e002
        hero_rc = cid.split("-", 1)[1].upper()  # E002
        nn = HERO_TO_NUMBER.get(hero_rc)
        skills = []
        if nn and nn in NUMBERS:
            for h in NUMBERS[nn]["heroes"]:
                if h["rawcode"] == hero_rc:
                    skills = h["skills"]
        by_name = {s["name"]: s["rawcode"] for s in skills}

        # the six slots: embedded QWER + standalone passive/EX
        slot_docs: list[tuple[str, dict]] = [
            (slot, cdoc["abilities"][slot]) for slot in ("Q", "W", "E", "R") if slot in cdoc.get("abilities", {})
        ]
        for key, field in (("PASSIVE", "passiveAbility"), ("EX", "exAbility")):
            aid = cdoc.get(field)
            if aid:
                ap = CONTENT / "abilities" / f"{aid}.json"
                if ap.exists():
                    slot_docs.append((key, json.loads(ap.read_text())))

        for slot, adoc in slot_docs:
            name = adoc.get("name", "")
            raw = by_name.get(name)
            if raw is None:
                cands = NAME_TO_RAW.get(name, [])
                raw = cands[0] if len(cands) == 1 else None
                if raw is None and nn and len(cands) > 1:
                    pref = [c for c in cands if ABILITIES_OBJ[c]["name"].startswith(f"{nn}-")]
                    raw = pref[0] if len(pref) == 1 else None
            obj = ABILITIES_OBJ.get(raw) if raw else None

            # JASS: every trigger cluster containing this rawcode literal
            stems: dict[str, dict] = {}
            if raw:
                for ln in RAWCODE_LINES.get(raw, []):
                    fn = enclosing_func(ln)
                    stem = func_trigger(fn) if fn else None
                    if stem and stem not in stems:
                        stems[stem] = scan_trigger(stem)
            jass_merged = {
                "triggers": sorted(stems),
                "damage_calls": [c | {"trigger": s} for s, x in stems.items() for c in x["damage_calls"]],
                "sfx": sorted({v for x in stems.values() for v in x["sfx"]}),
                "models": sorted({v for x in stems.values() for v in x["models"]}),
                "dummy_units": sorted({v for x in stems.values() for v in x["dummy_units"]}),
            }

            facts = content_facts(adoc)
            tips = ubertip_numbers(obj) if obj else {}
            dmg_verdict, dmg_reason = classify_damage(facts, jass_merged, tips)

            # VFX axis: content must carry SOME visual (vfxKey / projectile) if
            # the WC3 side visibly spawns models/dummies
            wc3_visual = bool(jass_merged["models"] or jass_merged["dummy_units"])
            has_visual = bool(facts["vfxKey"] or facts["projectileIds"])
            vfx_verdict = "OK" if has_visual else ("MISSING" if wc3_visual else "NONE_EITHER")

            # SFX axis: inventory only (no per-ability sound field in content yet)
            sfx_verdict = "WC3_HAS_SOUND" if jass_merged["sfx"] else "NO_WC3_SOUND"

            rows.append(
                {
                    "champion": cid,
                    "champion_name": cdoc.get("name", ""),
                    "slot": slot,
                    "ability": adoc.get("id"),
                    "name": name,
                    "rawcode": raw,
                    "base": obj.get("base") if obj else None,
                    "join": "hero-numbers" if name in by_name else ("name" if raw else "UNRESOLVED"),
                    "damage": {
                        "verdict": dmg_verdict,
                        "reason": dmg_reason,
                        "content_perRank": facts["damage_perRank"],
                        "ubertip_span_numbers": tips,
                        "jass_damage_calls": jass_merged["damage_calls"],
                    },
                    "vfx": {
                        "verdict": vfx_verdict,
                        "content_vfxKey": facts["vfxKey"],
                        "content_projectiles": facts["projectileIds"],
                        "jass_models": jass_merged["models"],
                        "jass_dummy_units": jass_merged["dummy_units"],
                    },
                    "sfx": {
                        "verdict": sfx_verdict,
                        "jass_sounds": jass_merged["sfx"],
                    },
                    "jass_triggers": jass_merged["triggers"],
                    "content_kinds": facts["kinds"],
                }
            )

    # ------------------------------------------------------------- summaries
    def count(pred) -> int:
        return sum(1 for r in rows if pred(r))

    summary = {
        "abilities_scanned": len(rows),
        "champions": len(champs),
        "join": {
            "hero-numbers": count(lambda r: r["join"] == "hero-numbers"),
            "name": count(lambda r: r["join"] == "name"),
            "UNRESOLVED": count(lambda r: r["join"] == "UNRESOLVED"),
        },
        "damage": {
            v: count(lambda r, v=v: r["damage"]["verdict"] == v)
            for v in ("ZERO", "TRIVIAL", "NO_DAMAGE_EFFECT", "SUSPECT", "UNVERIFIED", "OK", "N/A")
        },
        "vfx": {
            v: count(lambda r, v=v: r["vfx"]["verdict"] == v)
            for v in ("MISSING", "NONE_EITHER", "OK")
        },
        "sfx": {
            "wc3_has_sound": count(lambda r: r["sfx"]["verdict"] == "WC3_HAS_SOUND"),
            "content_sound_field_exists": False,
        },
    }
    OUT_JSON.write_text(json.dumps({"summary": summary, "abilities": rows}, ensure_ascii=False, indent=1))

    # markdown: worst-first tables
    sev = {"ZERO": 0, "NO_DAMAGE_EFFECT": 1, "TRIVIAL": 2, "SUSPECT": 3, "UNVERIFIED": 4, "OK": 8, "N/A": 9}
    bad = sorted(
        (r for r in rows if sev[r["damage"]["verdict"]] < 8),
        key=lambda r: (sev[r["damage"]["verdict"]], r["champion"], r["slot"]),
    )
    md = ["# EFFECT_AUDIT — all-hero JASS→content 三軸掃描 (傷害/特效/音效)", ""]
    md.append(f"Scanned **{summary['abilities_scanned']} ability instances** across {summary['champions']} champions.")
    md.append(f"Join: {summary['join']}  ·  Damage verdicts: {summary['damage']}")
    md.append(f"VFX verdicts: {summary['vfx']}  ·  SFX: {summary['sfx']}")
    md.append("")
    md.append("> Ground truth: JASS trigger > object data / ubertip colour-span > prose.")
    md.append("> This report FINDS AND CITES; edits stay reviewed per-batch (mirror model,")
    md.append("> line edits, `pnpm content:build`, guard tests). Content has NO per-ability")
    md.append("> sound field yet — SFX axis is the inventory for that future surface.")
    md.append("")
    md.append("## 傷害 axis — actionable, worst-first")
    md.append("")
    md.append("| ability | name | rawcode | verdict | content perRank | JASS damage (cited) |")
    md.append("|---|---|---|---|---|---|")
    for r in bad:
        calls = r["damage"]["jass_damage_calls"]
        cite = "; ".join(f"`{c['trigger']}` j:{c['line']}" for c in calls[:2]) or "—"
        pr = r["damage"]["content_perRank"]
        md.append(
            f"| {r['ability']} | {r['name']} | {r['rawcode'] or '?'} | **{r['damage']['verdict']}** | {pr} | {cite} |"
        )
    md.append("")
    md.append("## 特效 axis — WC3 spawns visuals but content shows nothing")
    md.append("")
    md.append("| ability | name | jass models | jass dummy units |")
    md.append("|---|---|---|---|")
    for r in rows:
        if r["vfx"]["verdict"] == "MISSING":
            md.append(
                f"| {r['ability']} | {r['name']} | {', '.join(r['vfx']['jass_models'][:3]) or '—'} | {', '.join(r['vfx']['jass_dummy_units'][:4]) or '—'} |"
            )
    md.append("")
    md.append("## 音效 axis — WC3 sounds per ability (content field TBD)")
    md.append("")
    md.append("| ability | name | gg_snd refs |")
    md.append("|---|---|---|")
    for r in rows:
        if r["sfx"]["jass_sounds"]:
            md.append(f"| {r['ability']} | {r['name']} | {', '.join(r['sfx']['jass_sounds'][:5])} |")
    OUT_MD.write_text("\n".join(md) + "\n")

    print(f"scanned {len(rows)} abilities / {len(champs)} champions")
    print("damage:", summary["damage"])
    print("vfx:", summary["vfx"])
    print("sfx:", summary["sfx"])
    print(f"wrote {OUT_JSON.relative_to(ROOT)} and {OUT_MD.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
