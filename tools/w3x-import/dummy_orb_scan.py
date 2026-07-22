#!/usr/bin/env python3
"""
dummy_orb_scan.py  --  GGD task #9 (ANALYZE, read-only)

Scan the UNPROTECTED source map JASS (out/GoDieEX22s-src/raw/war3map.j) for the two
classic WC3 "visual-as-gameplay" idioms and route them to our VFX / ambient channels
(化繁為簡 -- do NOT model them as gameplay units/abilities):

  (A) DUMMY EFFECT UNITS
      CreateUnit / CreateNUnitsAtLoc of a unit-type that carries a *custom MODEL* and is
      Locust ('Aloc') / invulnerable ('Avul') / unselectable, given an expiration
      (UnitApplyTimedLife* or KillUnit+RemoveUnit).  These are timed special effects at a
      position -- route to a one-shot vfx@1 doc (reuse godie-<model> particle port).

  (B) ORB / ATTACHMENT abilities (球體技能)
      AddSpecialEffectTargetUnitBJ(attachPoint, unit, model) -- a model/particle bound to a
      named hero attachment point (origin/chest/hand/weapon/head/overhead...).  Route to the
      EXISTING ambient-vfx channel (content/config/ambient-vfx.json + AmbientVfx.ts) when it
      persists (ambient), or a timed one-shot vfx when it is destroyed shortly after.

Also records AddSpecialEffectLocBJ(loc, model) = one-shot effect at a point (a lighter-weight
sibling of the dummy-effect-unit idiom).

Read-only: emits out/GoDieEX22s-src/DUMMY_ORB_MAP.json + DUMMY_ORB.md. No content is edited.
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "out", "GoDieEX22s-src")
RAW = os.path.join(SRC, "raw", "war3map.j")
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
VFX_DIR = os.path.join(REPO, "content", "vfx")
AMBIENT_CFG = os.path.join(REPO, "content", "config", "ambient-vfx.json")
PARTICLES_MD = os.path.join(HERE, "out", "GoDieEX22s", "PARTICLES.md")

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def load_json(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)

# model file basename -> vfx@1 doc-id slug (mirrors extract_particles.py naming)
def model_slug(fname):
    base = re.sub(r"\.(mdx|mdl)$", "", fname.strip(), flags=re.I)
    return re.sub(r"[^0-9A-Za-z]+", "-", base).strip("-").lower()

# a model literal is "junk" (invisible collision box / empty placeholder) if it has no geometry
JUNK_MODELS = {"", ".mdl", ".mdx", "none.mdl", "none", "collision.mdl", "none.mdx"}

def is_junk_model(m):
    return (m or "").strip().lower() in JUNK_MODELS

def is_bare_custom(m):
    """bare imported filename (no path separators) ending in .mdx/.mdl -> a custom import."""
    if not m:
        return False
    if "\\" in m or "/" in m:
        return False
    return m.strip().lower().endswith((".mdx", ".mdl"))

def basename_of(path):
    return re.split(r"[\\/]", path.strip())[-1]

ATTACH_CANON = {
    "origin": "origin", "orgin": "origin", "body": "chest", "chest": "chest",
    "chest ": "chest", "overhead": "overhead", "head": "head",
    "weapon": "weapon", "weapon, right": "weapon", "weapon,right": "weapon",
    "hand": "hand", "hand, right": "hand right", "hand,right": "hand right",
    "handright": "hand right", "righthand": "hand right",
    "hand, left": "hand left", "hand,left": "hand left", "handleft": "hand left",
    "lefthand": "hand left", "foot": "foot", "right foot": "foot", "left foot": "foot",
}

def canon_attach(a):
    return ATTACH_CANON.get(a.strip().lower(), a.strip().lower())

# split top-level comma args starting at index i (right after the '(') using paren matching
def split_args(text, i):
    depth = 1
    args = []
    cur = []
    n = len(text)
    in_str = False
    while i < n:
        c = text[i]
        if in_str:
            cur.append(c)
            if c == '"':
                in_str = False
            i += 1
            continue
        if c == '"':
            in_str = True
            cur.append(c)
        elif c == '(':
            depth += 1
            cur.append(c)
        elif c == ')':
            depth -= 1
            if depth == 0:
                args.append("".join(cur))
                return args, i
            cur.append(c)
        elif c == ',' and depth == 1:
            args.append("".join(cur))
            cur = []
        else:
            cur.append(c)
        i += 1
    args.append("".join(cur))
    return args, i

def line_of(text, idx):
    return text.count("\n", 0, idx) + 1

# ---------------------------------------------------------------------------
# load data
# ---------------------------------------------------------------------------
print("[dummy_orb_scan] loading data ...", file=sys.stderr)
objects = load_json(os.path.join(SRC, "OBJECTS.json"))
jidx = load_json(os.path.join(SRC, "JASS_INDEX.json"))
hero_trig = load_json(os.path.join(SRC, "HERO_TRIGGERS.json"))
ability_gap = load_json(os.path.join(SRC, "ABILITY_GAP.json"))
with open(RAW, encoding="utf-8", errors="replace") as f:
    JASS = f.read()

UNITS = {**objects.get("units", {}), **objects.get("heroes", {})}
ABIL = objects.get("abilities", {})

# model-stem -> [vfx doc ids]
vfx_by_stem = defaultdict(list)
if os.path.isdir(VFX_DIR):
    for fn in os.listdir(VFX_DIR):
        if not fn.startswith("godie-") or not fn.endswith(".json"):
            continue
        did = fn[:-5]
        m = re.match(r"godie-(.+?)-(?:p|r)\d+$", did)
        if m:
            vfx_by_stem[m.group(1)].append(did)
for k in vfx_by_stem:
    vfx_by_stem[k].sort()

# ambient-bound model keys (imported.<stem> -> already-ambient)
ambient_cfg = load_json(AMBIENT_CFG) if os.path.exists(AMBIENT_CFG) else {"bindings": {}}
ambient_bound_stems = set()
for mk in ambient_cfg.get("bindings", {}):
    ambient_bound_stems.add(mk.split(".")[-1].lower())

# PARTICLES.md ambient flag per model-stem (models whose emitters were marked ambient)
particle_ambient_stems = set()
particle_models = set()
if os.path.exists(PARTICLES_MD):
    with open(PARTICLES_MD, encoding="utf-8") as f:
        for ln in f:
            if not ln.startswith("| ") or ".md" in ln[:6]:
                continue
            cells = [c.strip() for c in ln.strip().strip("|").split("|")]
            if len(cells) < 7 or cells[0] in ("model", "---"):
                continue
            stem = model_slug(cells[0])
            particle_models.add(stem)
            # ambient column is index 6 ("ambient")
            if len(cells) > 6 and cells[6] == "Y":
                particle_ambient_stems.add(stem)

def vfx_for_model(model_fname):
    """return (existing_doc_ids, status, note) for a model filename."""
    if is_junk_model(model_fname):
        return [], "NONE", "invisible/placeholder model (no geometry) -- not a VFX"
    stem = model_slug(basename_of(model_fname))
    docs = vfx_by_stem.get(stem, [])
    if docs:
        return docs, "EXISTING", ""
    # bare custom model with no extracted emitters -> the mesh itself is the effect
    if is_bare_custom(model_fname):
        if stem in particle_models:
            return [], "NEW", "model scanned but no emitters extracted"
        return [], "NEW", "custom model not in particle port (mesh-only or unscanned)"
    return [], "STOCK", "Blizzard stock model (fx.* substitute or new one-shot needed)"

# ---------------------------------------------------------------------------
# function ranges + trigger/ability/hero attribution
# ---------------------------------------------------------------------------
funcs = jidx["functions"]                      # name -> {startLine,endLine}
func_ranges = sorted(
    ((v["startLine"], v["endLine"], name) for name, v in funcs.items()),
    key=lambda t: t[0],
)
trig_funcs = jidx["trigger_functions"]          # Trig_X_Actions -> {trigger,kind}
lines = JASS.split("\n")

def enclosing_func(line_no):
    lo, hi = 0, len(func_ranges) - 1
    best = None
    while lo <= hi:
        mid = (lo + hi) // 2
        s, e, name = func_ranges[mid]
        if s <= line_no <= e:
            return name
        if line_no < s:
            hi = mid - 1
        else:
            lo = mid + 1
    return best

# trigger (space->underscore JASS form) -> hero display name
trig_to_hero = {}
for hero, info in hero_trig.get("heroes", {}).items():
    for t in info.get("triggers", []):
        trig_to_hero.setdefault(t.replace(" ", "_"), hero)
        trig_to_hero.setdefault(t, hero)

# function -> trigger name
def func_trigger(fname):
    if fname in trig_funcs:
        return trig_funcs[fname]["trigger"]
    m = re.match(r"Trig_(.+?)_(?:Actions|Conditions|Func\d+.*)$", fname or "")
    if m:
        return m.group(1)
    return None

# trigger -> set(ability rawcodes) via GetSpellAbilityId comparisons in all its functions
trig_rawcodes = defaultdict(set)
spell_re = re.compile(r"GetSpellAbilityId\(\)\s*==\s*'([^']{4})'")
for name, v in funcs.items():
    tr = func_trigger(name)
    if not tr:
        continue
    body = "\n".join(lines[v["startLine"] - 1: v["endLine"]])
    for m in spell_re.finditer(body):
        trig_rawcodes[tr].add(m.group(1))

# rawcode -> placeholder-ability ledger entry (the 178)
gap_by_raw = {}
for a in ability_gap.get("abilities", []):
    gap_by_raw[a["rawcode"]] = a

def attribute(line_no):
    """return dict(function, trigger, hero, rawcodes[list], placeholders[list])"""
    fn = enclosing_func(line_no)
    tr = func_trigger(fn) if fn else None
    hero = trig_to_hero.get(tr) if tr else None
    raws = sorted(trig_rawcodes.get(tr, set())) if tr else []
    phs = []
    for rc in raws:
        g = gap_by_raw.get(rc)
        if g:
            phs.append({"id": g["id"], "champion": g["champion"],
                        "champ_name": g.get("champ_name"), "slot": g.get("slot"),
                        "class": g.get("class"), "source_name": g.get("source_name")})
    return {"function": fn, "trigger": tr, "hero": hero,
            "rawcodes": raws, "placeholders": phs}

def func_body(line_no):
    fn = enclosing_func(line_no)
    if not fn or fn not in funcs:
        return ""
    v = funcs[fn]
    return "\n".join(lines[v["startLine"] - 1: v["endLine"]])

# ---------------------------------------------------------------------------
# (A) DUMMY EFFECT UNITS
# ---------------------------------------------------------------------------
print("[dummy_orb_scan] scanning (A) dummy effect units ...", file=sys.stderr)
create_re = re.compile(
    r"CreateNUnitsAtLoc[A-Za-z]*\(\s*\d+\s*,\s*'([^']{4})'"
    r"|CreateNUnitsAtLocFacingLocBJ\(\s*\d+\s*,\s*'([^']{4})'"
    r"|CreateUnit(?:AtLoc)?(?:ByName)?\(\s*[^,'()]*,\s*'([^']{4})'"
)

dummy_entries = []
dummy_skipped_caster = 0
dummy_skipped_real = 0
for m in create_re.finditer(JASS):
    rc = next(g for g in m.groups() if g)
    ln = line_of(JASS, m.start())
    u = UNITS.get(rc)
    if not u:
        continue
    model = u.get("model")
    abils = u.get("abilities") or []
    loc = "Aloc" in abils
    vul = "Avul" in abils
    # A dummy EFFECT unit is Locust and/or invulnerable (not a real controllable summon) AND
    # carries a real (non-junk) model. Two exclusions:
    #  - real gameplay units (not Locust, not invuln: BurningArcher, GryphonAviary, band pets) skip
    #  - pure hidden casters (model ".mdl", no geometry) are the separate dummy-caster bucket
    if not (loc or vul):
        dummy_skipped_real += 1
        continue
    if is_junk_model(model):
        dummy_skipped_caster += 1
        continue
    docs, status, note = vfx_for_model(model)
    body = func_body(ln)
    # lifetime
    tl = re.search(r"UnitApplyTimedLife[A-Za-z]*\(\s*([0-9.]+)", body)
    lifetime = float(tl.group(1)) if tl else None
    has_kill = ("KillUnit(" in body or "RemoveUnit(" in body or "SetUnitExploded" in body)
    # caster vs pure effect
    is_caster = ("UnitAddAbility" in body) and re.search(r"Issue[A-Za-z]*Order", body) is not None
    # moving heuristic
    moving = bool(re.search(r'Issue(?:Point|Target|Immediate)Order[A-Za-z]*\([^)]*"(?:move|attack|stampede|carrionswarm|shockwave)"', body)) \
        or ("SetUnitPositionLoc" in body and body.count("SetUnitPositionLoc") > 0 and "loop" in body.lower())
    attr = attribute(ln)
    stem = model_slug(basename_of(model)) if model else ""
    already_ambient = stem in ambient_bound_stems
    dummy_entries.append({
        "kind": "dummy-oneshot",
        "line": ln,
        "unit_rawcode": rc,
        "unit_name": u.get("name"),
        "model": basename_of(model),
        "model_stem": stem,
        "locust": loc,
        "invulnerable": vul,
        "lifetime_sec": lifetime,
        "expires": bool(lifetime) or has_kill,
        "motion": "moving" if moving else "stationary",
        "is_also_caster": is_caster,
        "position": "hero-attached-aura" if (loc and not has_kill and lifetime is None and not moving) else "world-point",
        "vfx_docs": docs,
        "vfx_status": status,
        "vfx_note": note,
        "already_ambient_bound": already_ambient,
        **attr,
    })

# ---------------------------------------------------------------------------
# (B) ORB / ATTACHMENT abilities
# ---------------------------------------------------------------------------
print("[dummy_orb_scan] scanning (B) orb/attachment ...", file=sys.stderr)
orb_entries = []
loc_fx_entries = []

for m in re.finditer(r"AddSpecialEffectTargetUnitBJ\(", JASS):
    args, end = split_args(JASS, m.end())
    if len(args) < 3:
        continue
    a0 = args[0].strip()
    model_arg = args[-1].strip()
    if not (a0.startswith('"') and model_arg.startswith('"')):
        continue
    attach = canon_attach(a0.strip('"'))
    model_path = model_arg.strip('"')
    ln = line_of(JASS, m.start())
    docs, status, note = vfx_for_model(model_path)
    # Canonical WC3 idiom: AddSpecialEffectTargetUnitBJ(...) immediately followed by
    # DestroyEffectBJ(GetLastCreatedEffectBJ()) = a ONE-SHOT birth->death flash (timed);
    # if the effect handle is NOT destroyed it leaks and persists = ambient (lives with unit).
    # split_args returns `end` = index of the matching ')'; scan the statement that follows.
    tail = JASS[end + 1:end + 200]
    immediate_destroy = bool(re.match(r"\s*call\s+DestroyEffect", tail))
    bn = basename_of(model_path)
    stem = model_slug(bn)
    custom = is_bare_custom(model_path)
    already_ambient = stem in ambient_bound_stems
    part_ambient = stem in particle_ambient_stems
    kind = "orb-timed" if immediate_destroy else "orb-ambient"
    attr = attribute(ln)
    orb_entries.append({
        "kind": kind,
        "line": ln,
        "attach_point": attach,
        "model": bn,
        "model_stem": stem,
        "model_is_custom": custom,
        "immediate_destroy": immediate_destroy,
        "particle_ambient_model": part_ambient,
        "vfx_docs": docs,
        "vfx_status": status,
        "vfx_note": note,
        "already_ambient_bound": already_ambient,
        **attr,
    })

for m in re.finditer(r"AddSpecialEffectLocBJ\(", JASS):
    args, end = split_args(JASS, m.end())
    if len(args) < 2:
        continue
    model_arg = args[-1].strip()
    if not model_arg.startswith('"'):
        continue
    model_path = model_arg.strip('"')
    ln = line_of(JASS, m.start())
    docs, status, note = vfx_for_model(model_path)
    bn = basename_of(model_path)
    attr = attribute(ln)
    loc_fx_entries.append({
        "kind": "loc-oneshot",
        "line": ln,
        "model": bn,
        "model_stem": model_slug(bn),
        "model_is_custom": is_bare_custom(model_path),
        "vfx_docs": docs,
        "vfx_status": status,
        "vfx_note": note,
        **attr,
    })

# ---------------------------------------------------------------------------
# aggregate + cross-reference to the 178 placeholders
# ---------------------------------------------------------------------------
def collect_placeholders(entries, status_filter=None):
    """placeholder ids attributed to `entries`; status_filter limits to given vfx_status set."""
    ids = set()
    for e in entries:
        if status_filter is not None and e["vfx_status"] not in status_filter:
            continue
        for p in e.get("placeholders", []):
            ids.add(p["id"])
    return ids

# BROAD: any dummy/orb/loc pattern (a placeholder that is really a VISUAL, any model source)
dummy_ph = collect_placeholders(dummy_entries)
orb_ph = collect_placeholders(orb_entries)
loc_ph = collect_placeholders(loc_fx_entries)
all_resolved_ph = dummy_ph | orb_ph | loc_ph

# WIRE-NOW: placeholder gains an EXISTING godie-* vfx doc (reuse the completed particle port)
wired_ph = (collect_placeholders(dummy_entries, {"EXISTING"})
            | collect_placeholders(orb_entries, {"EXISTING"})
            | collect_placeholders(loc_fx_entries, {"EXISTING"}))
# NEW-custom: placeholder's model is a custom import present in the map but without a doc yet
newcustom_ph = (collect_placeholders(dummy_entries, {"NEW"})
                | collect_placeholders(orb_entries, {"NEW"})
                | collect_placeholders(loc_fx_entries, {"NEW"}))

total_ph = ability_gap.get("summary", {}).get("total_placeholder_ability_files", 178)

# distinct models needing NEW vfx docs
new_models = Counter()
for e in dummy_entries + orb_entries + loc_fx_entries:
    if e["vfx_status"] == "NEW":
        new_models[e["model_stem"]] += 1

existing_models = Counter()
for e in dummy_entries + orb_entries + loc_fx_entries:
    if e["vfx_status"] == "EXISTING":
        existing_models[e["model_stem"]] += 1

# ambient candidates: custom-model attachments to origin/chest that persist
ambient_candidates = defaultdict(set)  # model_stem -> set(hero)
for e in orb_entries:
    if e["kind"] == "orb-ambient" and e["model_is_custom"]:
        ambient_candidates[e["model_stem"]].add(e.get("hero") or "?")
for e in dummy_entries:
    if e["position"] == "hero-attached-aura" and e["vfx_docs"]:
        ambient_candidates[e["model_stem"]].add(e.get("hero") or "?")

summary = {
    "generated_from": "out/GoDieEX22s-src/raw/war3map.j",
    "counts": {
        "dummy_effect_units": len(dummy_entries),
        "dummy_effect_units_EXISTING_vfx": sum(1 for e in dummy_entries if e["vfx_status"] == "EXISTING"),
        "dummy_effect_units_NEW_custom": sum(1 for e in dummy_entries if e["vfx_status"] == "NEW"),
        "dummy_effect_units_STOCK": sum(1 for e in dummy_entries if e["vfx_status"] == "STOCK"),
        "dummy_hidden_casters_skipped_no_model": dummy_skipped_caster,
        "real_units_skipped_not_locust": dummy_skipped_real,
        "orb_attachment_calls": len(orb_entries),
        "orb_ambient": sum(1 for e in orb_entries if e["kind"] == "orb-ambient"),
        "orb_ambient_custom_model": sum(1 for e in orb_entries if e["kind"] == "orb-ambient" and e["model_is_custom"]),
        "orb_timed": sum(1 for e in orb_entries if e["kind"] == "orb-timed"),
        "loc_oneshot_effects": len(loc_fx_entries),
    },
    "placeholder_resolution": {
        "total_placeholders": total_ph,
        "placeholders_touched_by_dummy": sorted(dummy_ph),
        "placeholders_touched_by_orb": sorted(orb_ph),
        "placeholders_touched_by_loc_fx": sorted(loc_ph),
        "placeholders_resolved_total": len(all_resolved_ph),
        "placeholders_wire_now_EXISTING_vfx": len(wired_ph),
        "placeholders_new_custom_model": len(newcustom_ph),
        "resolved_ids": sorted(all_resolved_ph),
        "wired_ids": sorted(wired_ph),
    },
    "models": {
        "distinct_EXISTING_vfx_models": sorted(existing_models),
        "distinct_NEW_needed_models": sorted(new_models),
        "ambient_binding_candidates": {k: sorted(v) for k, v in sorted(ambient_candidates.items())},
    },
}

out_map = {
    "schema": "dummy-orb-map@1",
    "summary": summary,
    "dummy_effect_units": sorted(dummy_entries, key=lambda e: (e["vfx_status"] != "EXISTING", e["line"])),
    "orb_attachments": sorted(orb_entries, key=lambda e: (e["kind"], e["line"])),
    "loc_oneshot_effects": sorted(loc_fx_entries, key=lambda e: e["line"]),
}

MAP_PATH = os.path.join(SRC, "DUMMY_ORB_MAP.json")
with open(MAP_PATH, "w", encoding="utf-8") as f:
    json.dump(out_map, f, ensure_ascii=False, indent=2)
print(f"[dummy_orb_scan] wrote {MAP_PATH}", file=sys.stderr)

# ---------------------------------------------------------------------------
# human report
# ---------------------------------------------------------------------------
def hero_tag(e):
    h = e.get("hero") or "?"
    phs = e.get("placeholders", [])
    tag = phs[0]["id"] if phs else ""
    return h, tag

def md_table(entries, cols, rowfn):
    out = ["| " + " | ".join(cols) + " |", "|" + "|".join("---" for _ in cols) + "|"]
    for e in entries:
        out.append("| " + " | ".join(str(x) for x in rowfn(e)) + " |")
    return "\n".join(out)

lines_md = []
w = lines_md.append
w("# DUMMY-EFFECT-UNIT + ORB/ATTACHMENT map — GoDieEX22s (源碼)")
w("")
w("Generated by `tools/w3x-import/dummy_orb_scan.py` (read-only). Recognizes the two classic")
w("WC3 *visual-as-gameplay* idioms and routes them to our VFX / ambient channels (化繁為簡):")
w("")
w("- **(A) dummy effect unit** → one-shot `vfx@1` at the position (reuse the particle port).")
w("- **(B) orb / attachment** → `content/config/ambient-vfx.json` binding (ambient) or timed one-shot.")
w("")
w("## 0. Top-line")
w("")
c = summary["counts"]
pr = summary["placeholder_resolution"]
w(f"| metric | value |")
w(f"|---|---|")
w(f"| **dummy effect units** (Locust/invuln + model + expire) | **{c['dummy_effect_units']}** "
  f"({c['dummy_effect_units_EXISTING_vfx']} existing-vfx / {c['dummy_effect_units_NEW_custom']} new-custom / {c['dummy_effect_units_STOCK']} stock) |")
w(f"| hidden dummy *casters* skipped (no geometry = gameplay, not VFX) | {c['dummy_hidden_casters_skipped_no_model']} |")
w(f"| real summons/buildings skipped (not Locust/invuln) | {c['real_units_skipped_not_locust']} |")
w(f"| **orb/attachment calls** (`AddSpecialEffectTargetUnitBJ`) | **{c['orb_attachment_calls']}** "
  f"({c['orb_ambient']} ambient — {c['orb_ambient_custom_model']} custom-model / {c['orb_timed']} timed one-shot) |")
w(f"| loc one-shot effects (`AddSpecialEffectLocBJ`) | {c['loc_oneshot_effects']} |")
w(f"| distinct models with EXISTING vfx docs (wire now) | {len(summary['models']['distinct_EXISTING_vfx_models'])} |")
w(f"| distinct models needing NEW vfx docs | {len(summary['models']['distinct_NEW_needed_models'])} |")
w(f"| **placeholder abilities (of {pr['total_placeholders']}) these patterns resolve** | **{pr['placeholders_resolved_total']}** |")
w(f"| …wire-now via an EXISTING godie-* vfx doc | {pr['placeholders_wire_now_EXISTING_vfx']} |")
w(f"| …need a NEW doc for a custom imported model | {pr['placeholders_new_custom_model']} |")
w("")
w("> **化繁為簡 headline:** " +
  f"{pr['placeholders_resolved_total']} of {pr['total_placeholders']} placeholder abilities are really "
  "VISUALS (their handler spawns a dummy effect unit / orb attachment), not new gameplay. Route them to "
  f"`spawnVfx`: **{pr['placeholders_wire_now_EXISTING_vfx']}** wire immediately to an already-extracted "
  f"particle doc, **{pr['placeholders_new_custom_model']}** need a doc for a custom model already in the map, "
  "the rest use a stock-model substitute — none needs a new sim primitive.")
w("")

# --- A ---
w("## (A) Dummy effect units → one-shot VFX")
w("")
w("Custom-model units spawned via `CreateUnit`/`CreateNUnitsAtLoc`, Locust/invuln, timed-life or killed.")
w("`is_also_caster` flags units that ALSO cast a stock spell (the gameplay is handled elsewhere; here we")
w("only route the MODEL to a one-shot VFX).")
w("")
dummy_sorted = sorted(dummy_entries, key=lambda e: (e["vfx_status"] != "EXISTING", -bool(e["placeholders"]), e["line"]))
w(md_table(
    dummy_sorted,
    ["line", "unit", "unit_name", "model", "life", "motion", "caster", "hero", "placeholder", "vfx", "status"],
    lambda e: (
        e["line"], e["unit_rawcode"], (e["unit_name"] or "")[:14],
        e["model"], (f"{e['lifetime_sec']}s" if e["lifetime_sec"] else ("kill" if e["expires"] else "—")),
        e["motion"], "Y" if e["is_also_caster"] else "",
        hero_tag(e)[0], hero_tag(e)[1],
        (e["vfx_docs"][0] + (f" +{len(e['vfx_docs'])-1}" if len(e["vfx_docs"]) > 1 else "")) if e["vfx_docs"] else "—",
        e["vfx_status"],
    ),
))
w("")

# --- B ---
w("## (B) Orb / attachment abilities → ambient-vfx (or timed)")
w("")
w("`AddSpecialEffectTargetUnitBJ(attachPoint, unit, model)` — a model bound to a hero attachment point.")
w("**Rule:** call *not* immediately followed by `DestroyEffect(GetLastCreatedEffectBJ())` = persistent")
w("→ **ambient** (bind in `ambient-vfx.json`); immediate destroy = **timed** one-shot birth→death flash.")
w("")
orb_amb = [e for e in orb_entries if e["kind"] == "orb-ambient"]
orb_tim = [e for e in orb_entries if e["kind"] == "orb-timed"]
w("### B.1 orb-ambient (custom models → extend ambient-vfx.json)")
w("")
w(md_table(
    sorted(orb_amb, key=lambda e: (e["vfx_status"] != "EXISTING", e["line"])),
    ["line", "attach", "model", "hero", "placeholder", "vfx", "status", "already_bound"],
    lambda e: (
        e["line"], e["attach_point"], e["model"], hero_tag(e)[0], hero_tag(e)[1],
        (e["vfx_docs"][0] + (f" +{len(e['vfx_docs'])-1}" if len(e["vfx_docs"]) > 1 else "")) if e["vfx_docs"] else "—",
        e["vfx_status"], "Y" if e["already_ambient_bound"] else "",
    ),
))
w("")
w(f"### B.2 orb-timed ({len(orb_tim)} calls — stock target fx / destroyed shortly after)")
w("")
w("Distinct attach-point × model, with call counts (mostly Blizzard stock cast/target markers):")
w("")
tim_counter = Counter((e["attach_point"], e["model"], e["vfx_status"]) for e in orb_tim)
w("| attach | model | status | count |")
w("|---|---|---|---|")
for (ap, mdl, st), n in tim_counter.most_common(40):
    w(f"| {ap} | {mdl} | {st} | {n} |")
w("")

# --- ambient candidates ---
w("## (C) Ambient-vfx.json binding candidates (new bindings to ADD in the wiring phase)")
w("")
w("Custom aura/orb models attached to a hero that persist. Each maps to `imported.<stem>` in")
w("`ambient-vfx.json` (schema `config.ambient-vfx@1`) → the existing `AmbientVfx.ts` channel.")
w("")
w("| model stem | existing vfx docs | heroes/uses | note |")
w("|---|---|---|---|")
for stem, heroes in sorted(summary["models"]["ambient_binding_candidates"].items()):
    docs = vfx_by_stem.get(stem, [])
    docstr = (f"{len(docs)} docs" if docs else "NEW needed")
    already = " (already bound)" if stem in ambient_bound_stems else ""
    w(f"| {stem} | {docstr}{already} | {', '.join(sorted(h for h in heroes if h and h!='?'))[:40] or '—'} | {'ambient' if stem in particle_ambient_stems else ''} |")
w("")

# --- resolved placeholders ---
w("## (D) Placeholder abilities resolved by these VFX (priority worklist)")
w("")
w(f"**{pr['placeholders_resolved_total']} / {pr['total_placeholders']}** placeholder abilities are visuals resolved here.")
w("These should get a `spawnVfx` effect (dummy/loc one-shot) or an ambient binding instead of a `damage[0,0,0,0]` stub.")
w("")
w("| placeholder id | champion | slot | source name | class | via |")
w("|---|---|---|---|---|---|")
seen = set()
def entry_via(pid):
    tags = []
    if pid in dummy_ph: tags.append("dummy")
    if pid in orb_ph: tags.append("orb")
    if pid in loc_ph: tags.append("loc-fx")
    if pid in wired_ph: tags.append("WIRED")
    return "+".join(tags)
for pid in sorted(all_resolved_ph):
    g = gap_by_raw_by_id = None
    for a in ability_gap["abilities"]:
        if a["id"] == pid:
            g = a; break
    if not g: continue
    w(f"| {pid} | {g.get('champ_name','')} | {g.get('slot','')} | {g.get('source_name','')} | {g.get('class','')} | {entry_via(pid)} |")
w("")
w("## (E) Method / caveats")
w("")
w("- Model→vfx slug mirrors `extract_particles.py`: basename → lowercase, non-alnum runs → `-`; ")
w("  e.g. `Bladestorm_SwordEffect.mdl` → `godie-bladestorm-swordeffect-*`.")
w("- Attribution: match line → enclosing JASS function → trigger → hero (`HERO_TRIGGERS.json`) and →")
w("  ability rawcodes via `GetSpellAbilityId()=='X'` in the trigger's functions → placeholder ledger")
w("  (`ABILITY_GAP.json`). Passive/item triggers with no spell id have hero `?` and no placeholder.")
w("- `motion` and ambient/timed splits are heuristic (move-order / `DestroyEffect` presence); verify")
w("  per-entry before wiring. Hidden dummy *casters* (model `.mdl`, no geometry) are intentionally")
w("  EXCLUDED from (A) — they are gameplay, not VFX.")
w("")

MD_PATH = os.path.join(SRC, "DUMMY_ORB.md")
with open(MD_PATH, "w", encoding="utf-8") as f:
    f.write("\n".join(lines_md))
print(f"[dummy_orb_scan] wrote {MD_PATH}", file=sys.stderr)

# machine-readable stdout summary (for the workflow)
print(json.dumps({
    "dummyEffects": len(dummy_entries),
    "orbAttach": len(orb_entries),
    "loc_oneshot": len(loc_fx_entries),
    "placeholders_resolved": len(all_resolved_ph),
    "placeholders_wired_existing": len(wired_ph),
    "map_path": MAP_PATH,
    "md_path": MD_PATH,
}, ensure_ascii=False))
