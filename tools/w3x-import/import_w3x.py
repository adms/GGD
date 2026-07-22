#!/usr/bin/env python3
"""GGD Warcraft III map importer — single entrypoint.

Usage:
    python3 tools/w3x-import/import_w3x.py <map.w3x> [--content <content-dir>]
                                           [--out <out-dir>] [--no-content]

Stages (see w3xlib/*):
  1. extract   — MPQ decrypt/explode → out/<map>/raw/ + inventory
  2. stats     — w3u/w3a/w3t (+wts TRIGSTR) → out/<map>/parsed/*.json
  3. models    — every .mdx → .glb (+ BLP→PNG) → out/<map>/glb/
  4. drafts    — champions/items/models/skins/projectiles/arena docs
  5. write     — docs into content/ (validated by `pnpm content:validate`);
                 heroes without a recovered model → out/<map>/drafts/ only
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from w3xlib import extract, stats  # noqa: E402
from w3xlib.models import convert_all, slug  # noqa: E402
from w3xlib.drafts import (  # noqa: E402
    STANDIN_MODELS,
    apply_standard_defaults,
    hero_to_champion,
    item_to_draft,
    model_scale,
    _clean,
)
from w3xlib.maps import build_arena  # noqa: E402
from w3xlib.pool import extract_random_pool, read_roster_file  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("map")
    ap.add_argument("--content", default=None, help="content/ dir to write docs into")
    ap.add_argument("--out", default=None)
    ap.add_argument("--no-content", action="store_true",
                    help="write drafts to out/ only, do not touch content/")
    ap.add_argument("--roster", default=None,
                    help="file of hero rawcodes overriding the random-hero "
                         "pool auto-extracted from the JASS script; original-"
                         "table (modified standard) heroes in the roster are "
                         "emitted as champions too")
    args = ap.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    map_name = os.path.splitext(os.path.basename(args.map))[0]
    out_dir = args.out or os.path.join(here, "out", map_name)
    raw_dir = os.path.join(out_dir, "raw")
    content_dir = args.content or os.path.normpath(
        os.path.join(here, "..", "..", "content")
    )

    # ---- 1. extract ---------------------------------------------------------
    print("[1/5] extracting MPQ …")
    inv = extract.run(args.map, raw_dir)
    with open(os.path.join(out_dir, "inventory.json"), "w", encoding="utf-8") as f:
        json.dump(inv, f, indent=1, ensure_ascii=False)
    ok = sum(1 for v in inv["files"].values() if v["status"] == "ok")
    print(f"      {ok} files extracted, {inv['unrecovered_blocks']} block entries unnamed")

    # ---- 2. stats -----------------------------------------------------------
    print("[2/5] parsing object data …")
    parsed = stats.parse_all(raw_dir)
    stats.write_parsed(parsed, os.path.join(out_dir, "parsed"))
    print(f"      heroes={len(parsed['heroes'])} units={len(parsed['units'])} "
          f"abilities={len(parsed['abilities'])} items={len(parsed['items'])} "
          f"original-table heroes={len(parsed['heroes_original'])}")

    # ---- 2b. random-hero roster --------------------------------------------
    # The map's random-hero mode draws from a rawcode array in the JASS
    # script (auto-extracted; see w3xlib/pool.py).  --roster overrides it.
    pool_info = None
    for jname in ("scripts__war3map.j", "war3map.j"):
        jpath = os.path.join(raw_dir, jname)
        if os.path.exists(jpath):
            script = open(jpath, encoding="utf-8", errors="replace").read()
            pool_info = extract_random_pool(script)
            if pool_info:
                pool_info["source"] = jname.replace("__", "\\")
                break
    if args.roster:
        roster = read_roster_file(args.roster)
        print(f"      roster: {len(roster)} rawcodes from --roster")
    else:
        roster = list(pool_info["codes"]) if pool_info else []
        if pool_info:
            print(f"      random pool: {pool_info['count']} rawcodes "
                  f"(JASS array `{pool_info['var']}`)")
    if pool_info:
        with open(os.path.join(out_dir, "parsed", "random_pool.json"), "w",
                  encoding="utf-8") as f:
            json.dump(pool_info, f, indent=1, ensure_ascii=False)

    # ---- 3. models ----------------------------------------------------------
    print("[3/5] converting MDX → glTF …")
    glb_dir = os.path.join(out_dir, "glb")
    tex_dir = os.path.join(out_dir, "textures")
    mrep = convert_all(raw_dir, glb_dir, tex_dir)

    # per-unit visual size: map each model slug to the Scaling Value ('usca')
    # of the hero that OWNS it (custom heroes win over original-table heroes).
    usca_by_slug: dict[str, float] = {}
    for src in (parsed["heroes"], parsed["heroes_original"]):
        for hero in src.values():
            if not isinstance(hero.get("model"), str):
                continue
            ms = slug(hero["model"].replace("\\", "/").split("/")[-1]
                      .rsplit(".", 1)[0])
            if hero.get("scale") is not None:
                usca_by_slug.setdefault(ms, float(hero["scale"]))
    for m in mrep:
        if m.get("status") != "ok":
            continue
        u = usca_by_slug.get(m.get("name"), 1.0)
        sc, eff = model_scale(u, m.get("height"))
        m["usca"] = round(u, 3)
        m["doc_scale"] = sc
        m["effective_height"] = eff

    with open(os.path.join(out_dir, "models_report.json"), "w", encoding="utf-8") as f:
        json.dump(mrep, f, indent=1, ensure_ascii=False)
    ok_models = [m for m in mrep if m["status"] == "ok"]
    print(f"      {len(ok_models)}/{len(mrep)} models converted")

    # ---- 4+5. drafts + write ------------------------------------------------
    print("[4/5] generating content drafts …")
    drafts_dir = os.path.join(out_dir, "drafts")
    if os.path.isdir(drafts_dir):
        shutil.rmtree(drafts_dir)  # no stale docs from earlier runs
    os.makedirs(drafts_dir, exist_ok=True)
    notes: list[str] = []
    report = {"notes": notes}

    models_by_slug = {m["name"]: m for m in ok_models}
    write_content = not args.no_content

    def emit(collection: str, doc: dict, valid: bool = True):
        target = (
            os.path.join(content_dir, collection)
            if (write_content and valid)
            else os.path.join(drafts_dir, collection)
        )
        os.makedirs(target, exist_ok=True)
        with open(os.path.join(target, doc["id"] + ".json"), "w",
                  encoding="utf-8") as f:
            json.dump(doc, f, indent=2, ensure_ascii=False)

    # 4a. copy binary assets
    if write_content:
        glb_out = os.path.join(content_dir, "assets", "models", "imported")
        tex_out = os.path.join(content_dir, "assets", "textures", "imported")
        os.makedirs(glb_out, exist_ok=True)
        os.makedirs(tex_out, exist_ok=True)
        for m in ok_models:
            shutil.copy2(os.path.join(glb_dir, m["glb"]), glb_out)
        for t in os.listdir(tex_dir):
            shutil.copy2(os.path.join(tex_dir, t), tex_out)

    # 4b. model docs for character-like models (full clip map)
    model_docs = {}
    for m in ok_models:
        if "clip_map" not in m:
            continue
        doc = {
            "id": "imported." + m["name"],
            "schema": "model@1",
            "glbPath": f"assets/models/imported/{m['glb']}",
            # per-unit size from the map's Scaling Value (usca); collisionRadius
            # stays gameplay-driven and is deliberately NOT scaled with it.
            "scale": m.get("doc_scale", 1.0),
            "collisionRadius": 0.55,
            "clipMap": m["clip_map"],
        }
        if m.get("attach_points"):
            doc["attachPoints"] = m["attach_points"]
        if m.get("team_color_materials"):
            doc["teamTintMaterials"] = m["team_color_materials"]
        model_docs[m["name"]] = doc
        emit("models", doc)

    # 4c. shared projectiles for imported skillshots
    emit("projectiles", {"id": "imported.bolt", "schema": "projectile@1",
                         "speed": 22, "maxRange": 12, "hitRadius": 0.5,
                         "vfxKey": "fx.ember-bolt"})
    emit("projectiles", {"id": "imported.wave", "schema": "projectile@1",
                         "speed": 18, "maxRange": 12, "hitRadius": 0.9,
                         "pierce": True, "vfxKey": "fx.thorn"})

    # 4d. champions
    champions = []
    champions_nodraft = []
    used_models = set()
    for hid, hero in sorted(parsed["heroes"].items()):
        champ_id = "godie-" + hid.lower()
        model_slug = None
        if isinstance(hero.get("model"), str):
            model_slug = slug(
                hero["model"].replace("\\", "/").split("/")[-1].rsplit(".", 1)[0]
            )
        has_model = model_slug in model_docs
        model_key = ("imported." + model_slug) if has_model else "champ.sela"
        doc = hero_to_champion(hero, parsed["abilities"], champ_id, model_key, notes)
        if has_model:
            used_models.add(model_slug)
            emit("champions", doc)
            # embedded ability ids are hard refs into the abilities collection
            for slot_def in doc["abilities"].values():
                emit("abilities", {**slot_def, "schema": "ability@1"})
            champions.append(champ_id)
        else:
            notes.append(
                f"{champ_id} ({_clean(hero.get('name'))}): WC3 model "
                f"{hero.get('model') or hero['base'] + ' (stock)'} not recovered "
                "→ draft only (out/…/drafts)"
            )
            emit("champions", doc, valid=False)
            champions_nodraft.append(champ_id)
    print(f"      champions: {len(champions)} in content/, "
          f"{len(champions_nodraft)} draft-only")

    # 4d2. ORIGINAL-table heroes referenced by the random-hero roster.
    # These are standard Blizzard rawcodes modified in place (renamed, custom
    # stats/abilities).  Fields the map left untouched are filled from the
    # per-hero WC3 defaults table; heroes on Blizzard stock models get a
    # deterministic stand-in from the already-imported models
    # (原模型為暴雪內建,以現有模型代替 — flagged via the "standin-model" tag).
    champions_original = []
    standin_used: dict[str, str] = {}
    for code in roster:
        hero = parsed["heroes_original"].get(code)
        if hero is None:
            continue  # custom-table entry (handled above) or unknown rawcode
        champ_id = "godie-" + code.lower()
        if champ_id in champions_original:
            continue
        hero = apply_standard_defaults(hero)
        model_slug = None
        if isinstance(hero.get("model"), str):
            model_slug = slug(
                hero["model"].replace("\\", "/").split("/")[-1].rsplit(".", 1)[0]
            )
        standin = False
        if model_slug in model_docs:
            model_key = "imported." + model_slug
            used_models.add(model_slug)
        else:
            standin = True
            model_key = STANDIN_MODELS.get(code, "")
            standin_slug = model_key.removeprefix("imported.")
            if standin_slug in model_docs:
                used_models.add(standin_slug)
            else:
                # last resort: bundled placeholder champions' models
                rng = hero.get("attack_range") or 128
                model_key = "champ.thorne" if float(rng) <= 200 else "champ.sela"
        doc = hero_to_champion(hero, parsed["abilities"], champ_id, model_key,
                               notes)
        if standin:
            doc["tags"].append("standin-model")
            standin_used[champ_id] = model_key
            notes.append(
                f"{champ_id} ({_clean(hero.get('name'))}): 原模型為暴雪內建"
                f"({hero.get('model') or hero['base'] + ' (stock)'}),"
                f"以現有模型代替 → {model_key}"
            )
        emit("champions", doc)
        for slot_def in doc["abilities"].values():
            emit("abilities", {**slot_def, "schema": "ability@1"})
        champions_original.append(champ_id)
    print(f"      original-table champions: {len(champions_original)} "
          f"({len(standin_used)} on stand-in models)")

    # 4e. skins: leftover character models whose name extends a used model's
    skins = []
    champ_by_model = {}
    for hid, hero in parsed["heroes"].items():
        if isinstance(hero.get("model"), str):
            ms = slug(hero["model"].replace("\\", "/").split("/")[-1].rsplit(".", 1)[0])
            if ms in used_models:
                champ_by_model[ms] = "godie-" + hid.lower()
    for mslug in sorted(model_docs):
        if mslug in used_models:
            continue
        for base_slug, champ_id in champ_by_model.items():
            if len(base_slug) >= 5 and (
                mslug.startswith(base_slug) or base_slug.startswith(mslug)
            ):
                skin_doc = {
                    "id": f"skin.{champ_id}.{mslug}",
                    "schema": "skin@1",
                    "championId": champ_id,
                    "name": mslug.replace("-", " ").title(),
                    "description": "Imported WC3 alternate form",
                    "mcoinPrice": 0,
                    "modelKey": "imported." + mslug,
                }
                emit("skins", skin_doc)
                skins.append(skin_doc["id"])
                break
    print(f"      skins: {len(skins)}")

    # 4f. items
    items = []
    for iid, item in sorted(parsed["items"].items()):
        doc = item_to_draft(item, parsed["abilities"], "godie-" + iid.lower(), notes)
        emit("items", doc)
        items.append(doc["id"])
    print(f"      items: {len(items)}")

    # 4g. arena
    wpm = open(os.path.join(raw_dir, "war3map.wpm"), "rb").read()
    doo_path = os.path.join(raw_dir, "war3map.doo")
    doo = open(doo_path, "rb").read() if os.path.exists(doo_path) else None
    tree = None
    for cand in ("japanesecherry",):
        if cand in models_by_slug:
            tree = f"assets/models/imported/{cand}.glb"
    decor_models = {}
    for ch in "ALNWTBVYZCDGIF":
        decor_models[ch] = tree or "assets/models/props/pillar.glb"
    decor_models["O"] = "assets/models/props/pillar.glb"
    arena_doc, arena_rep = build_arena(
        wpm, doo, decor_models, "arena.godie",
        _clean(parsed["wts"].get("3", "GoDie Arena")) or "GoDie Arena",
    )
    emit("arenas", arena_doc)
    report["arena"] = arena_rep

    # ---- write reports ------------------------------------------------------
    print("[5/5] writing reports …")
    report["champions"] = champions
    report["champions_draft_only"] = champions_nodraft
    report["champions_original"] = champions_original
    report["standin_models"] = standin_used
    if pool_info:
        report["random_pool"] = {"var": pool_info["var"],
                                 "count": pool_info["count"],
                                 "source": pool_info.get("source")}
    report["skins"] = skins
    report["items"] = items
    report["models_with_docs"] = sorted(model_docs)

    # attachment + material-fidelity summary (fix #3)
    baked = [{"model": m["name"], **b}
             for m in ok_models for b in m.get("attachments_baked", [])]
    skipped_att = [{"model": m["name"], "path": p}
                   for m in ok_models for p in m.get("attachments_skipped", [])]
    report["attachments_baked"] = baked
    report["attachments_skipped"] = skipped_att
    report["team_tint_models"] = sorted(
        m["name"] for m in ok_models if m.get("team_color_materials"))
    report["dropped_glow_models"] = sorted(
        m["name"] for m in ok_models if m.get("dropped_glow_materials"))
    # size spread for the report
    sized = [(m["name"], m.get("usca", 1.0), m.get("effective_height"))
             for m in ok_models if "clip_map" in m and m.get("effective_height")]
    sized.sort(key=lambda t: t[2])
    report["size_spread"] = {
        "smallest": sized[:3], "largest": sized[-3:][::-1]} if sized else {}
    with open(os.path.join(out_dir, "import_report.json"), "w",
              encoding="utf-8") as f:
        json.dump(report, f, indent=1, ensure_ascii=False)

    _write_inventory_md(out_dir, inv, mrep)
    print("done.")
    return 0


def _write_inventory_md(out_dir: str, inv: dict, mrep: list[dict]) -> None:
    lines = ["# Import inventory — " + inv["map"], ""]
    lines.append(f"- MPQ block-table entries: {inv['block_table_entries']}")
    okc = sum(1 for v in inv["files"].values() if v["status"] == "ok")
    lines.append(f"- files recovered: {okc}")
    lines.append(
        f"- block entries with unrecoverable names: {inv['unrecovered_blocks']}"
        " (MPQ stores only name hashes; no (listfile)/war3map.imp in this"
        " protected map)"
    )
    lines.append("")
    lines.append("| file | size (bytes) | recovered via | status |")
    lines.append("| --- | --- | --- | --- |")
    for name, v in sorted(inv["files"].items()):
        lines.append(
            f"| `{name}` | {v.get('size','?')} | {v['how']} | {v['status']} |"
        )
    lines.append("")
    lines.append("## Model conversion")
    lines.append("")
    lines.append("| model | kind | raw height | scale | glb bytes | clips |")
    lines.append("| --- | --- | --- | --- | --- | --- |")
    for m in mrep:
        if m["status"] != "ok":
            lines.append(f"| `{m['source']}` | ERROR {m.get('error','')} | | | | |")
            continue
        lines.append(
            f"| `{m['source']}` | {m['kind']} | {m.get('raw_height','')} | "
            f"{m.get('scale_factor','')} | {m.get('glb_size','')} | "
            f"{len(m.get('anim_names',[]))} |"
        )
    with open(os.path.join(out_dir, "inventory.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
