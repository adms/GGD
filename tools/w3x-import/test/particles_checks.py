#!/usr/bin/env python3
"""Assertions for the standalone particle parser (w3xlib/particles.py) and the
extract_particles.py doc generator, run against the real map extraction in
out/GoDieEX22s (skips cleanly when that dir is absent, e.g. fresh checkout).

Standalone on purpose: NOT wired into w3x-import.test.ts (that file may be
concurrently edited by the animation task); run directly:

    python3 test/particles_checks.py
"""

from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))

from w3xlib.particles import parse_particles  # noqa: E402

OUT = os.path.join(HERE, "..", "out", "GoDieEX22s")
RAW = os.path.join(OUT, "raw")
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
VFX = os.path.join(REPO, "content", "vfx")


def main() -> int:
    if not os.path.isdir(RAW):
        print("SKIP: no out/GoDieEX22s/raw (map not imported yet)")
        return 0

    # -- parser invariants on a known model --------------------------------
    saber = parse_particles(open(os.path.join(RAW, "HeroSaber.mdx"), "rb").read())
    assert len(saber.emitters2) == 2, saber.emitters2
    assert len(saber.ribbons) == 1
    assert len(saber.events) == 13
    p0 = saber.emitters2[0]
    assert p0.name == "BlizParticle01"
    assert p0.filter_mode == 1  # additive
    assert abs(p0.emission_rate - 250.0) < 1e-3
    assert p0.head_or_tail == 2  # both -> stretched
    assert saber.node_name(saber.emitters2[1].parent_id) == "Bone_Hand_L"
    rb = saber.ribbons[0]
    assert saber.node_name(rb.parent_id) == "Weapon"
    assert 0 <= rb.material_id < len(saber.materials)
    assert any(t.path.endswith("RibbonBlur1.blp") for t in saber.textures)
    print("PASS particles: HeroSaber PRE2/RIBB/EVTS fixed-block fields")

    # -- every mdx in the map parses without raising -----------------------
    n_models = n_p2 = n_rb = n_ev = 0
    for f in sorted(os.listdir(RAW)):
        if not f.lower().endswith(".mdx"):
            continue
        m = parse_particles(open(os.path.join(RAW, f), "rb").read())
        n_models += 1
        n_p2 += len(m.emitters2)
        n_rb += len(m.ribbons)
        n_ev += len(m.events)
        for em in m.emitters2:  # sane fixed-block decode (misparse detector)
            assert 0 <= em.filter_mode <= 5, (f, em.name, em.filter_mode)
            assert 1 <= em.rows <= 64 and 1 <= em.cols <= 64, (f, em.name)
            assert -1e5 < em.lifespan < 1e5, (f, em.name, em.lifespan)
    assert n_models >= 100 and n_p2 >= 200 and n_rb >= 40, (n_models, n_p2, n_rb)
    print(f"PASS particles: all {n_models} models parse "
          f"({n_p2} PRE2, {n_rb} RIBB, {n_ev} EVTS)")

    # -- generated docs (when extract_particles.py has been run) -----------
    docs = [f for f in os.listdir(VFX)
            if f.startswith("godie-") and f.endswith(".json")]
    if not docs:
        print("SKIP: no godie-* docs in content/vfx (extractor not run)")
        return 0
    for f in docs:
        d = json.load(open(os.path.join(VFX, f)))
        assert d["id"] + ".json" == f
        assert d["schema"] in ("vfx@1", "ribbon@1"), f
        assert d["blendMode"] in ("additive", "alpha", "modulate", "alphaKey")
        tex = d.get("texture")
        if tex:
            assert os.path.isfile(os.path.join(REPO, "content", tex)), (f, tex)
        if d["schema"] == "vfx@1":
            assert len(d.get("colorStops", [])) <= 4
            assert len(d.get("sizeStops", [])) <= 4
            assert d["lifetimeSec"]["min"] > 0
    amb = json.load(open(os.path.join(REPO, "content", "config",
                                      "ambient-vfx.json")))
    ids = {json.load(open(os.path.join(VFX, f)))["id"] for f in docs}
    for arr in amb["bindings"].values():
        for b in arr:
            assert b["vfx"] in ids, b
    print(f"PASS particles: {len(docs)} generated docs well-formed, "
          f"ambient bindings resolve")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
