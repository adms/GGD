#!/usr/bin/env python3
"""Assertions against the synthetic fixture .w3x — exercised by the vitest
suite (see w3x-import.test.ts). Each PASS line maps to a TODO test_id beacon.

Usage: fixture_checks.py <fixture.w3x> <workdir>
"""

from __future__ import annotations

import json
import os
import struct
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))

from w3xlib.mpq import W3XArchive  # noqa: E402
from w3xlib.objdata import parse_object_file  # noqa: E402
from w3xlib.wts import parse_wts, resolve  # noqa: E402
from w3xlib.mdx import parse_mdx  # noqa: E402


def main(fixture: str, workdir: str) -> int:
    a = W3XArchive(fixture)

    # -- extract round-trip: encrypted + FIX_KEY + zlib + uncompressed -------
    wts_raw = a.read_file("war3map.wts")
    w3u_raw = a.read_file("war3map.w3u")  # encrypted+zlib
    w3a_raw = a.read_file("war3map.w3a")  # encrypted+FIX_KEY+zlib
    assert wts_raw and "測試英雄" in wts_raw.decode("utf-8"), "wts content"
    assert w3u_raw and struct.unpack_from("<i", w3u_raw)[0] == 2, "w3u version"
    assert w3a_raw and struct.unpack_from("<i", w3a_raw)[0] == 2, "w3a version"
    print("PASS w3x-extract-roundtrip")

    # -- PKWARE DCL explode round-trip ---------------------------------------
    imploded = a.read_file("implode.bin")
    assert imploded == b"PKWARE explode round-trip! " * 40, "explode round-trip"
    print("PASS w3x-explode-pkware")

    # -- w3u object-data parser ----------------------------------------------
    w3u = parse_object_file(w3u_raw, has_levels=False)
    assert len(w3u["custom"]) == 1
    hero = w3u["custom"][0]
    assert hero.base_id == "Hpal" and hero.new_id == "H001"
    assert hero.get("uhpm") == 200 and hero.get("ustr") == 20
    assert hero.get("umdl") == "fixhero.mdx"
    w3a = parse_object_file(w3a_raw, has_levels=True)
    ab = w3a["custom"][0]
    assert ab.get("acdn", level=2) == 8.0, "leveled mod"
    assert ab.levels("Htb1") == {1: 100.0, 2: 180.0, 3: 260.0}, "data col"
    print("PASS w3x-w3u-parse")

    # -- "EX 技能" gate: ability Requirements (`areq`) reference the R00R tech,
    #    and a hero unit OWNS that R00R-gated ability (= per-hero EX at lvl 30).
    areq_vals = [m.value for m in ab.mods if m.code == "areq"]
    assert any(isinstance(v, str) and "R00R" in v for v in areq_vals), f"areq R00R: {areq_vals}"
    r00r_gated = {
        e.obj_id
        for e in (w3a["original"] + w3a["custom"])
        if any(m.code == "areq" and isinstance(m.value, str) and "R00R" in m.value for m in e.mods)
    }
    assert "A001" in r00r_gated, r00r_gated
    # the hero (uhab "A001,Aamk") owns the R00R-gated ability
    hero_abils = (hero.get("uhab") or "").split(",")
    assert any(a in r00r_gated for a in hero_abils), (hero_abils, r00r_gated)
    print("PASS w3x-r00r-parse")

    # -- ORIGINAL-table entry (modified-in-place standard hero) ---------------
    assert len(w3u["original"]) == 1
    orig = w3u["original"][0]
    assert orig.base_id == "Hblm" and orig.new_id == ""
    assert orig.obj_id == "Hblm"
    assert orig.get("uhpm") == 250 and orig.get("ustr") == 19
    assert orig.get("uhab") == "A001,Aamk"
    print("PASS w3x-original-table-hero")

    # -- TRIGSTR resolution ---------------------------------------------------
    wts = parse_wts(wts_raw)
    assert resolve(hero.get("unam"), wts) == "測試英雄"
    assert resolve(ab.get("anam"), wts) == "風暴之鎚"
    print("PASS w3x-trigstr-resolve")

    # -- MDX header/chunk parse ----------------------------------------------
    mdx_raw = a.read_file("fixhero.mdx")
    m = parse_mdx(mdx_raw)
    assert m.name == "fixhero"
    assert [s.name for s in m.sequences] == [
        "Stand", "Walk", "Attack", "Death", "Stand Hit"]
    assert len(m.geosets) == 1 and len(m.geosets[0].vertices) == 3
    assert m.nodes[0].translation and len(m.nodes[0].translation.keys) == 2
    # ATCH node (objId 1) carries a separate attachment model path
    atch = [n for n in m.nodes.values() if n.kind == "attachment"]
    assert len(atch) == 1 and atch[0].attachment_path == "weapon.mdx", atch
    print("PASS w3x-mdx-header-parse")

    # -- full pipeline on the fixture (import_w3x.py, no content writes) -----
    out = os.path.join(workdir, "out")
    r = subprocess.run(
        [sys.executable, os.path.join(HERE, "..", "import_w3x.py"), fixture,
         "--out", out, "--no-content"],
        capture_output=True, text=True)
    assert r.returncode == 0, f"pipeline failed:\n{r.stdout}\n{r.stderr}"

    # gltf writer validity: GLB container + JSON chunk + accessor sanity
    glb_path = os.path.join(out, "glb", "fixhero.glb")
    glb = open(glb_path, "rb").read()
    magic, ver, total = struct.unpack_from("<III", glb, 0)
    assert magic == 0x46546C67 and ver == 2 and total == len(glb)
    jlen = struct.unpack_from("<I", glb, 12)[0]
    gj = json.loads(glb[20 : 20 + jlen])
    assert gj["meshes"] and gj["skins"] and len(gj["animations"]) >= 1
    for acc in gj["accessors"]:
        assert acc["count"] > 0
    # position accessor exists with min/max
    pos_acc = gj["accessors"][gj["meshes"][0]["primitives"][0]["attributes"]["POSITION"]]
    assert "min" in pos_acc and "max" in pos_acc
    print("PASS w3x-gltf-writer-valid")

    # -- animation sampler timing --------------------------------------------
    # WC3 keys live in MILLISECONDS on a GLOBAL timeline shared by every
    # sequence; glTF sampler inputs must be SECONDS rebased to each clip's
    # start. Wrong here == twitching/spasming playback.
    bin_off = 20 + jlen + 8
    bin_chunk = glb[bin_off:]

    def acc_floats(i):
        acc = gj["accessors"][i]
        view = gj["bufferViews"][acc["bufferView"]]
        comps = {"SCALAR": 1, "VEC3": 3, "VEC4": 4, "MAT4": 16}[acc["type"]]
        off = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        n = acc["count"] * comps
        return struct.unpack_from("<%df" % n, bin_chunk, off)

    seq_dur = {"Stand": 1.0, "Walk": 0.9, "Attack": 0.9,
               "Death": 0.9, "Stand Hit": 0.9}
    anims = {an["name"]: an for an in gj["animations"]}
    assert set(seq_dur) <= set(anims), sorted(anims)
    for name, an in anims.items():
        dur = seq_dur[name]
        for s in an["samplers"]:
            times = acc_floats(s["input"])
            assert times[0] >= 0.0, (name, times)          # rebased to clip start
            assert all(b > a for a, b in zip(times, times[1:])), \
                (name, "sampler times must be strictly increasing", times)
            assert times[-1] <= dur + 1e-3, (name, "key outside clip", times)

    def channel(an, path):
        for ch in an["channels"]:
            if ch["target"]["path"] == path:
                return an["samplers"][ch["sampler"]]
        return None

    # Walk rotation: global keys 1100/1500(dup)/2000 → rebased 0/0.4/0.9,
    # duplicate frame collapsed keeping the LAST value ((0,1,0,0) → glTF y/z
    # swap makes |y|≈0, |z|≈1)
    walk_rot = channel(anims["Walk"], "rotation")
    times = acc_floats(walk_rot["input"])
    assert len(times) == 3 and abs(times[1] - 0.4) < 1e-4, times
    q = acc_floats(walk_rot["output"])[4:8]
    assert abs(abs(q[2]) - 1.0) < 1e-3, ("dup frame must keep last value", q)
    # Death has NO rotation keys of its own → 1-key STEP hold, not a stale
    # pose carried over from whatever clip played before
    death_rot = channel(anims["Death"], "rotation")
    assert death_rot is not None and death_rot["interpolation"] == "STEP"
    assert gj["accessors"][death_rot["input"]]["count"] == 1
    # Walk translation: bone keys only in Stand → held (1 key), not empty
    walk_tr = channel(anims["Walk"], "translation")
    assert walk_tr is not None and gj["accessors"][walk_tr["input"]]["count"] == 1
    print("PASS w3x-anim-timing")

    # -- clipMap auto-mapping -------------------------------------------------
    models_report = json.load(open(os.path.join(out, "models_report.json")))
    fix = [m for m in models_report if m["source"] == "fixhero.mdx"][0]
    assert fix["kind"] == "hero"
    assert fix["clip_map"] == {
        "idle": "Stand", "run": "Walk", "attack": "Attack",
        "cast": "Attack", "hurt": "Stand Hit", "death": "Death",
    }, fix.get("clip_map")
    print("PASS w3x-clipmap-automap")

    # -- draft generation on fixture data ------------------------------------
    champs = os.listdir(os.path.join(out, "drafts", "champions"))
    assert "godie-h001.json" in champs, champs
    champ = json.load(open(os.path.join(out, "drafts", "champions",
                                        "godie-h001.json")))
    assert champ["name"] == "測試英雄 - 小玉", champ["name"]
    assert champ["abilities"]["Q"]["name"] == "風暴之鎚"
    assert champ["abilities"]["Q"]["cooldown"][:3] == [9.0, 8.0, 7.0]
    assert champ["abilities"]["Q"]["effects"][0]["kind"] == "damage"
    assert champ["abilities"]["Q"]["effects"][0]["amount"]["perRank"][:3] == \
        [100.0, 180.0, 260.0]
    arena = json.load(open(os.path.join(out, "drafts", "arenas",
                                        "arena.godie.json")))
    assert len(arena["zones"]) == 2 and arena["zones"][0]["obstacles"]
    items = json.load(open(os.path.join(out, "drafts", "items",
                                        "godie-i001.json")))
    assert items["cost"] == 750 and items["name"] == "測試道具"
    print("PASS w3x-import-pipeline")

    # -- rawMods passthrough: no field code is dropped (task #56) -------------
    # The record builders read a WHITELIST of ~27 unit / ~11 ability / ~8 item
    # codes into typed fields; historically every OTHER code silently vanished
    # (in the real GoDie w3u only 27 of 180 distinct codes had a typed home, so
    # 153 were dropped per object). They are now carried through verbatim under
    # `rawMods`, keyed by the raw 4-char code. Assert the WHOLE set survives.
    from w3xlib.stats import (  # noqa: E402
        UNIT_FIELD_CODES, ABILITY_FIELD_CODES, ITEM_FIELD_CODES,
    )
    from w3xlib.objdata import _data_col_of  # noqa: E402

    heroes = json.load(open(os.path.join(out, "parsed", "heroes.json")))
    hrec = heroes["H001"]
    hraw = hrec["rawMods"]
    hero_codes = {m.code for m in hero.mods}
    # count-based: EVERY code on the object is retained (typed OR rawMods), i.e.
    # 180/180 — not the ~30/180 the whitelist alone kept.
    retained = set(hraw) | (UNIT_FIELD_CODES & hero_codes)
    assert retained == hero_codes, ("dropped w3u codes", hero_codes - retained)
    assert len(hero_codes) >= 180, ("fixture must be representative", len(hero_codes))
    assert not (set(hraw) & UNIT_FIELD_CODES), "typed codes leaked into rawMods"
    # the previously-dropped majority is now the bulk of what survives
    assert len(hraw) >= 150, ("rawMods should carry the unknown majority", len(hraw))
    # a MIX of known + unknown on one object: known keep their TYPED home ...
    assert hrec["hp"] == 200 and hrec["str"] == 20          # uhpm / ustr typed
    assert hrec["model"] == "fixhero.mdx"                    # umdl typed
    # ... unknown codes land in rawMods with their value intact, not duplicated
    assert hraw.get("x000") == 1001, hraw.get("x000")
    assert "usca" not in hraw and "uhpm" not in hraw

    # abilities: an unknown non-data code is kept; a DATA-COLUMN code is not
    # echoed into rawMods (it already lives in the typed `data` view).
    abilities = json.load(open(os.path.join(out, "parsed", "abilities.json")))
    arec = abilities["A001"]
    araw = arec["rawMods"]
    assert araw.get("areq") == "R00R", araw                 # unknown field kept
    assert "Htb1" not in araw, "data column leaked into ability rawMods"
    assert arec["data"].get("1"), "data column lost from typed view"
    assert not (set(araw) & ABILITY_FIELD_CODES)
    assert any(_data_col_of(m) for m in ab.mods if m.code == "Htb1")

    # items: an unknown code (ilev has no typed field here) is kept
    items_parsed = json.load(open(os.path.join(out, "parsed", "items.json")))
    iraw = items_parsed["I001"]["rawMods"]
    assert iraw.get("ilev") == 3, iraw
    assert not (set(iraw) & ITEM_FIELD_CODES)
    print("PASS w3x-rawmods-passthrough")

    # -- random-hero pool extraction + original-table champion ---------------
    pool = json.load(open(os.path.join(out, "parsed", "random_pool.json")))
    # hex index $3 must land in order; unknown rawcode 'Hxyz' stays listed
    assert pool["codes"] == ["H001", "Hblm", "Hxyz"], pool["codes"]
    assert pool["count"] == 3 and pool["count_var"] == "Qq"
    assert pool["gaps"] == []
    heroes_orig = json.load(open(os.path.join(out, "parsed",
                                              "heroes_original.json")))
    assert heroes_orig["Hblm"]["name"] == "測試原始英雄"
    champ = json.load(open(os.path.join(out, "drafts", "champions",
                                        "godie-hblm.json")))
    assert champ["name"] == "測試原始英雄"
    # untouched fields filled from the WC3 standard-hero defaults table:
    # Blood Mage → ranged 600, and no custom model → stand-in fallback
    assert champ["attackType"] == "ranged"
    assert champ["modelKey"] == "champ.sela"
    assert "standin-model" in champ["tags"]
    # modified fields win over defaults: hp = (250 + 25*19) * 0.8
    assert champ["baseStats"]["maxHealth"] == 580, champ["baseStats"]
    assert champ["abilities"]["Q"]["name"] == "風暴之鎚"
    assert champ["abilities"]["Q"]["cooldown"][:3] == [9.0, 8.0, 7.0]
    # unknown pool rawcode 'Hxyz' must NOT produce a champion
    assert not os.path.exists(os.path.join(out, "drafts", "champions",
                                           "godie-hxyz.json"))
    print("PASS w3x-pool-extract")

    # -- unified name: title 稱號 + proper name 名字 → one display string -----
    from w3xlib.drafts import combined_name, model_scale  # noqa: E402
    assert combined_name({"name": "火霧戰士", "proper_name": "夏娜"}) == "火霧戰士 - 夏娜"
    assert combined_name({"name": "只有稱號"}) == "只有稱號"          # no separator
    assert combined_name({"proper_name": "只有名字"}) == "只有名字"
    assert combined_name({"name": "同", "proper_name": "同"}) == "同"  # dedupe
    # H001 combined its unam (測試英雄) with its upro (小玉)
    h001 = json.load(open(os.path.join(out, "drafts", "champions",
                                       "godie-h001.json")))
    assert h001["name"] == "測試英雄 - 小玉", h001["name"]
    # the original-table Hblm has only a title → single name, no dangling dash
    hblm = json.load(open(os.path.join(out, "drafts", "champions",
                                       "godie-hblm.json")))
    assert hblm["name"] == "測試原始英雄" and " - " not in hblm["name"]
    print("PASS w3x-name-combine")

    # -- per-unit size from the map's Scaling Value (usca) -------------------
    fixm = [m for m in models_report if m["source"] == "fixhero.mdx"][0]
    assert abs(fixm["usca"] - 1.5) < 1e-3, fixm.get("usca")
    exp_scale, exp_h = model_scale(1.5, fixm["height"])
    assert abs(fixm["doc_scale"] - exp_scale) < 1e-3, fixm
    assert 2.4 < fixm["effective_height"] < 2.6, fixm  # 1.7 * 1.5 = 2.55
    assert fixm["doc_scale"] > 1.0  # bigger than a usca=1.0 hero
    # clamp: a giant usca never exceeds 3.0 units effective
    assert model_scale(10.0, 1.7)[1] == 3.0
    assert model_scale(0.2, 1.7)[1] == 0.6
    print("PASS w3x-usca-scale")

    # -- alpha / team-colour / additive material selection ------------------
    glb = open(glb_path, "rb").read()
    jlen = struct.unpack_from("<I", glb, 12)[0]
    gj = json.loads(glb[20:20 + jlen])
    modes = [mt.get("alphaMode", "OPAQUE") for mt in gj["materials"]]
    names = [mt.get("name", "") for mt in gj["materials"]]
    assert "BLEND" in modes, modes                       # fm2 detail layer
    assert any(n.startswith("TeamColor") for n in names), names
    assert "KHR_materials_emissive_strength" in gj.get("extensionsUsed", [])
    # the model report flags the team-tint material for the client to recolour
    assert fixm.get("team_color_materials"), fixm
    # the body's opaque texture layer stays OPAQUE (not see-through)
    assert "OPAQUE" in modes
    print("PASS w3x-alpha-material")

    # -- separate attachment model baked into the hero glb ------------------
    baked = fixm.get("attachments_baked")
    assert baked and baked[0]["path"] == "weapon.mdx", fixm.get("attachments_baked")
    assert baked[0]["geosets"] == 3, baked
    # body geoset + 3 baked weapon geosets = 4 primitives in one mesh
    prims = gj["meshes"][0]["primitives"]
    assert len(prims) == 4, len(prims)
    print("PASS w3x-attach-bake")

    # -- effect-geoset guard: stray beams/rings/glow quads are dropped -------
    # (task #17) classify_geosets keeps solid body/skin, drops particle-emitter
    # geosets baked as geometry, and measures body height from the KEPT geosets.
    from w3xlib.mdx import Geoset, Layer, MDXModel, Material, Texture
    from w3xlib.gltf import classify_geosets

    def _geo(nverts, zlo, zhi, xy, mat):
        # nverts vertices spanning z(up) in [zlo,zhi], x/y in [-xy,xy]
        vs = []
        for i in range(nverts):
            t = i / max(1, nverts - 1)
            vs.append((xy if i % 2 else -xy, xy if i % 3 else -xy,
                       zlo + t * (zhi - zlo)))
        return Geoset(vs, [], [], [], [], [], mat)

    tm = MDXModel(name="synthetic")
    tm.textures = [Texture(0, "body.blp"), Texture(2, ""), Texture(0, "Flare.blp")]
    tm.materials = [
        Material([Layer(0, 0, 0, 1.0)]),   # mat0 opaque body/skin
        Material([Layer(3, 0, 1, 1.0)]),   # mat1 team-glow (tex1 rid2) — invisible
        Material([Layer(3, 0, 2, 1.0)]),   # mat2 additive glow (tex2 rid0 effect)
    ]
    tm.geosets = [
        _geo(400, 0, 100, 10, 0),   # 0 body: tall + opaque                 → keep
        _geo(6, 5, 150, 3, 1),      # 1 beam: team-glow spanning past body   → DROP
        _geo(12, 0, 10, 200, 1),    # 2 ground ring: team-glow far off-axis  → DROP
        _geo(8, 40, 60, 5, 2),      # 3 held glow: additive, IN silhouette   → keep
        _geo(4, 120, 130, 4, 2),    # 4 floating quad: additive above body   → DROP
    ]
    info, (bmin, bmax) = classify_geosets(tm, 1.0)
    dropped = {x["index"] for x in info if x["drop"]}
    assert dropped == {1, 2, 4}, dropped
    # body height = union of the NON-effect geosets = the body geoset (0..100)
    assert abs((bmax[1] - bmin[1]) - 100.0) < 1e-6, (bmin, bmax)
    # the in-silhouette additive glow IS an effect material but is NOT dropped
    held = next(x for x in info if x["index"] == 3)
    assert held["effect_material"] and not held["drop"], held
    # an opaque body geoset is never an effect
    assert not info[0]["effect_material"], info[0]
    # real niya.mdx (if the source is present): the 8.5x beam geoset is dropped,
    # the real body geoset kept, and body height is the tall body (~137) not the
    # 21u cape the old max-vertex heuristic mistook for the body
    niya_src = os.path.join(HERE, "..", "out", "GoDieEX22s-src", "raw", "niya.mdx")
    if os.path.exists(niya_src):
        nm = parse_mdx(open(niya_src, "rb").read())
        ni, (nlo, nhi) = classify_geosets(nm, 1.0)
        ndrop = {x["index"] for x in ni if x["drop"]}
        assert 3 in ndrop and 2 in ndrop, ("niya effect geosets not dropped", ndrop)
        assert 0 not in ndrop, "niya real body geoset0 wrongly dropped"
        assert (nhi[1] - nlo[1]) > 100, ("niya body height too small", nhi[1] - nlo[1])
    print("PASS w3x-effect-geoset-guard")

    a.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1], sys.argv[2]))
