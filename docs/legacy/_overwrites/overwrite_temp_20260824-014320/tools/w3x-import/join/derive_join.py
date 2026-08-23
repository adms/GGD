#!/usr/bin/env python3
"""
derive_join.py -- GH#649 類① (L5, read-only derivation; NO content is edited)

Problem: DUMMY_ORB_MAP.json has 823 rows of dummy-unit / orb-attachment / loc-oneshot
evidence, but 442 rows carry no ability rawcode -- the JASS around the spawn call never
compares GetSpellAbilityId() inside the SAME trigger family, so dummy_orb_scan.py's
depth-0 attribution came up empty.

This tool walks the JASS call chain UPWARD from each row's enclosing function:

    spawn call
      -> enclosing function (helper or Trig_X_* family member)
      -> callers: `call F(`, `function F` code refs, ExecuteFunc("F")
      -> trigger activation: EnableTrigger/TriggerExecute/TriggerRegister*(gg_trg_X)
         found in some caster trigger's actions
      -> timer relay: TimerStart(udg_T) where InitTrig registered
         TriggerRegisterTimerExpireEvent(gg_trg_X, udg_T)
      -> ... until a trigger family whose functions carry ability evidence:
           GetSpellAbilityId()=='XXXX'   (spell-cast, strong)
           GetLearnedSkillBJ()=='XXXX'   (learn, strong)
           GetUnitAbilityLevel*('XXXX')  (level-check, weak)
           UnitAdd/RemoveAbility('XXXX') (add-remove, weakest)

Confidence tiers (per GH#649):
    high      直接呼叫  -- evidence in the row's own trigger family (depth 0), or a
                          single-caller 1-hop chain; strong evidence; unique rawcode
    medium    經共用函式 -- unique rawcode but reached via shared functions / activation
                          edges / deeper chains, or only weak evidence, or hero tie-break
    ambiguous 多候選    -- >1 distinct rawcodes reachable; all candidates listed
    unresolved 推不出   -- no ability rawcode reachable; reason classified

Outputs (both under tools/w3x-import/join/out/):
    JOIN_DERIVED.json  -- machine table keyed (kind, line) for batch-2 application
    JOIN_DERIVED.md    -- human summary + full table

Read-only w.r.t. content/: this tool never writes outside tools/w3x-import/join/out/.
"""
import json
import os
import re
import sys
from collections import defaultdict, deque

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "out", "GoDieEX22s-src")
RAW = os.path.join(SRC, "raw", "war3map.j")
OUT = os.path.join(HERE, "out")

MAX_DEPTH = 8          # BFS depth limit walking up the caller graph
HUB_CALLERS = 20       # a function with more callers than this is a generic hub; do not expand

STRONG = ("spell-cast", "learn")
WEAK = ("level-check", "add-remove")

MAP_INIT_RE = re.compile(
    r"^(main|config|InitCustomPlayerSlots|InitCustomTeams|InitAllyPriorities|"
    r"CreateRegions|CreateCameras|InitSounds|CreateAllUnits|InitBlizzard|"
    r"InitGlobals|InitCustomTriggers|RunInitializationTriggers|"
    r"CreateBuildingsForPlayer\d+|CreateUnitsForPlayer\d+|"
    r"CreateNeutralPassiveBuildings|CreateNeutralPassive|CreateNeutralHostile.*|"
    r"CreatePlayerBuildings|CreatePlayerUnits)$"
)


