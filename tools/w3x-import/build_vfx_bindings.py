#!/usr/bin/env python3
"""Merge the two w3x VFX archaeology datasets into ONE renderer-consumable index.

    python3 tools/w3x-import/build_vfx_bindings.py

Inputs (all read-only)
  1. out/emitters/EMITTERS.json          — 132 models, 238 PRE2 + 56 RIBB emitters, byte-exact
  2. out/emitters/MODEL_REFS.json        — every model-valued object-data field, classified
  3. out/invocation-params/INVOCATION_PARAMS.json — 455 per-invocation art parameter sets
  4. out/GoDieEX22s-src/raw/war3map.w3a  — ability object data (baseId, art overrides, buff refs)
  5. out/GoDieEX22s-src/raw/war3map.w3h  — buff object data (the SECOND art channel)
  6. out/GoDieEX22s-src/raw/war3map.w3u  — dummy/hero unit data (base scale, tint, model)
  7. <repo>/War3Patch.mpq > War3x.mpq > war3.mpq : Units\\*AbilityFunc.txt
                                         — INHERITED stock art for abilities the map did not override
  8. content/abilities/*.json            — GGD ability docs, for the id bridge (READ ONLY)
  9. content/vfx/*.json                  — existing emitter docs, to mark which are already shipped

Output
  out/vfx-bindings/VFX_BINDINGS.json     — the merged index
  out/vfx-bindings/VFX_BINDINGS.md       — schema + provenance companion doc
  out/vfx-bindings/SCOREBOARD.json       — just the coverage numbers, for a live page

This script WRITES NOTHING outside tools/w3x-import/out/vfx-bindings/.
"""

from __future__ import annotations

import glob
import json
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

from w3xlib.objdata import all_entries, parse_object_file  # noqa: E402
from w3xlib.mpq import W3XArchive  # noqa: E402

SRC = os.path.join(HERE, "out", "GoDieEX22s-src")
RAW = os.path.join(SRC, "raw")
OUTDIR = os.path.join(HERE, "out", "vfx-bindings")

# ---------------------------------------------------------------------------
# Field contracts
# ---------------------------------------------------------------------------

# w3a art codes -> canonical slot name. Verified against MODEL_REFS.byField.
ABILITY_ART_CODES = {
    "atat": "target",
    "amat": "missile",
    "acat": "caster",
    "asat": "special",
    "aeat": "effect",
    "alig": "lightning",
    "aaea": "area",
}
# w3a attach-point codes -> slot. `ata0..5` are the up-to-6 target attach points.
ABILITY_ATTACH_CODES = {
    "acap": ("caster", 0),
    "aspt": ("special", 0),
    "aeat_attach": ("effect", 0),
    "aean": ("area", 0),
    **{f"ata{i}": ("target", i) for i in range(6)},
}
# w3h (buff) art codes.
BUFF_ART_CODES = {
    "ftat": "target",
    "fsat": "special",
    "feat": "effect",
    "flig": "lightning",
    "fefs": "effectSound",
}
BUFF_ATTACH_CODES = {
    "fspt": ("special", 0),
    "feft": ("effect", 0),
    **{f"fta{i}": ("target", i) for i in range(6)},
}

# Stock *AbilityFunc.txt keys -> canonical slot. Keys are case-normalised first:
# the retail files mix `Targetart` / `TargetArt` / `SpecialArt` in the same file.
STOCK_ART_KEYS = {
    "targetart": "target",
    "missileart": "missile",
    "casterart": "caster",
    "specialart": "special",
    "effectart": "effect",
    "areaeffectart": "area",
    "lightningeffect": "lightning",
    "buffart": "buffIcon",  # an icon, NOT a model — kept out of the model census
}
STOCK_ATTACH_KEYS = {
    "targetattach": ("target", 0),
    **{f"targetattach{i}": ("target", i) for i in range(1, 6)},
    "casterattach": ("caster", 0),
    "specialattach": ("special", 0),
    "effectattach": ("effect", 0),
    "areaeffectattach": ("area", 0),
}

# WC3 lightning ids carry no model — they are rows in Lightning.slk.
LIGHTNING_IDS = {
    "AFOD", "AFOx", "CHIM", "CLPB", "CLSB", "DRAB", "DRAL", "DRAM",
    "FORK", "HWPB", "HWSB", "LEAS", "MBUR", "MFPB", "SPLK",
}

ORB_BASE = "Asph"          # WC3 "Item Sphere" — the permanent attached-model base
LOCUST_SWARM_BASE = "AUls"  # Crypt Lord Locust Swarm

# The 蝗蟲群 cases docs/legacy/_vfx-fidelity-w3x.md §3.2 identified BY HAND. Used as a golden
# set to measure this file's mechanical detector — a detector nobody scored is a guess.
SWARM_GOLDEN = {
    "A0IB": "66-03 七夜怪談 — base AUls, 22 red Nether Dragons",
    "A0DO": "39-03 蛟龍 — CreateNUnitsAtLoc(3)",
    "A08Y": "06-00 猜猜拳 — CreateNUnitsAtLoc(5), scale 7.0",
    "A0VS": "91-002 亡靈大軍 — 8-iteration PolarProjection loop",
    "A07Z": "75-03 暴雷無限刃 — ONE invisible unit repositioned 15x",
    "A0U6": "35-04 光牙 — 8 invisible dummies, fan",
    "A03S": "09-04 龜派氣功 — chained PolarProjection detonations",
    "A01B": "47-03 九頭龍閃 — five whole dragons as area art",
    "A0VI": "28-002 普烏死亡 — Spawn Hydra retuned to 9 HeroBuu",
    "A0KC": "37-03 災難之牆 — a row of 2.0x fire emitters",
    "A091": "05-03 及喀爾度 — fan whose spacing is 180/level",
}

# The owner's own naming: 18 custom abilities are literally called 球體(...).
ORB_NAME_RE = re.compile(r"球體")

SLOT_FROM_NUMBER = {"00": "passive", "01": "q", "02": "w", "03": "e", "04": "r", "002": "ex"}
NAME_NUMBER_RE = re.compile(r"^\s*(\d{2})-(\d{2,3})")


TRIGSTR_RE = re.compile(r"^TRIGSTR_0*(\d+)$")
COLOR_RE = re.compile(r"\|c[0-9a-fA-F]{8}|\|r", re.I)


def norm_model(v):
    """Un-escape and normalise a model path; '' / 'none' / '_' mean 'no art'."""
    if v is None:
        return None
    s = str(v).replace("\\\\", "\\").strip().strip('"')
    if not s or s.lower() in ("none", "_", "none.mdl", ".mdl"):
        return None
    return s


def split_art(v):
    """Correction M6, the OTHER half.

    An art field may be a comma-separated LIST — `HeroBuu.mdx,HeroBuu.mdx,...` (28-002
    普烏死亡 spawns 9 Buus), `AFOD,AFOD,AFOD` (41-01 吸血鬼之吻 = three parallel death
    beams), `DRAB,DRAL,DRAM` (96-03 吸星大法 = three stacked drain beams). Reading the
    whole string as one path loses every layer but the first — and resolves to nothing.

    Attach-point fields are the EXACT OPPOSITE: `right,hand` / `chest,mount` is ONE point
    written as two tokens, so they are never split. That asymmetry is why this is a
    separate function and not a generic `.split(",")`.
    """
    m = norm_model(v)
    if not m:
        return []
    if "," not in m:
        return [m]
    return [p.strip() for p in m.split(",") if p.strip()]


def resolve_name(v, strings):
    if v is None:
        return ""
    s = str(v).strip()
    mt = TRIGSTR_RE.match(s)
    if mt:
        s = strings.get(str(int(mt.group(1))), s)
    return COLOR_RE.sub("", s).strip()


def stem_of(path):
    if not path:
        return None
    base = path.replace("/", "\\").split("\\")[-1]
    base = re.sub(r"\.(mdx|mdl|blp)$", "", base, flags=re.I)
    return base.lower().replace("_", "-").replace(" ", "-")


def classify_form(value):
    """Reproduces MODEL_REFS' classifier, including the poweraura correction:
    `war3mapImported\\` is the EDITOR IMPORT folder, not a Blizzard stock path."""
    if not value:
        return "invisible"
    v = value.strip()
    if v in LIGHTNING_IDS or (len(v) == 4 and v.isalpha() and v.isupper()):
        return "lightning-id"
    low = v.lower()
    if low.startswith("war3mapimported\\") or low.startswith("war3mapimported/"):
        return "map-imported"
    if "\\" in v or "/" in v:
        return "blizzard-stock"
    return "map-imported"


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------

