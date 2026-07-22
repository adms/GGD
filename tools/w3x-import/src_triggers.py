"""Extract the trigger tree from the UNPROTECTED source map and emit:

    out/GoDieEX22s-src/TRIGGERS.json
    out/GoDieEX22s-src/TRIGGERS.md
    out/GoDieEX22s-src/HERO_TRIGGERS.json

The trigger editor's category (folder) hierarchy maps directly onto heroes:
per-hero folders live under team separators inside the ==========技能==========
section. This script parses war3map.wtg + war3map.wct (see wtg.py), cross-checks
the segmentation against war3map.j's InitCustomTriggers order, and groups the
per-hero folders by team so the unreleased roster is machine-readable.
"""

from __future__ import annotations

import difflib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from w3xlib.mpq import W3XArchive          # noqa: E402
from wtg import parse_wtg, parse_wct        # noqa: E402

MAP = "/Users/Takuro/GGD/src_gogodieEX227s.w3x"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "GoDieEX22s-src")


def _strip_sep(name: str) -> str:
    return name.strip().strip("-=＝ 　").strip()


def _is_section(name: str) -> bool:
    return name.strip().startswith("=")


def _is_team(name: str) -> bool:
    return name.strip().startswith("-")


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    a = W3XArchive(MAP)
    wtg_data = a.read_file("war3map.wtg")
    wct_data = a.read_file("war3map.wct")
    j_data = a.read_file("war3map.j")
    a.close()

    wtg = parse_wtg(wtg_data)
    wct = parse_wct(wct_data)
    cats = wtg["categories"]
    trigs = wtg["triggers"]
    bodies = wct["entries"]

    # ---- cross-validation --------------------------------------------------
    report = {}
    report["categories"] = len(cats)
    report["triggers"] = len(trigs)
    report["wctEntries"] = len(bodies)
    ct_flag = sum(t["isCustomText"] for t in trigs)
    body_ct = sum(1 for b in bodies if b)
    report["isCustomText"] = ct_flag
    report["wctNonEmptyBodies"] = body_ct
    mism = 0
    if len(bodies) == len(trigs):
        mism = sum(1 for i, t in enumerate(trigs)
                   if (t["isCustomText"] == 1) != bool(bodies[i]))
    report["ctBodyMismatches"] = mism

    # war3map.j InitCustomTriggers order check (executable triggers only)
    jtxt = j_data.decode("utf-8", "replace")
    m = re.search(r"function\s+InitCustomTriggers\b.*?endfunction", jtxt, re.S)
    jass_calls = re.findall(r"call\s+InitTrig_([A-Za-z0-9_]+)\s*\(", m.group()) if m else []
    norm = lambda s: re.sub(r"[^A-Za-z0-9]", "_", s)
    exe = [norm(t["name"]) for t in trigs
           if t["isComment"] == 0 and t["isEnabled"] == 1]
    ratio = difflib.SequenceMatcher(a=exe, b=jass_calls, autojunk=False).ratio()
    report["executableTriggers"] = len(exe)
    report["jassInitCalls"] = len(jass_calls)
    report["jassOrderRatio"] = round(ratio, 4)

    # ---- attach bodies -----------------------------------------------------
    for i, t in enumerate(trigs):
        body = bodies[i] if i < len(bodies) else ""
        t["hasCustomTextBody"] = bool(body)
        t["_body"] = body

    catname = {c["id"]: c["name"] for c in cats}

    # ---- team / hero-folder grouping (walk categories in tree order) -------
    current_section = None
    current_team = None
    cat_meta = {}     # id -> {'kind': 'section'|'team'|'hero'|'system', 'team', 'section'}
    teams: dict[str, list[str]] = {}
    for c in cats:
        cid, name, is_cmt = c["id"], c["name"], c["isComment"]
        if is_cmt and _is_section(name):
            current_section = _strip_sep(name)
            current_team = None
            cat_meta[cid] = {"kind": "section", "section": current_section}
        elif is_cmt and _is_team(name):
            current_team = _strip_sep(name)
            teams.setdefault(current_team, [])
            cat_meta[cid] = {"kind": "team", "team": current_team,
                             "section": current_section}
        elif current_team is not None and not is_cmt:
            cat_meta[cid] = {"kind": "hero", "team": current_team,
                             "section": current_section}
            teams[current_team].append(name)
        else:
            cat_meta[cid] = {"kind": ("comment" if is_cmt else "system"),
                             "section": current_section}

    # triggers grouped by category (preserving trigger file order)
    by_cat: dict[int, list[dict]] = {}
    for t in trigs:
        by_cat.setdefault(t["categoryId"], []).append(t)

    # ---- HERO_TRIGGERS.json ------------------------------------------------
    heroes = {}
    for c in cats:
        meta = cat_meta.get(c["id"], {})
        if meta.get("kind") != "hero":
            continue
        names = [t["name"] for t in by_cat.get(c["id"], [])]
        heroes[c["name"]] = {
            "team": meta["team"],
            "categoryId": c["id"],
            "triggerCount": len(names),
            "triggers": names,
        }
    hero_out = {
        "teams": {team: folders for team, folders in teams.items()},
        "heroes": heroes,
    }
    with open(os.path.join(OUT, "HERO_TRIGGERS.json"), "w", encoding="utf-8") as f:
        json.dump(hero_out, f, ensure_ascii=False, indent=2)

    # ---- CUSTOM_TEXT.json (trigger -> custom JASS source) ------------------
    custom_text = []
    for i, t in enumerate(trigs):
        if not t["_body"]:
            continue
        meta = cat_meta.get(t["categoryId"], {})
        custom_text.append({
            "index": i,
            "name": t["name"],
            "categoryId": t["categoryId"],
            "categoryName": catname.get(t["categoryId"], ""),
            "team": meta.get("team"),
            "hero": catname.get(t["categoryId"], "") if meta.get("kind") == "hero" else None,
            "body": t["_body"],
        })
    with open(os.path.join(OUT, "CUSTOM_TEXT.json"), "w", encoding="utf-8") as f:
        json.dump({"mapHeaderScript": wct["mapHeaderScript"],
                   "triggerCount": len(custom_text),
                   "triggers": custom_text}, f, ensure_ascii=False, indent=1)

    # ---- TRIGGERS.json -----------------------------------------------------
    trig_json = {
        "source": "war3map.wtg + war3map.wct (src_gogodieEX227s.w3x)",
        "wtgVersion": wtg["version"],
        "validation": report,
        "categories": [{"id": c["id"], "name": c["name"],
                        "isComment": c["isComment"]} for c in cats],
        "triggers": [
            {"name": t["name"], "description": t["description"],
             "categoryId": t["categoryId"],
             "categoryName": catname.get(t["categoryId"], ""),
             "isComment": t["isComment"], "isEnabled": t["isEnabled"],
             "isCustomText": t["isCustomText"],
             "hasCustomTextBody": t["hasCustomTextBody"],
             "ecaCount": t["ecaCount"]}
            for t in trigs
        ],
    }
    with open(os.path.join(OUT, "TRIGGERS.json"), "w", encoding="utf-8") as f:
        json.dump(trig_json, f, ensure_ascii=False, indent=1)

    # ---- TRIGGERS.md (full folder tree, map order) -------------------------
    lines = []
    lines.append("# GoDie EX22s — trigger tree (war3map.wtg / war3map.wct)\n")
    lines.append(f"- WTG version: {wtg['version']} (classic TFT format)")
    lines.append(f"- Categories (folders): {len(cats)}")
    lines.append(f"- Triggers: {len(trigs)}  "
                 f"(executable {report['executableTriggers']}, "
                 f"comment {sum(1 for t in trigs if t['isComment'])}, "
                 f"disabled {sum(1 for t in trigs if not t['isEnabled'])})")
    lines.append(f"- Custom-text triggers: {ct_flag}  "
                 f"(WCT non-empty bodies: {body_ct}, mismatches: {mism})")
    lines.append(f"- war3map.j InitCustomTriggers order match: "
                 f"{report['jassOrderRatio']} "
                 f"({report['executableTriggers']} vs {report['jassInitCalls']} calls)\n")
    lines.append("Legend: `[C]` custom-text trigger, `[x]` disabled, "
                 "`#` comment/separator. Triggers listed in map (tree) order.\n")

    for c in cats:
        name, is_cmt, cid = c["name"], c["isComment"], c["id"]
        meta = cat_meta.get(cid, {})
        kind = meta.get("kind")
        ctrigs = by_cat.get(cid, [])
        if is_cmt and kind == "section":
            lines.append(f"\n## {name}")
        elif is_cmt and kind == "team":
            lines.append(f"\n### {name}")
        else:
            tag = ""
            if kind == "hero":
                tag = f"  _(hero · {meta['team']})_"
            lines.append(f"\n- **{name}**  `#{cid}` ({len(ctrigs)} triggers){tag}")
            for t in ctrigs:
                flags = ""
                if t["isCustomText"]:
                    flags += " `[C]`"
                if not t["isEnabled"]:
                    flags += " `[x]`"
                if t["isComment"]:
                    flags += " `#`"
                nm = t["name"] if t["name"] else "(unnamed)"
                lines.append(f"    - {nm}{flags}")
    with open(os.path.join(OUT, "TRIGGERS.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    # ---- console report ----------------------------------------------------
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print("\nTeams and hero-folder counts:")
    for team, folders in teams.items():
        print(f"  {team}: {len(folders)} folders")
    print("\nUnreleased heroes (未開放英雄):")
    for team, folders in teams.items():
        if "未開放" in team:
            for fn in folders:
                print(f"    {fn}  ({heroes[fn]['triggerCount']} triggers)")
    print(f"\nWrote: {OUT}/TRIGGERS.json, TRIGGERS.md, HERO_TRIGGERS.json")


if __name__ == "__main__":
    main()