def load_json(p):
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def main():
    print("[derive_join] loading ...", file=sys.stderr)
    jidx = load_json(os.path.join(SRC, "JASS_INDEX.json"))
    objects = load_json(os.path.join(SRC, "OBJECTS.json"))
    gap = load_json(os.path.join(SRC, "ABILITY_GAP.json"))
    dmap = load_json(os.path.join(SRC, "DUMMY_ORB_MAP.json"))
    with open(RAW, encoding="utf-8", errors="replace") as f:
        lines = f.read().split("\n")

    funcs = jidx["functions"]                    # name -> {startLine,endLine}
    trig_funcs = jidx["trigger_functions"]       # name -> {trigger,kind}
    ability_codes = set(objects.get("abilities", {}))
    abil_names = {k: (v.get("name") or v.get("name_raw") or "")
                  for k, v in objects.get("abilities", {}).items()}
    item_codes = set(objects.get("items", {}))
    gap_by_raw = {a["rawcode"]: a for a in gap.get("abilities", [])}

    def body(name):
        v = funcs.get(name)
        if not v:
            return ""
        return "\n".join(lines[v["startLine"] - 1: v["endLine"]])

    fam_re = re.compile(r"^Trig_(.+?)_(?:Actions|Conditions|Func\d+.*)$")

    def func_trigger(fname):
        if fname in trig_funcs:
            return trig_funcs[fname]["trigger"]
        m = fam_re.match(fname or "")
        return m.group(1) if m else None

    families = defaultdict(list)                 # trigger -> [func names]
    for name in funcs:
        tr = func_trigger(name)
        if tr:
            families[tr].append(name)

    # ------------------------------------------------------------------ edges
    print("[derive_join] building caller graph ...", file=sys.stderr)
    call_re = re.compile(r"\bcall\s+([A-Za-z_]\w*)\s*\(")
    coderef_re = re.compile(r"\bfunction\s+([A-Za-z_]\w*)")
    execfunc_re = re.compile(r'ExecuteFunc\s*\(\s*"([^"]+)"')
    activate_re = re.compile(
        r"\b(?:EnableTrigger|TriggerExecute|TriggerExecuteWait|"
        r"ConditionalTriggerExecute|TriggerEvaluate|TriggerRegister\w+)"
        r"\s*\(\s*gg_trg_(\w+)"
    )
    timer_reg_re = re.compile(
        r"TriggerRegisterTimerExpireEvent\w*\(\s*gg_trg_(\w+)\s*,\s*(udg_\w+)"
    )
    timer_start_re = re.compile(r"\b(?:TimerStart|StartTimerBJ)\w*\(\s*(udg_\w+)")

    redges = defaultdict(set)                    # callee -> {callers}
    timer_to_trigs = defaultdict(set)            # udg_T -> {trigger}
    trig_entry = {}                              # trigger -> [entry funcs] (Actions/Conditions)
    for tr, members in families.items():
        trig_entry[tr] = [m for m in members
                          if m.endswith("_Actions") or m.endswith("_Conditions")] or members

    bodies = {}
    for name in funcs:
        b = bodies[name] = body(name)
        for m in timer_reg_re.finditer(b):
            timer_to_trigs[m.group(2)].add(m.group(1))

    for name, b in bodies.items():
        if name.startswith("InitTrig_"):
            continue                             # registration, not invocation
        callees = set(call_re.findall(b)) | set(coderef_re.findall(b)) | set(execfunc_re.findall(b))
        for g in callees:
            if g in funcs and g != name:
                redges[g].add(name)
        for m in activate_re.finditer(b):
            tr = m.group(1)
            if func_trigger(name) == tr:
                continue                         # self re-enable, not a chain
            for entry in trig_entry.get(tr, []):
                redges[entry].add(name)
        for m in timer_start_re.finditer(b):
            for tr in timer_to_trigs.get(m.group(1), ()):
                if func_trigger(name) == tr:
                    continue
                for entry in trig_entry.get(tr, []):
                    redges[entry].add(name)

    # -------------------------------------------------------- evidence per family
    print("[derive_join] collecting ability evidence per trigger family ...", file=sys.stderr)
    spell_re = re.compile(r"GetSpellAbilityId\(\)\s*==\s*'([^']{4})'")
    learn_re = re.compile(r"GetLearnedSkill(?:BJ)?\(\)\s*==\s*'([^']{4})'")
    level_re = re.compile(r"GetUnitAbilityLevel\w*\([^\n]*?'([^']{4})'")
    addrem_re = re.compile(r"\bUnit(?:Add|Remove)Ability\w*\([^\n]*?'([^']{4})'")
    item_re = re.compile(
        r"(?:GetItemTypeId\s*\([^\n]*?\)\s*==\s*'([^']{4})'|UnitHasItemOfTypeBJ\([^\n]*?'([^']{4})')"
    )
    unittype_re = re.compile(r"GetUnitTypeId\s*\([^\n]*?\)\s*==\s*'([^']{4})'")
    event_re = re.compile(r"\b(EVENT_\w+)\b|\b(TriggerRegisterTimerEvent\w*)\b")

    hero_units = objects.get("heroes", {})       # unit rawcode -> doc (127 heroes)
    hero_unit_names = {k: (v.get("name") or "") for k, v in hero_units.items()}

    fam_evidence = {}                            # trigger -> {tier: {rawcodes}}
    fam_items = defaultdict(set)                 # trigger -> {item rawcodes}
    fam_hero_units = defaultdict(set)            # trigger -> {hero unit rawcodes}
    fam_events = defaultdict(set)                # trigger -> {registered event names}
    for tr, members in families.items():
        ev = {"spell-cast": set(), "learn": set(), "level-check": set(), "add-remove": set()}
        for name in members:
            b = bodies.get(name, "")
            ev["spell-cast"].update(c for c in spell_re.findall(b) if c in ability_codes)
            ev["learn"].update(c for c in learn_re.findall(b) if c in ability_codes)
            ev["level-check"].update(c for c in level_re.findall(b) if c in ability_codes)
            ev["add-remove"].update(c for c in addrem_re.findall(b) if c in ability_codes)
            for a, bb in item_re.findall(b):
                c = a or bb
                if c in item_codes or (c and c[0] == "I"):
                    fam_items[tr].add(c)
            fam_hero_units[tr].update(c for c in unittype_re.findall(b) if c in hero_units)
        fam_evidence[tr] = ev
        init_b = bodies.get("InitTrig_" + tr.replace(" ", "_"), "")
        for m in event_re.finditer(init_b):
            fam_events[tr].add(m.group(1) or m.group(2))

    def strong_of(tr):
        ev = fam_evidence.get(tr)
        if not ev:
            return set()
        return ev["spell-cast"] | ev["learn"]

    # ------------------------------------------------------------------ BFS
    def walk(rf):
        """BFS upward from row-function rf.
        returns (strong_cands, weak_cands, visited_fams, item_codes_seen, hero_units_seen, hubs)
        candidate = {rawcode, family, depth, path, evidence}"""
        strong_c, weak_c = [], []
        visited = {rf}
        fams_seen = set()
        items_seen = set()
        hero_seen = {}                           # unit rawcode -> min depth
        hubs = []
        q = deque([(rf, 0, [rf])])
        while q:
            node, depth, path = q.popleft()
            tr = func_trigger(node)
            stop_here = False
            if tr:
                fams_seen.add(tr)
                items_seen |= fam_items.get(tr, set())
                for c in fam_hero_units.get(tr, ()):
                    if c not in hero_seen or depth < hero_seen[c]:
                        hero_seen[c] = depth
                ev = fam_evidence[tr]
                sc = ev["spell-cast"] | ev["learn"]
                if sc:
                    for c in sorted(sc):
                        kind = "spell-cast" if c in ev["spell-cast"] else "learn"
                        strong_c.append({"rawcode": c, "family": tr, "depth": depth,
                                         "path": path, "evidence": kind})
                    stop_here = True             # nearest strong evidence wins on this branch
                else:
                    for tier in WEAK:
                        for c in sorted(ev[tier]):
                            weak_c.append({"rawcode": c, "family": tr, "depth": depth,
                                           "path": path, "evidence": tier})
            if stop_here or depth >= MAX_DEPTH:
                continue
            callers = redges.get(node, ())
            if len(callers) > HUB_CALLERS:
                hubs.append(node)
                continue
            for caller in sorted(callers):
                if caller in visited:
                    continue
                visited.add(caller)
                q.append((caller, depth + 1, path + [caller]))
        return strong_c, weak_c, fams_seen, items_seen, hubs

    # ------------------------------------------------------------------ rows
    print("[derive_join] deriving 442 rows ...", file=sys.stderr)
    results = []
    stats = defaultdict(int)
    walk_cache = {}
    for kind_key in ("dummy_effect_units", "orb_attachments", "loc_oneshot_effects"):
        for row in dmap[kind_key]:
            if row.get("rawcodes"):
                continue                         # already joined by dummy_orb_scan
            rf = row.get("function")
            base = {
                "kind": row["kind"], "line": row["line"], "function": rf,
                "trigger": row.get("trigger"), "hero": row.get("hero"),
                "model": row.get("model"), "model_stem": row.get("model_stem"),
            }
            if not rf:
                base.update(confidence="unresolved", reason="no enclosing function")
                results.append(base)
                stats["unresolved"] += 1
                continue
            if rf not in walk_cache:
                walk_cache[rf] = walk(rf)
            strong_c, weak_c, fams_seen, items_seen, hubs = walk_cache[rf]
            cands = strong_c if strong_c else weak_c
            raws = sorted({c["rawcode"] for c in cands})

            def best_for(rc):
                return min((c for c in cands if c["rawcode"] == rc), key=lambda c: c["depth"])

            def cand_out(rc):
                c = best_for(rc)
                g = gap_by_raw.get(rc)
                return {
                    "rawcode": rc,
                    "ability_name": abil_names.get(rc, ""),
                    "family": c["family"], "depth": c["depth"],
                    "evidence": c["evidence"], "chain": c["path"],
                    "gap_id": g["id"] if g else None,
                    "gap_champion": g.get("champ_name") if g else None,
                    "gap_slot": g.get("slot") if g else None,
                }

            if len(raws) == 1:
                rc = raws[0]
                c = best_for(rc)
                unique_1hop = (
                    c["depth"] == 0
                    or (c["depth"] == 1 and len(redges.get(rf, ())) == 1)
                )
                conf = ("high" if (c["evidence"] in STRONG and unique_1hop) else "medium")
                base.update(confidence=conf, join=cand_out(rc))
                stats[conf] += 1
            elif len(raws) > 1:
                tie = None
                if row.get("hero"):
                    hero_match = [rc for rc in raws
                                  if gap_by_raw.get(rc, {}).get("champ_name") == row["hero"]]
                    if len(hero_match) == 1:
                        tie = hero_match[0]
                if tie:
                    base.update(confidence="medium", join=cand_out(tie),
                                tiebreak="hero-match ({})".format(row["hero"]),
                                candidates=[cand_out(rc) for rc in raws])
                    stats["medium"] += 1
                else:
                    base.update(confidence="ambiguous",
                                candidates=[cand_out(rc) for rc in raws])
                    stats["ambiguous"] += 1
            else:
                if MAP_INIT_RE.match(rf):
                    reason = "map-init decoration (placed at map start, not ability-driven)"
                elif items_seen:
                    reason = "item-driven (item rawcodes: {})".format(", ".join(sorted(items_seen)))
                elif fams_seen:
                    evs = sorted({e for tr in fams_seen for e in fam_events.get(tr, ())})
                    reason = ("reached trigger(s) with no ability evidence; root events: "
                              + (", ".join(evs) if evs else "unknown"))
                else:
                    reason = "no caller chain found (dead code or data-driven dispatch)"
                if hubs:
                    reason += " [stopped at hub fn: {}]".format(", ".join(sorted(set(hubs))[:3]))
                base.update(confidence="unresolved", reason=reason,
                            families_seen=sorted(fams_seen))
                results.append(base)
                stats["unresolved"] += 1
                continue
            results.append(base)

    # ------------------------------------------------------------------ write
    os.makedirs(OUT, exist_ok=True)
    out = {
        "schema": "join-derived@1",
        "generated_from": "out/GoDieEX22s-src/DUMMY_ORB_MAP.json + raw/war3map.j",
        "generator": "tools/w3x-import/join/derive_join.py",
        "note": "GH#649 batch-1 derivation table. Apply in batch 2; no content edited here.",
        "summary": {
            "rows_total": len(results),
            "high": stats["high"], "medium": stats["medium"],
            "ambiguous": stats["ambiguous"], "unresolved": stats["unresolved"],
        },
        "rows": results,
    }
    jp = os.path.join(OUT, "JOIN_DERIVED.json")
    with open(jp, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("[derive_join] wrote", jp, file=sys.stderr)

    # markdown
    md = []
    w = md.append
    w("# JOIN_DERIVED — JASS trigger→ability join derivation (GH#649 類①)")
    w("")
    w("Generated by `tools/w3x-import/join/derive_join.py` from `DUMMY_ORB_MAP.json` (442 rows")
    w("with empty `rawcodes`) + `raw/war3map.j` caller-graph walk. **Derivation only — batch 2")
    w("applies it; no content edited.**")
    w("")
    s = out["summary"]
    w("| confidence | rows | meaning |")
    w("|---|---:|---|")
    w("| high | {} | 直接呼叫: evidence in the row's own family / unique 1-hop chain |".format(s["high"]))
    w("| medium | {} | 經共用函式/activation/timer chain, or weak evidence, or hero tie-break |".format(s["medium"]))
    w("| ambiguous | {} | multiple candidate rawcodes; all listed |".format(s["ambiguous"]))
    w("| unresolved | {} | no ability rawcode reachable; reason recorded |".format(s["unresolved"]))
    w("")
    w("## Joined rows (high + medium)")
    w("")
    w("| kind | line | function | rawcode | ability | ev | d | conf |")
    w("|---|---:|---|---|---|---|---:|---|")
    for r in results:
        if r["confidence"] in ("high", "medium"):
            j = r["join"]
            w("| {} | {} | {} | {} | {} | {} | {} | {} |".format(
                r["kind"], r["line"], r["function"], j["rawcode"],
                (j["ability_name"] or "")[:28], j["evidence"], j["depth"], r["confidence"]))
    w("")
    w("## Ambiguous rows (candidates listed, not joined)")
    w("")
    w("| kind | line | function | candidates |")
    w("|---|---:|---|---|")
    for r in results:
        if r["confidence"] == "ambiguous":
            cs = "; ".join("{} ({}, d{})".format(c["rawcode"], c["evidence"], c["depth"])
                           for c in r["candidates"])
            w("| {} | {} | {} | {} |".format(r["kind"], r["line"], r["function"], cs))
    w("")
    w("## Unresolved rows")
    w("")
    w("| kind | line | function | reason |")
    w("|---|---:|---|---|")
    for r in results:
        if r["confidence"] == "unresolved":
            w("| {} | {} | {} | {} |".format(r["kind"], r["line"], r["function"], r["reason"]))
    w("")
    mp = os.path.join(OUT, "JOIN_DERIVED.md")
    with open(mp, "w", encoding="utf-8") as f:
        f.write("\n".join(md))
    print("[derive_join] wrote", mp, file=sys.stderr)
    print(json.dumps(s, ensure_ascii=False))


if __name__ == "__main__":
    main()