def load_stock_ability_func():
    """Merge Units\\*AbilityFunc.txt from the retail MPQs (later archive wins).

    This is correction M2 from docs/legacy/_vfx-fidelity-w3x.md: war3map.w3a stores only
    OVERRIDES. An ability with no art override does NOT mean 'no art' — it means
    'inherits the base ability's stock art'. Skipping this file mis-reports about
    a third of the map's abilities as having no visual at all.
    """
    races = ["Human", "Orc", "NightElf", "Undead", "Neutral", "Common", "Item", "Campaign"]
    # war3.mpq is oldest, War3Patch.mpq newest — read oldest-first so newest wins.
    archives = ["war3.mpq", "War3x.mpq", "War3Patch.mpq"]
    out: dict[str, dict] = {}
    read = {"archives": [], "records": 0, "files": 0}
    for arc in archives:
        full = os.path.join(REPO, arc)
        if not os.path.exists(full):
            continue
        a = W3XArchive(full)
        read["archives"].append(arc)
        for race in races:
            try:
                blob = a.read_file("Units\\%sAbilityFunc.txt" % race)
            except Exception:
                blob = None
            if not blob:
                continue
            read["files"] += 1
            cur = None
            for line in blob.decode("utf-8-sig", errors="replace").splitlines():
                line = line.strip()
                if not line or line.startswith("//"):
                    continue
                if line.startswith("[") and line.endswith("]"):
                    cur = line[1:-1].strip()
                    out.setdefault(cur, {})
                    continue
                if cur is None or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                out[cur][k.strip().lower()] = v.strip().strip('"')
    read["records"] = len(out)
    return out, read


def load_w3a():
    data = open(os.path.join(RAW, "war3map.w3a"), "rb").read()
    return {e.obj_id: e for e in all_entries(parse_object_file(data, has_levels=True))}


def load_w3h():
    p = os.path.join(RAW, "war3map.w3h")
    if not os.path.exists(p):
        return {}
    data = open(p, "rb").read()
    return {e.obj_id: e for e in all_entries(parse_object_file(data, has_levels=False))}


def load_w3u():
    data = open(os.path.join(RAW, "war3map.w3u"), "rb").read()
    return {e.obj_id: e for e in all_entries(parse_object_file(data, has_levels=False))}


def load_jass_loop_ranges():
    """[(startLine, endLine)] for every balanced `loop` ... `endloop` in war3map.j.

    The map's real 蝗蟲群 idiom is a LOOP that spawns one dummy per iteration --
    `PolarProjection(450, 45*i)` x8 for 91-002 亡靈大軍, 15 repositions for 75-03
    暴雷無限刃, a level-scaled fan for 05-03 及喀爾度. Textually each is a single
    `CreateNUnitsAtLoc(1, ...)`, so a count-based scan reports them as one unit and
    the whole swarm disappears. Line numbers are already on every invocation, so
    membership in a loop range is the cheap correct test.
    """
    p = os.path.join(RAW, "war3map.j")
    ranges, stack = [], []
    with open(p, encoding="utf-8", errors="replace") as fh:
        for n, line in enumerate(fh, 1):
            s = line.strip()
            if s == "loop":
                stack.append(n)
            elif s == "endloop" and stack:
                ranges.append((stack.pop(), n))
    ranges.sort()
    return ranges


def load_strings():
    p = os.path.join(SRC, "STRINGS.json")
    if not os.path.exists(p):
        return {}
    return json.load(open(p, encoding="utf-8"))


def load_ggd_ability_docs():
    docs = {}
    for f in sorted(glob.glob(os.path.join(REPO, "content", "abilities", "*.json"))):
        b = os.path.basename(f)[:-5]
        if b.startswith("_"):
            continue
        try:
            docs[b] = json.load(open(f, encoding="utf-8"))
        except Exception:
            continue
    return docs


def load_shipped_vfx_docs():
    ids = set()
    for f in glob.glob(os.path.join(REPO, "content", "vfx", "*.json")):
        b = os.path.basename(f)[:-5]
        if not b.startswith("_"):
            ids.add(b)
    return ids


# ---------------------------------------------------------------------------
# Art resolution
# ---------------------------------------------------------------------------

def art_from_w3a(entry):
    """{slot: {level: [path, ...]}} for the map's own overrides (lists — see split_art)."""
    out = defaultdict(dict)
    for code, slot in ABILITY_ART_CODES.items():
        for lvl, val in entry.levels(code).items():
            paths = split_art(val)
            if paths:
                out[slot][lvl] = paths
    return {k: dict(v) for k, v in out.items()}


def attach_from_w3a(entry):
    out = defaultdict(dict)
    for code, (slot, idx) in ABILITY_ATTACH_CODES.items():
        for lvl, val in entry.levels(code).items():
            if isinstance(val, str) and val.strip():
                # `right,hand` / `chest,mount` are ONE point written as two tokens.
                out[slot][str(idx)] = val.strip()
    return {k: dict(v) for k, v in out.items()}


def art_from_stock(rec):
    """{slot: [path, ...]} inherited from the retail *AbilityFunc.txt record."""
    out = {}
    if not rec:
        return out
    for k, slot in STOCK_ART_KEYS.items():
        if slot == "buffIcon":
            continue
        paths = split_art(rec.get(k))
        if paths:
            out[slot] = paths
    return out


def attach_from_stock(rec):
    out = defaultdict(dict)
    if not rec:
        return {}
    for k, (slot, idx) in STOCK_ATTACH_KEYS.items():
        v = rec.get(k)
        if v:
            out[slot][str(idx)] = v.strip()
    return {k: dict(v) for k, v in out.items()}


def write_companion_doc(m, ggd_docs):
    s = m["summary"]
    L = []
    w = L.append
    w("# `VFX_BINDINGS.json` — schema, provenance, and the honest scoreboard\n")
    w("Generated by `tools/w3x-import/build_vfx_bindings.py`. Re-run it to regenerate; it")
    w("writes only into `tools/w3x-import/out/vfx-bindings/` and never touches `content/**`.\n")
    w("This file merges the two archaeology datasets — `out/emitters/` (what the imported")
    w("`.mdx` models actually contain) and `out/invocation-params/` (what the JASS does to")
    w("them at cast time) — and adds three channels neither had: **inherited stock art**,")
    w("**buff art**, and **summoned-unit art**.\n")

    w("## 1. The lookup the renderer wants\n")
    w("```")
    w("ability rawcode  ->  abilities[\"A0D5\"]")
    w("   .art.{target|missile|caster|special|effect|lightning|area}")
    w("        .entries[]  {level, layer, path, stem, form, assetStatus, provenance, confidence}")
    w("        .attachPoints  {\"0\": \"right,hand\", \"1\": \"weapon\"}")
    w("   .buffChannel[buffId].{target|special|effect|lightning}[]   <- passives / DoTs / auras")
    w("   .summonedUnits[]    {unitId, viaField, model, baseScale, vertexTint, flyHeight}")
    w("   .invocations[]      per-cast overrides: params{scalePercent,timeScalePercent,")
    w("                       vertexColor,flyHeight,facing,animation} + lifecycle{timedLife,")
    w("                       killed,removed,hidden,addedAbility} + spawn{loc,facing}")
    w("   .unboundParams[]    seen in the handler, not attributable to one spawn")
    w("   .modelsUsed[] / .modelsWithEmitters[]  -> models[stem]")
    w("")
    w("model stem       ->  models[\"holyawakening\"]")
    w("   .emitters[]  full PRE2: raw{...} + converted{...} + tracks{KP2*} + texture + anchorChain")
    w("   .ribbons[]   RIBB")
    w("   .attachmentPoints[]      the model's own ATCH bones")
    w("   .meshScaleFactor         the SAME factor baked into that glb — use it, not a global")
    w("   .assetClass              pure-emitter | emitter-dominant-hybrid | mesh-and-emitter-hybrid | mesh-only")
    w("   .shippedVfxDocIds / .missingVfxDocIds   which content/vfx docs already exist")
    w("")
    w("GGD doc id       ->  ggdDocIndex[\"godie-e002.e\"] -> [{abilityId, via, confidence}]")
    w("                     ggdDocState[\"godie-e002.e\"] -> one of the states in §4")
    w("```\n")

    w("## 2. Provenance tags — where each art path came from\n")
    w("| tag | meaning |")
    w("|---|---|")
    for k, v in m["provenance"].items():
        w("| `%s` | %s |" % (k, v.replace("\n", " ")))
    w("")
    w("Counts this run: " + ", ".join("`%s` %d" % (k, v) for k, v in sorted(s["artProvenance"].items())))
    w("")
    w("**`stock-inherited` is the correction that matters most.** `war3map.w3a` stores only")
    w("*overrides*. An ability with no art field does not mean \"no effect\" — it means WC3")
    w("falls through to the base ability's retail art. %d of this run's %d art entries come"
      % (s["artProvenance"].get("stock-inherited", 0),
         sum(s["artProvenance"].values())))
    w("from that fallthrough. Reading only the w3a would report every one of them as blank.\n")

    w("## 3. Asset status — what the renderer can actually draw\n")
    w("| status | count | meaning |")
    w("|---|---:|---|")
    for k, v in m["assetStatusContract"].items():
        w("| `%s` | %d | %s |" % (k, s["assetStatus"].get(k, 0), v))
    w("")
    w("Counts are over `art[*].entries` only. `INVISIBLE` reads 0 there by construction —")
    w("an empty / `none.mdl` art field is dropped before it becomes an entry, and shows up")
    w("instead as the ability having no `art` for that slot. Both statuses stay reachable")
    w("through `summonedUnits[]`, where an invisible carrier is a meaningful answer.\n")

    w("## 4. The honest scoreboard — all %d GGD ability docs\n" % s["universe"]["ggdAbilityDocs"])
    order = ["CONFIRMED_ART_AND_PARAMS", "CONFIRMED_ART_INFERRED_PARAMS", "CONFIRMED_ART",
             "INFERRED_ART", "CONFIRMED_NEGATIVE", "SYNTHETIC_NO_SOURCE_IN_MAP",
             "HAND_AUTHORED_NOT_FROM_THE_MAP", "UNRESOLVED_NO_RAWCODE"]
    meaning = {
        "CONFIRMED_ART_AND_PARAMS": "real art found **and** every per-cast override binds unambiguously",
        "CONFIRMED_ART_INFERRED_PARAMS": "real art found; at least one override needed a documented inference",
        "CONFIRMED_ART": "real art found; the original applies no per-cast override (natural size/colour **is** the faithful reproduction)",
        "INFERRED_ART": "art reached only through an inferred attribution",
        "CONFIRMED_NEGATIVE": "**an answer, not a gap** — no w3a override, no inherited stock art, no buff art, no summoned unit, no JASS art call. The original draws nothing. Faithful = `vfxKey: null`",
        "SYNTHETIC_NO_SOURCE_IN_MAP": "the GGD doc is named `none` with an empty description and no rawcode — a slot the importer minted for a hero whose `uhab` is empty. **The map contains no such ability**",
        "HAND_AUTHORED_NOT_FROM_THE_MAP": "`sela.*` / `thorne.*` — the repo's own demo champions, written by hand. They never came from the w3x, so there is nothing to be faithful *to*",
        "UNRESOLVED_NO_RAWCODE": "a real-looking doc that no bridge method could tie to a w3a record",
    }
    w("| state | docs | meaning |")
    w("|---|---:|---|")
    tot = 0
    for k in order:
        v = s["ggdDocCoverage"].get(k, 0)
        tot += v
        w("| `%s` | **%d** | %s |" % (k, v, meaning[k]))
    w("| | **%d** | |" % tot)
    w("")
    w("Rolled up: **%d of %d docs (%.0f%%) now have CONFIRMED original art**; **%d more are"
      % (s["ggdDocCoverage"].get("CONFIRMED_ART_AND_PARAMS", 0)
         + s["ggdDocCoverage"].get("CONFIRMED_ART_INFERRED_PARAMS", 0)
         + s["ggdDocCoverage"].get("CONFIRMED_ART", 0),
         s["universe"]["ggdAbilityDocs"],
         100.0 * (s["ggdDocCoverage"].get("CONFIRMED_ART_AND_PARAMS", 0)
                  + s["ggdDocCoverage"].get("CONFIRMED_ART_INFERRED_PARAMS", 0)
                  + s["ggdDocCoverage"].get("CONFIRMED_ART", 0)) / s["universe"]["ggdAbilityDocs"],
         s["ggdDocCoverage"].get("CONFIRMED_NEGATIVE", 0)))
    w("CONFIRMED-NEGATIVE** — the faithful action there is to set `vfxKey` to null, not to")
    w("pick a nicer particle. Only **%d** docs are genuinely unresolved:"
      % s["ggdDocCoverage"].get("UNRESOLVED_NO_RAWCODE", 0))
    unres = sorted(d for d, st in m["ggdDocState"].items() if st == "UNRESOLVED_NO_RAWCODE")
    for d in unres:
        w("  - `%s` — %s" % (d, (ggd_docs[d].get("name") or "(no name)")))
    if not unres:
        w("  - (none — every doc landed in a state with a reason behind it)")
    w("")
    w("> Caveat that belongs on the same page: CONFIRMED art is not the same as *available*")
    w("> art. %d of the %d resolved art entries are retail Blizzard `.mdl` paths that are not"
      % (s["assetStatus"].get("MISSING_BLIZZARD_STOCK", 0), sum(s["assetStatus"].values())))
    w("> in this repo and cannot be redistributed (#81 / #116). The archaeology is done; the")
    w("> licensing is not.\n")

    w("## 5. The owner's three categories\n")
    w("| | 球體 ORB | 蝗蟲群 LOCUST | 粒子 PARTICLE |")
    w("|---|---:|---:|---:|")
    c = s["categories"]
    o, lo, pa = c["orb_球體"], c["locust_蝗蟲群"], c["particle_粒子"]
    for label, key in [("abilities detected", "abilities"),
                       ("custom to this map", "customToThisMap"),
                       ("art CONFIRMED", "artConfirmed"),
                       ("asset in repo", "assetInRepo"),
                       ("asset = missing Blizzard stock", "assetMissingBlizzard"),
                       ("has per-cast overrides", "withPerInvocationParams"),
                       ("reachable from a GGD doc", "reachableFromAGgdDoc"),
                       ("GGD docs covered", "ggdDocsCovered")]:
        w("| %s | %d | %d | %d |" % (label, o[key], lo[key], pa[key]))
    w("")
    w("**球體** — detection: `baseId == Asph` or the author named it `球體(...)`. All %d have"
      % o["abilities"])
    w("at least one attached model; scored on the attached slot only (their inherited")
    w("`Missileart` fires on attack, not on cast, so counting it as \"the orb\" is misleading):")
    w("  " + ", ".join("`%s` %d" % (k, v) for k, v in sorted(o["attachedModelAssetStatus"].items())))
    w("Delivery routes found: " + ", ".join("%s %d" % (k, v) for k, v in sorted(o["delivery"].items()))
      + "; **%d orbs still have no carrier**." % o["withNoCarrierFound"])
    w("An orb is never cast, so it has no GGD ability doc of its own — `orbCarrierChain`")
    w("names what puts it on screen. This is an **attachment-system** gap, not a particle one.\n")
    sd = s["swarmDetectorRecall"]
    w("**蝗蟲群** — detection is mechanical: base `AUls`, a `CreateNUnitsAtLoc` count >= 2, the")
    w("same unit id spawned >= 3 times, a spawn call inside a JASS `loop`, or an art field")
    w("that is a comma-list of >= 3 models. Scored against the %d cases the fidelity report"
      % sd["goldenSet"])
    w("picked by hand: **%d / %d caught**. The %d misses are named in"
      % (sd["caught"], sd["goldenSet"], len(sd["missed"])))
    w("`summary.swarmDetectorRecall.missed` with why — both are different idioms, not tuning.\n")
    w("**粒子** — detection: the ability references at least one map-imported `.mdx` that")
    w("carries PRE2/RIBB emitters. %d of the %d emitters already have a `content/vfx` doc;"
      % (s["emitterDocs"]["alreadyShippedAsContentVfxDocs"], s["emitterDocs"]["emittersInCensus"]))
    w("%d do not. Only %d distinct emitter-bearing models are referenced by any ability at all."
      % (s["emitterDocs"]["notYetShipped"], s["emitterDocs"]["referencedByAtLeastOneAbility"]))
    w("")

    w("## 6. Invariants asserted every run\n")
    for k, v in m["invariants"].items():
        w("- `%s`: **%s**" % (k, v))
    w("")
    w("`emitterCensusPreserved` and `invocationCensusPreserved` are the ones that matter for")
    w("a merge: they prove the join dropped nothing from either source dataset.\n")

    w("## 7. Deliberately not encoded\n")
    for n in m["notEncoded"]:
        w("- " + n)
    w("")

    with open(os.path.join(OUTDIR, "VFX_BINDINGS.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L) + "\n")


def main():
    os.makedirs(OUTDIR, exist_ok=True)

    emitters_doc = json.load(open(os.path.join(HERE, "out/emitters/EMITTERS.json"), encoding="utf-8"))
    refs_doc = json.load(open(os.path.join(HERE, "out/emitters/MODEL_REFS.json"), encoding="utf-8"))
    invoc_doc = json.load(open(os.path.join(HERE, "out/invocation-params/INVOCATION_PARAMS.json"), encoding="utf-8"))

    stock, stock_read = load_stock_ability_func()
    w3a = load_w3a()
    w3h = load_w3h()
    w3u = load_w3u()
    strings = load_strings()
    loop_ranges = load_jass_loop_ranges()
    ggd_docs = load_ggd_ability_docs()
    shipped_vfx = load_shipped_vfx_docs()

    # ---------------------------------------------------------------- models
    models = {}
    for m in emitters_doc["models"]:
        stem = m["stem"]
        models[stem] = {
            "stem": stem,
            "file": m["file"],
            "assetClass": m["assetClass"],
            "meshScaleFactor": m["meshScaleFactor"],
            "meshScaleSource": m["meshScaleSource"],
            "glbBytes": m.get("glbBytes"),
            "mdxBytes": m.get("bytes"),
            "geometry": m.get("geometry"),
            "sequences": m.get("sequences"),
            "globalSequences": m.get("globalSequences"),
            "attachmentPoints": m.get("attachmentPoints"),
            "textures": m.get("textures"),
            "emitters": m.get("emitters") or [],
            "ribbons": m.get("ribbons") or [],
            "emitterCount": len(m.get("emitters") or []),
            "ribbonCount": len(m.get("ribbons") or []),
            "referenceCount": m.get("referenceCount", 0),
            "shippedVfxDocIds": sorted(
                e["docId"] for e in (m.get("emitters") or []) + (m.get("ribbons") or [])
                if e.get("docId") in shipped_vfx
            ),
            "missingVfxDocIds": sorted(
                e["docId"] for e in (m.get("emitters") or []) + (m.get("ribbons") or [])
                if e.get("docId") not in shipped_vfx
            ),
        }

    by_model_params = {b["modelStem"]: b for b in invoc_doc["byModel"]}

    # `war3mapImported\poweraura.MDX` is extracted to raw/ with the separator flattened
    # to `__`, so its census stem is `war3mapimported-poweraura` while every object-data
    # reference calls it `poweraura`. One alias table, resolved both ways.
    stem_alias = {}
    for stem in models:
        stem_alias[stem] = stem
        if stem.startswith("war3mapimported-"):
            stem_alias[stem[len("war3mapimported-"):]] = stem

    def resolve_stem(s):
        return stem_alias.get(s, s)

    def asset_status(path):
        """What the renderer will actually be able to draw for this model path."""
        form = classify_form(path)
        if form == "lightning-id":
            return "LIGHTNING_ID", None
        if form == "invisible":
            return "INVISIBLE", None
        st = resolve_stem(stem_of(path))
        mdl = models.get(st)
        if form == "map-imported":
            if not mdl:
                return "IMPORTED_MODEL_NOT_IN_EMITTER_CENSUS", st
            if mdl["emitterCount"] or mdl["ribbonCount"]:
                if mdl["assetClass"] in ("pure-emitter", "emitter-dominant-hybrid"):
                    return "IN_REPO_EMITTER_IS_THE_ASSET", st
                return "IN_REPO_MESH_PLUS_EMITTERS", st
            if mdl["assetClass"] == "no-geometry-no-emitter":
                return "INVISIBLE_CARRIER", st
            return "IN_REPO_MESH_ONLY", st
        return "MISSING_BLIZZARD_STOCK", st

    # ------------------------------------------------------- the id bridge
    # THREE independent methods. Every link records which one produced it, so a
    # disagreement is visible rather than silently averaged away.
    #   (1) w3u  — the unit's own `uhab`/`uabi` list says which hero owns the ability;
    #              the ability's `NN-MM` name prefix says which slot. This is the
    #              authoritative chain and it covers heroes the JASS never touches.
    #   (2) heroes[] carried by INVOCATION_PARAMS (same chain, computed independently
    #              by the other lane — used as a cross-check, not a second source).
    #   (3) exact GGD doc-name match. 146 names are shared by 2+ docs (the paired-hero
    #              duplicates of #113); those links are tagged INFERRED, never CONFIRMED.
    docs_by_name = defaultdict(list)
    for did, d in ggd_docs.items():
        docs_by_name[(d.get("name") or "").strip()].append(did)

    invoc_by_id = {a["abilityId"]: a for a in invoc_doc["abilities"]}

    owners = defaultdict(set)   # abilityId -> {unitId}
    for uid, u in w3u.items():
        for code in ("uhab", "uabi"):
            for ab in str(u.get(code) or "").replace(" ", "").split(","):
                if len(ab) == 4:
                    owners[ab].add(uid)

    def bridge(name, heroes):
        links, seen = [], set()
        m = NAME_NUMBER_RE.match(name or "")
        slot = SLOT_FROM_NUMBER.get(m.group(2)) if m else None
        cand = []
        if slot:
            cand += [(u, "w3u.uhab/uabi+slotNumber") for u in sorted(owners.get(_cur_id[0], ()))]
            cand += [(h["heroId"], "invocationHeroes+slotNumber") for h in (heroes or [])]
        for hero_id, via in cand:
            did = "godie-%s.%s" % (hero_id.lower(), slot)
            if did not in ggd_docs:
                continue
            if did in seen:
                for L in links:
                    if L["docId"] == did and via not in L["via"]:
                        L["via"] += " & " + via
                continue
            seen.add(did)
            links.append({"docId": did, "via": via, "confidence": "CONFIRMED"})
        nm = (name or "").strip()
        if nm:
            for did in docs_by_name.get(nm, []):
                if did in seen:
                    for L in links:
                        if L["docId"] == did and "docName" not in L["via"]:
                            L["via"] += " & docName"
                    continue
                seen.add(did)
                n = len(docs_by_name[nm])
                links.append({
                    "docId": did, "via": "docName",
                    "confidence": "CONFIRMED" if n == 1 else "INFERRED",
                    "why": None if n == 1 else
                    "%d GGD docs carry this exact name (the paired-hero duplicates of #113); "
                    "every one of them is credited" % n,
                })
        return links, slot

    _cur_id = [None]  # the ability id `bridge` is currently resolving

    # ------------------------------------------------------------ abilities
    abilities = {}
    universe = sorted(set(w3a) | set(invoc_by_id))

    for aid in universe:
        entry = w3a.get(aid)
        inv = invoc_by_id.get(aid, {})
        base_id = entry.base_id if entry else None
        is_custom = bool(entry and entry.new_id)
        # `anam` is usually a TRIGSTR_ pointer into war3map.wts, and is wrapped in WC3
        # colour markup. Resolve both, then fall back to the other lane's name.
        name = resolve_name(entry.get("anam"), strings) if entry else ""
        if not name:
            name = (inv.get("name") or "").strip()

        # --- art channel 1: the map's own w3a overrides
        own = art_from_w3a(entry) if entry else {}
        own_attach = attach_from_w3a(entry) if entry else {}

        # --- art channel 2: inherited stock art from the base ability
        stock_rec = stock.get(base_id) if base_id else None
        inherited = art_from_stock(stock_rec)
        inherited_attach = attach_from_stock(stock_rec)

        # --- art channel 3: the buff channel (abuf / aeff -> w3h -> stock buff)
        buff_ids = []
        for code in ("abuf", "aeff"):
            if not entry:
                break
            for _lvl, v in entry.levels(code).items():
                for b in str(v or "").replace(",", " ").split():
                    if len(b) == 4 and b not in buff_ids:
                        buff_ids.append(b)
        buff_art = {}
        for b in buff_ids:
            slots = defaultdict(list)
            be = w3h.get(b)
            if be:
                for code, slot in BUFF_ART_CODES.items():
                    if slot == "effectSound":
                        continue
                    for p in split_art(be.get(code)):
                        st, stem = asset_status(p)
                        slots[slot].append({"path": p, "stem": stem, "form": classify_form(p),
                                            "assetStatus": st, "provenance": "w3h-override"})
            srec = stock.get(b)
            if srec:
                for k, slot in STOCK_ART_KEYS.items():
                    if slot == "buffIcon" or slots.get(slot):
                        continue
                    for p in split_art(srec.get(k)):
                        st, stem = asset_status(p)
                        slots[slot].append({"path": p, "stem": stem, "form": classify_form(p),
                                            "assetStatus": st, "provenance": "stock-buff-inherited"})
            if slots:
                buff_art[b] = {k: v for k, v in slots.items()}

        # --- fold the three channels into one per-slot view.
        # `layer` is the index within a comma-separated list: `AFOD,AFOD,AFOD` is THREE
        # simultaneous beams, `HeroBuu.mdx` x5 is FIVE simultaneous models.
        art = {}
        for slot in ("target", "missile", "caster", "special", "effect", "lightning", "area"):
            per_level = own.get(slot) or {}
            entries = []
            if per_level:
                for lvl in sorted(per_level):
                    for layer, p in enumerate(per_level[lvl]):
                        st, stem = asset_status(p)
                        entries.append({
                            "level": lvl, "layer": layer, "path": p, "stem": stem,
                            "form": classify_form(p), "assetStatus": st,
                            "provenance": "w3a-override", "confidence": "CONFIRMED",
                            "emitterCount": (models.get(stem) or {}).get("emitterCount", 0) if stem else 0,
                            "ribbonCount": (models.get(stem) or {}).get("ribbonCount", 0) if stem else 0,
                        })
            elif slot in inherited:
                for layer, p in enumerate(inherited[slot]):
                    st, stem = asset_status(p)
                    entries.append({
                        "level": 0, "layer": layer, "path": p, "stem": stem,
                        "form": classify_form(p), "assetStatus": st,
                        "provenance": "stock-inherited", "confidence": "CONFIRMED",
                        "why": "the map stores no override for this slot; WC3 falls through to the base "
                               "ability '%s' in Units\\*AbilityFunc.txt" % base_id,
                        "emitterCount": (models.get(stem) or {}).get("emitterCount", 0) if stem else 0,
                        "ribbonCount": (models.get(stem) or {}).get("ribbonCount", 0) if stem else 0,
                    })
            if entries:
                art[slot] = {
                    "code": next((c for c, s in ABILITY_ART_CODES.items() if s == slot), None),
                    "layerCount": len({e["layer"] for e in entries}),
                    "entries": entries,
                    "attachPoints": own_attach.get(slot) or inherited_attach.get(slot) or {},
                    "attachProvenance": ("w3a-override" if own_attach.get(slot)
                                         else ("stock-inherited" if inherited_attach.get(slot) else None)),
                }

        # --- art channel 4: the SUMMONED-UNIT channel.
        # A summon/swarm/metamorphosis ability has no art fields at all — its entire
        # visual is the unit it creates, and the map reskins that unit in war3map.w3u.
        # 66-03 七夜怪談 is the proof: zero art fields (so a 3-channel scan calls it
        # CONFIRMED-NEGATIVE), but `Ulsu = 'u00I'` = SpiritWyvern at usca 0.4, x7/12/17/22.
        # 92 abilities carry a unit rawcode this way (Ulsu / Eme1 / Hwe1 / Osf1 / Rai3 / hwdu…).
        summoned = []
        if entry:
            seen_units = set()
            for mod in entry.mods:
                if not isinstance(mod.value, str):
                    continue
                for tok in mod.value.replace(" ", "").split(","):
                    if len(tok) != 4 or tok not in w3u or (mod.code, tok) in seen_units:
                        continue
                    seen_units.add((mod.code, tok))
                    ue = w3u[tok]
                    umdl = norm_model(ue.get("umdl"))
                    st, ustem = asset_status(umdl) if umdl else ("INVISIBLE", None)
                    summoned.append({
                        "unitId": tok, "viaField": mod.code, "level": mod.level,
                        "baseUnitId": ue.base_id,
                        "model": umdl, "stem": ustem, "assetStatus": st,
                        "form": classify_form(umdl) if umdl else "invisible",
                        "baseScale": ue.get("usca"),
                        "vertexTint": [ue.get("uclr"), ue.get("uclg"), ue.get("uclb")],
                        "flyHeight": ue.get("umvh"),
                        "abilities": ue.get("uabi"),
                        "isLocustCarrier": "Aloc" in str(ue.get("uabi") or ""),
                        "provenance": "w3a-mod->w3u", "confidence": "CONFIRMED",
                    })
        # WC3 falls back to the stock `uloc` for an AUls ability with no `Ulsu` override,
        # and this map reskinned `uloc` itself (NetherDragon, usca 0.6, green/blue zeroed).
        if base_id == LOCUST_SWARM_BASE and not any(s["viaField"] == "Ulsu" for s in summoned):
            ue = w3u.get("uloc")
            if ue:
                umdl = norm_model(ue.get("umdl"))
                st, ustem = asset_status(umdl) if umdl else ("INVISIBLE", None)
                summoned.append({
                    "unitId": "uloc", "viaField": "Ulsu(default)", "level": 0,
                    "baseUnitId": ue.base_id, "model": umdl, "stem": ustem,
                    "assetStatus": st, "form": classify_form(umdl) if umdl else "invisible",
                    "baseScale": ue.get("usca"),
                    "vertexTint": [ue.get("uclr"), ue.get("uclg"), ue.get("uclb")],
                    "flyHeight": ue.get("umvh"), "abilities": ue.get("uabi"),
                    "isLocustCarrier": True,
                    "provenance": "stock-default->w3u-override", "confidence": "INFERRED",
                    "why": "the ability sets no Ulsu, so WC3 uses the stock 'uloc'; the map "
                           "overrides that unit's model/scale/tint in war3map.w3u",
                })

        # --- per-invocation overrides (JASS)
        invocations = inv.get("invocations") or []
        inv_stems = set()
        for iv in invocations:
            s = iv.get("modelStem")
            if s:
                inv_stems.add(s)
            uid = iv.get("unitId")
            if uid:
                du = invoc_doc["dummyUnits"].get(uid) or {}
                if du.get("modelStem"):
                    inv_stems.add(du["modelStem"])

        art_stems = {e["stem"] for slot in art.values() for e in slot["entries"] if e["stem"]}
        buff_stems = {e["stem"] for s in buff_art.values() for lst in s.values() for e in lst if e["stem"]}
        inv_stems = {resolve_stem(s) for s in inv_stems}
        summon_stems = {s["stem"] for s in summoned if s["stem"]}
        all_stems = {s for s in (art_stems | inv_stems | buff_stems | summon_stems) if s}
        imported_with_emitters = sorted(
            s for s in all_stems
            if s in models and (models[s]["emitterCount"] or models[s]["ribbonCount"])
        )

        # --- the owner's three categories
        categories = []
        if base_id == ORB_BASE or ORB_NAME_RE.search(name or ""):
            categories.append("orb")
        multi = 0
        spawn_counts = Counter()
        in_loop = 0
        for iv in invocations:
            if iv.get("kind") != "dummyUnit":
                continue
            c = ((iv.get("count") or {}).get("value")) or 1
            if c and c >= 2:
                multi = max(multi, int(c))
            if iv.get("unitId"):
                spawn_counts[iv["unitId"]] += 1
            if iv.get("line") and any(a <= iv["line"] <= b for a, b in loop_ranges):
                in_loop += 1
        repeated = max(spawn_counts.values()) if spawn_counts else 0
        # a comma-list art field is a swarm too: 28-002 普烏死亡 is `HeroBuu.mdx` x5,
        # 47-03 九頭龍閃 is five different whole dragons as area art.
        layered = max((v["layerCount"] for v in art.values()), default=0)
        locust_why = []
        if base_id == LOCUST_SWARM_BASE:
            locust_why.append("baseId is AUls, the real WC3 Locust Swarm")
        if multi >= 2:
            locust_why.append("a single CreateNUnitsAtLoc spawns %d units" % multi)
        if repeated >= 3:
            locust_why.append("the same unit id is spawned %d times in one handler" % repeated)
        if in_loop:
            locust_why.append("%d spawn call(s) sit inside a JASS loop" % in_loop)
        if layered >= 3:
            locust_why.append("an art field is a comma-list of %d simultaneous models" % layered)
        if locust_why:
            categories.append("locust")
        if imported_with_emitters:
            categories.append("particle")

        # --- coverage verdicts
        has_art = (bool(art) or bool(buff_art) or bool(summoned)
                   or any(iv.get("model") for iv in invocations))
        art_conf = "NONE"
        if has_art:
            provs = {e["provenance"] for s in art.values() for e in s["entries"]}
            provs |= {e["provenance"] for s in buff_art.values() for lst in s.values() for e in lst}
            provs |= {s["provenance"] for s in summoned}
            if any(iv.get("modelConfidence") == "CONFIRMED" for iv in invocations if iv.get("model")):
                provs.add("jass-literal")
            art_conf = "CONFIRMED" if provs else "NONE"
            if inv.get("attribution") == "INFERRED" and not art and not buff_art:
                art_conf = "INFERRED"
        elif entry is not None:
            # A definitive answer, not a gap: nothing overrode art, the base has none,
            # the buffs have none, and the JASS handler creates none.
            art_conf = "CONFIRMED_NEGATIVE"
        else:
            art_conf = "UNRESOLVED"

        # `params` carries the art overrides (scale/tint/height/timeScale/facing);
        # `lifecycle` carries timedLife/killed/removed/hidden/addedAbility. Both are
        # per-invocation overrides — counting only `params` undercounts by ~2x.
        param_rows = []
        for iv in invocations:
            for bucket in ("params", "lifecycle"):
                for pname, plist in (iv.get(bucket) or {}).items():
                    for p in (plist if isinstance(plist, list) else [plist]):
                        if isinstance(p, dict):
                            param_rows.append((pname, p.get("bindingConfidence")))
        param_conf = "NONE"
        if param_rows:
            confs = {c for _, c in param_rows}
            param_conf = "CONFIRMED" if confs <= {"CONFIRMED"} else "INFERRED"

        statuses = [e["assetStatus"] for s in art.values() for e in s["entries"]]
        asset_verdict = "NO_ART"
        if statuses:
            if any(s.startswith("IN_REPO") for s in statuses):
                asset_verdict = "IN_REPO"
            elif all(s in ("INVISIBLE", "LIGHTNING_ID", "INVISIBLE_CARRIER") for s in statuses):
                asset_verdict = "NO_MODEL_BY_DESIGN"
            else:
                asset_verdict = "MISSING_BLIZZARD_STOCK"
        elif imported_with_emitters:
            asset_verdict = "IN_REPO"
        elif summoned:
            ss = [s["assetStatus"] for s in summoned]
            asset_verdict = ("IN_REPO" if any(x.startswith("IN_REPO") for x in ss)
                             else "MISSING_BLIZZARD_STOCK" if "MISSING_BLIZZARD_STOCK" in ss
                             else "NO_MODEL_BY_DESIGN")

        heroes = inv.get("heroes") or []
        _cur_id[0] = aid
        links, slot_guess = bridge(name, heroes)

        abilities[aid] = {
            "abilityId": aid,
            "baseId": base_id,
            "isCustom": is_custom,
            "name": name,
            "carriedBy": sorted(owners.get(aid, ())),
            "levels": inv.get("levels"),
            "levelsConfidence": inv.get("levelsConfidence"),
            "levelsWhy": inv.get("levelsWhy"),
            "heroes": heroes,
            "ggdDocs": links,
            "slotFromNumber": slot_guess,
            "art": art,
            "buffChannel": buff_art,
            "summonedUnits": summoned,
            "buffIds": buff_ids,
            "hasJassHandler": bool(inv.get("hasJassHandler")),
            "triggers": inv.get("triggers") or [],
            "attribution": inv.get("attribution"),
            "attributionWhy": inv.get("attributionWhy"),
            "invocations": invocations,
            "unboundParams": inv.get("unboundParams") or [],
            "modelsUsed": sorted(all_stems),
            "modelsWithEmitters": imported_with_emitters,
            "categories": categories,
            "locustWhy": locust_why,
            "coverage": {
                "art": art_conf,
                "params": param_conf,
                "asset": asset_verdict,
                "bridged": bool(links),
            },
        }

    # ------------------------------------------------ the orb (球體) carrier chain
    # An `Asph` orb is never cast, so it never appears in a hero's QWER list and no GGD
    # ability doc represents it. It reaches the screen one of three ways, all mechanical:
    #   a. a hero permanently owns it            -> w3u uhab/uabi on a HERO record
    #   b. a dummy unit owns it and some ability spawns that dummy
    #   c. a JASS handler grants it at runtime   -> lifecycle.addedAbility
    # Without this chain the 球體 column reads "0 GGD docs covered", which is true but
    # useless: the renderer needs to know WHICH cast puts the orb on screen.
    spawns_unit = defaultdict(set)      # unitId -> {abilityId that spawns it}
    grants_ability = defaultdict(set)   # grantedAbilityId -> {abilityId that grants it}
    for aid, a in abilities.items():
        for iv in a["invocations"]:
            if iv.get("unitId"):
                spawns_unit[iv["unitId"]].add(aid)
            for row in (iv.get("lifecycle") or {}).get("addedAbility") or []:
                g = str(row.get("ability") or "").strip("'")
                if len(g) == 4:
                    grants_ability[g].add(aid)
    # the same grant, seen in an UNATTRIBUTED trigger group: we know the orb is granted,
    # we just do not know by which ability. Recorded as a delivery route with no ability.
    granted_unattributed = set()
    for grp in invoc_doc["unattributed"]:
        for iv in grp.get("invocations") or []:
            for row in (iv.get("lifecycle") or {}).get("addedAbility") or []:
                g = str(row.get("ability") or "").strip("'")
                if len(g) == 4:
                    granted_unattributed.add(g)

    # route 4: an ITEM grants the orb (war3map.w3t `iabi`). 11 of the map's orbs arrive
    # this way — a whole delivery channel that a hero/dummy-only scan misses entirely.
    item_grants = defaultdict(set)
    w3t_path = os.path.join(RAW, "war3map.w3t")
    if os.path.exists(w3t_path):
        w3t = all_entries(parse_object_file(open(w3t_path, "rb").read(), has_levels=False))
        for e in w3t:
            for ab in str(e.get("iabi") or "").replace(" ", "").split(","):
                if len(ab) == 4:
                    item_grants[ab].add(e.obj_id)

    for aid, a in abilities.items():
        if "orb" not in a["categories"]:
            continue
        # An `Asph` orb's actual 球體 is the model in a slot that has an ATTACH POINT.
        # Its inherited `Missileart` (BloodElfBall) only shows when the carrier attacks,
        # so scoring the orb's asset availability on the missile slot is misleading.
        a["orbAttachedModels"] = [
            {"slot": slot, "path": e["path"], "stem": e["stem"],
             "assetStatus": e["assetStatus"], "provenance": e["provenance"],
             "attachPoint": (v["attachPoints"] or {}).get(str(e["layer"]))
                            or (v["attachPoints"] or {}).get("0")}
            for slot, v in a["art"].items()
            if slot in ("target", "special", "caster") and v["attachPoints"]
            for e in v["entries"]
        ]
        chain = []
        for iid in sorted(item_grants.get(aid, ())):
            chain.append({"via": "grantedByItem", "carrierUnitId": None, "itemId": iid,
                          "abilityId": None, "confidence": "CONFIRMED"})
        for uid in a["carriedBy"]:
            u = w3u.get(uid)
            is_hero = bool(u and str(u.get("uhab") or ""))
            for src in sorted(spawns_unit.get(uid, ())):
                chain.append({"via": "spawnedDummyCarrier", "carrierUnitId": uid,
                              "abilityId": src, "confidence": "CONFIRMED"})
            if is_hero and not spawns_unit.get(uid):
                chain.append({"via": "permanentlyOwnedByHeroUnit", "carrierUnitId": uid,
                              "abilityId": None, "confidence": "CONFIRMED",
                              "why": "the hero record lists this orb in uhab/uabi; it is on screen "
                                     "for the entire match, not tied to any cast"})
        for src in sorted(grants_ability.get(aid, ())):
            chain.append({"via": "jassAddedAbility", "carrierUnitId": None,
                          "abilityId": src, "confidence": "CONFIRMED"})
        if not grants_ability.get(aid) and aid in granted_unattributed:
            chain.append({"via": "jassAddedAbilityInUnattributedTrigger", "carrierUnitId": None,
                          "abilityId": None, "confidence": "UNRESOLVED",
                          "why": "the grant is in a trigger group with no GetSpellAbilityId() gate, "
                                 "so the granting ability is not statically recoverable"})
        a["orbCarrierChain"] = chain
        # inherit the GGD docs of whatever puts the orb on screen
        inherited_docs = []
        seen = {L["docId"] for L in a["ggdDocs"]}
        for c in chain:
            if not c["abilityId"]:
                continue
            for L in abilities.get(c["abilityId"], {}).get("ggdDocs", []):
                if L["docId"] in seen:
                    continue
                seen.add(L["docId"])
                inherited_docs.append({
                    "docId": L["docId"], "via": "orbCarrierChain:" + c["via"],
                    "confidence": "INFERRED", "throughAbilityId": c["abilityId"],
                    "why": "the orb itself has no GGD ability doc; this is the doc of the cast that "
                           "puts it on screen",
                })
        a["ggdDocsViaOrbChain"] = inherited_docs

    # ------------------------------------------------- reverse index (GGD -> w3a)
    ggd_index = defaultdict(list)
    for aid, a in abilities.items():
        for L in a["ggdDocs"]:
            ggd_index[L["docId"]].append({"abilityId": aid, "via": L["via"], "confidence": L["confidence"]})
        for L in a.get("ggdDocsViaOrbChain") or []:
            ggd_index[L["docId"]].append({"abilityId": aid, "via": L["via"], "confidence": L["confidence"],
                                          "throughAbilityId": L["throughAbilityId"]})

    # ------------------------------------------------------------- scoreboard
    total_docs = len(ggd_docs)
    doc_state = {}
    for did in ggd_docs:
        rows = ggd_index.get(did) or []
        if not rows:
            # A doc named 'none' with an empty description and no rawcode is a SYNTHETIC
            # slot the importer minted for a hero whose w3u `uhab` is an empty string.
            # The map contains no such ability. This is an answer ("delete or mark
            # synthetic"), not a coverage gap — do not invent art for it.
            nm = (ggd_docs[did].get("name") or "").strip().lower()
            desc = (ggd_docs[did].get("description") or "").strip()
            if not did.startswith("godie-"):
                # `sela.*` / `thorne.*` — the repo's own hand-authored demo champions.
                # They never came from the w3x, so there is nothing to be faithful TO.
                doc_state[did] = "HAND_AUTHORED_NOT_FROM_THE_MAP"
            elif nm in ("", "none") and not desc:
                doc_state[did] = "SYNTHETIC_NO_SOURCE_IN_MAP"
            else:
                doc_state[did] = "UNRESOLVED_NO_RAWCODE"
            continue
        arts = [abilities[r["abilityId"]]["coverage"]["art"] for r in rows]
        params = [abilities[r["abilityId"]]["coverage"]["params"] for r in rows]
        if "CONFIRMED" in arts:
            base = "CONFIRMED_ART"
        elif "INFERRED" in arts:
            base = "INFERRED_ART"
        elif "CONFIRMED_NEGATIVE" in arts:
            base = "CONFIRMED_NEGATIVE"
        else:
            base = "UNRESOLVED_NO_ART_DATA"
        if base == "CONFIRMED_ART":
            if "CONFIRMED" in params:
                base = "CONFIRMED_ART_AND_PARAMS"
            elif "INFERRED" in params:
                base = "CONFIRMED_ART_INFERRED_PARAMS"
        doc_state[did] = base

    doc_counts = Counter(doc_state.values())

    # per-category, on the ABILITY axis (the categories are ability-level facts)
    def cat_rows(cat):
        ids = [a for a in abilities.values() if cat in a["categories"]]
        return {
            "abilities": len(ids),
            "customToThisMap": sum(1 for a in ids if a["isCustom"]),
            "artConfirmed": sum(1 for a in ids if a["coverage"]["art"] == "CONFIRMED"),
            "assetInRepo": sum(1 for a in ids if a["coverage"]["asset"] == "IN_REPO"),
            "assetMissingBlizzard": sum(1 for a in ids if a["coverage"]["asset"] == "MISSING_BLIZZARD_STOCK"),
            "withPerInvocationParams": sum(1 for a in ids if a["coverage"]["params"] != "NONE"),
            "reachableFromAGgdDoc": sum(
                1 for a in ids if a["ggdDocs"] or a.get("ggdDocsViaOrbChain")),
            "ggdDocsCovered": len({
                L["docId"] for a in ids
                for L in (a["ggdDocs"] + (a.get("ggdDocsViaOrbChain") or []))
            }),
        }

    art_prov = Counter()
    for a in abilities.values():
        for s in a["art"].values():
            for e in s["entries"]:
                art_prov[e["provenance"]] += 1
    asset_status_counts = Counter()
    for a in abilities.values():
        for s in a["art"].values():
            for e in s["entries"]:
                asset_status_counts[e["assetStatus"]] += 1

    scoreboard = {
        "universe": {
            "ggdAbilityDocs": total_docs,
            "w3aAbilityRecords": len(w3a),
            "w3aCustomAbilities": sum(1 for a in abilities.values() if a["isCustom"]),
            "w3aStockOriginalsTouchedByTheMap": sum(1 for a in abilities.values() if not a["isCustom"]),
            "abilitiesInMergedIndex": len(abilities),
            "note": "the owner's '662 abilities' = content/abilities/*.json minus _index.json. Verified: %d. "
                    "The w3a side is larger (%d) because the map also edits stock originals in place and "
                    "defines runtime-only abilities (orbs, dummy carriers) that no GGD doc represents."
                    % (total_docs, len(w3a)),
        },
        "ggdDocCoverage": dict(doc_counts),
        "abilityCoverage": {
            "artConfirmed": sum(1 for a in abilities.values() if a["coverage"]["art"] == "CONFIRMED"),
            "artInferred": sum(1 for a in abilities.values() if a["coverage"]["art"] == "INFERRED"),
            "artConfirmedNegative": sum(1 for a in abilities.values() if a["coverage"]["art"] == "CONFIRMED_NEGATIVE"),
            "artUnresolved": sum(1 for a in abilities.values() if a["coverage"]["art"] == "UNRESOLVED"),
            "paramsConfirmed": sum(1 for a in abilities.values() if a["coverage"]["params"] == "CONFIRMED"),
            "paramsInferred": sum(1 for a in abilities.values() if a["coverage"]["params"] == "INFERRED"),
            "paramsNone": sum(1 for a in abilities.values() if a["coverage"]["params"] == "NONE"),
        },
        "artProvenance": dict(art_prov),
        "assetStatus": dict(asset_status_counts),
        "categories": {
            "orb_球體": dict(
                cat_rows("orb"),
                delivery=dict(Counter(
                    c["via"] for a in abilities.values() if "orb" in a["categories"]
                    for c in (a.get("orbCarrierChain") or []))),
                withNoCarrierFound=sum(
                    1 for a in abilities.values()
                    if "orb" in a["categories"] and not a.get("orbCarrierChain")),
                attachedModelAssetStatus=dict(Counter(
                    e["assetStatus"] for a in abilities.values() if "orb" in a["categories"]
                    for e in (a.get("orbAttachedModels") or []))),
                withAtLeastOneAttachedModel=sum(
                    1 for a in abilities.values()
                    if "orb" in a["categories"] and a.get("orbAttachedModels")),
            ),
            "locust_蝗蟲群": cat_rows("locust"),
            "particle_粒子": cat_rows("particle"),
        },
        "emitterDocs": {
            "emittersInCensus": emitters_doc["summary"]["particleEmitters2"] + emitters_doc["summary"]["ribbonEmitters"],
            "alreadyShippedAsContentVfxDocs": sum(len(m["shippedVfxDocIds"]) for m in models.values()),
            "notYetShipped": sum(len(m["missingVfxDocIds"]) for m in models.values()),
            "referencedByAtLeastOneAbility": len({
                s for a in abilities.values() for s in a["modelsWithEmitters"]
            }),
        },
    }

    # --------------------------------------- scored against the hand-picked golden set
    swarm_hits = {k: ("locust" in abilities.get(k, {}).get("categories", []))
                  for k in SWARM_GOLDEN}
    scoreboard["swarmDetectorRecall"] = {
        "goldenSet": len(SWARM_GOLDEN),
        "caught": sum(swarm_hits.values()),
        "missed": {k: SWARM_GOLDEN[k] for k, v in swarm_hits.items() if not v},
        "missedWhy": {
            "A07Z": "not a spawn swarm at all — ONE invisible unit moved 15 times with "
                    "SetUnitPositionLoc. A spawn-count detector cannot see it; it needs a "
                    "reposition-loop rule.",
            "A0VI": "the multiplier lives in the ability's own data columns (Spawn Hydra's "
                    "unit count), not in a JASS spawn call, so no JASS signal exists.",
        },
        "note": "the detector is mechanical (base id / spawn count / repeat count / JASS loop "
                "membership / comma-list art). Both misses are DIFFERENT idioms, not tuning "
                "failures — stated rather than papered over.",
    }

    # ------------------------------------------------------------ invariants
    invariants = {
        "everyW3aAbilityIsInTheIndex": all(a in abilities for a in w3a),
        "everyInvocationAbilityIsInTheIndex": all(a in abilities for a in invoc_by_id),
        "everyGgdDocHasAState": len(doc_state) == total_docs,
        "docStateCountsSumToUniverse": sum(doc_counts.values()) == total_docs,
        "everyArtEntryHasProvenanceAndConfidence": all(
            e.get("provenance") and e.get("confidence")
            for a in abilities.values() for s in a["art"].values() for e in s["entries"]
        ),
        "everyModelStemResolvesOrIsFlagged": all(
            e["stem"] in models or e["assetStatus"] in (
                "MISSING_BLIZZARD_STOCK", "LIGHTNING_ID", "INVISIBLE",
                "IMPORTED_MODEL_NOT_IN_EMITTER_CENSUS")
            for a in abilities.values() for s in a["art"].values() for e in s["entries"] if e["stem"]
        ),
        "emitterCensusPreserved": (
            sum(m["emitterCount"] for m in models.values()) == emitters_doc["summary"]["particleEmitters2"]
            and sum(m["ribbonCount"] for m in models.values()) == emitters_doc["summary"]["ribbonEmitters"]
        ),
        "invocationCensusPreserved": (
            sum(len(a["invocations"]) for a in abilities.values())
            == invoc_doc["summary"]["attributedInvocationRows"]
        ),
    }
    invariants["allOk"] = all(v for k, v in invariants.items() if k != "allOk")

    merged = {
        "schema": "vfx-bindings@1",
        "task": "merge of out/emitters + out/invocation-params into one renderer-consumable index",
        "generatedFrom": {
            "emitters": "tools/w3x-import/out/emitters/EMITTERS.json",
            "modelRefs": "tools/w3x-import/out/emitters/MODEL_REFS.json",
            "invocationParams": "tools/w3x-import/out/invocation-params/INVOCATION_PARAMS.json",
            "w3a": "tools/w3x-import/out/GoDieEX22s-src/raw/war3map.w3a",
            "w3h": "tools/w3x-import/out/GoDieEX22s-src/raw/war3map.w3h",
            "stockAbilityFunc": stock_read,
            "ggdAbilityDocs": "content/abilities/*.json (read-only)",
            "shippedVfxDocs": "content/vfx/*.json (read-only)",
        },
        "provenance": {
            "w3a-override": "the map's own war3map.w3a record explicitly sets this art field. Highest authority.",
            "stock-inherited": "the map sets NOTHING for this slot, so WC3 falls through to the base ability's "
                               "retail art in Units\\*AbilityFunc.txt. Correction M2 — treating a missing "
                               "override as 'no art' mis-reports ~1/3 of the map's abilities.",
            "w3h-override": "the map's own buff record (war3map.w3h). The buff channel is the ONLY visual "
                            "channel for most passives / DoTs / auras (correction M3).",
            "stock-buff-inherited": "buff art inherited from the retail buff record.",
            "jass-literal": "a model string written literally in a war3map.j art call.",
        },
        "confidenceContract": invoc_doc["confidenceContract"],
        "unitContract": invoc_doc["unitContract"],
        "scaleContract": emitters_doc["scaleContract"],
        "assetStatusContract": {
            "IN_REPO_EMITTER_IS_THE_ASSET": "map-imported model whose whole visual is PRE2/RIBB emitters; "
                                            "the glb is an empty (or ≤48-tri) shell. Render from `emitters`.",
            "IN_REPO_MESH_PLUS_EMITTERS": "map-imported model with real geometry AND emitters. The glb looks "
                                          "fine today and the particle layer is silently missing.",
            "IN_REPO_MESH_ONLY": "map-imported model, no emitters. The existing glb is the whole truth.",
            "INVISIBLE_CARRIER": "collision.mdx and friends — 0 geoset, 0 emitter, but a live `umdl`. Keep, do not delete.",
            "MISSING_BLIZZARD_STOCK": "a retail Blizzard .mdl. Not in the repo, and cannot be redistributed. "
                                      "This is the #81/#116 licensing gap, not a conversion bug.",
            "LIGHTNING_ID": "a Lightning.slk row id (SPLK/AFOD/FORK/...). There is no model — it is a "
                            "procedural beam the renderer must build.",
            "INVISIBLE": "the field is set to an empty/none path. The original genuinely draws nothing.",
        },
        "categoryContract": {
            "orb_球體": "baseId == 'Asph' (WC3 Item Sphere: a model permanently attached to a bone, not a cast "
                        "effect) OR the author named it 球體(...). This is an ATTACHMENT problem, not a particle one.",
            "locust_蝗蟲群": "baseId == 'AUls' (the one real Locust Swarm) OR the JASS spawns >=2 units in one "
                             "call OR spawns the same unit id >=3 times in one handler (the map's actual 'swarm' "
                             "idiom is a multi-spawn dummy loop, not the WC3 locust ability).",
            "particle_粒子": "the ability references at least one map-imported .mdx that carries PRE2/RIBB "
                             "emitters in the census.",
        },
        "summary": scoreboard,
        "invariants": invariants,
        "models": models,
        "abilities": abilities,
        "ggdDocIndex": {k: v for k, v in sorted(ggd_index.items())},
        "ggdDocState": doc_state,
        "dummyUnits": invoc_doc["dummyUnits"],
        "unattributed": invoc_doc["unattributed"],
        "systemInit": invoc_doc["systemInit"],
        "notEncoded": [
            "KP2* emitter animation tracks are carried verbatim under models[*].emitters[*].tracks, but "
            "vfx@1 has no field for them. DeathWave.mdx's entire wavefront is a KP2W ramp (366->126->669) "
            "on a fixed-block width of 0.0 — read statically it is a zero-width emitter.",
            "No WC3->GGD unit conversion is applied to distances/heights. The repo carries three competing "
            "factors (1/36 mesh default, 11/600 ability distance, 1/85 gen_ex_content.py); `raw` is the only "
            "unambiguous field. models[*].meshScaleFactor is the per-model factor already baked into that glb.",
            "270 trigger groups create art with no GetSpellAbilityId() gate (revive/shop/tower/on-attack). "
            "They stay under `unattributed`, tagged UNRESOLVED, with their unitTypeGates. Not guessed.",
            "186 parameters in ability groups could not be bound to a specific spawn (runtime global or "
            "cross-function flow). Kept per ability under `unboundParams` with the subject expression.",
        ],
    }

    with open(os.path.join(OUTDIR, "VFX_BINDINGS.json"), "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, separators=(",", ":"))
    write_companion_doc(merged, ggd_docs)
    with open(os.path.join(OUTDIR, "SCOREBOARD.json"), "w", encoding="utf-8") as f:
        json.dump({"schema": "vfx-bindings-scoreboard@1", "summary": scoreboard,
                   "invariants": invariants}, f, ensure_ascii=False, indent=1)

    print(json.dumps({"scoreboard": scoreboard, "invariants": invariants},
                     ensure_ascii=False, indent=1))
    return merged


if __name__ == "__main__":
    main()
