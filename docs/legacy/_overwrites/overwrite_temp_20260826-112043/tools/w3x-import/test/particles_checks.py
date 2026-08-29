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
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))

from extract_particles import (  # noqa: E402
    DEFAULT_SCALE,
    emission_disc_radius,
    slug,
)
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
    # GH#668: ambient-vfx.json also carries HAND-AUTHORED attach.* bindings
    # (GH#564) — those docs are not extraction artifacts, so they are not in
    # `docs`, but a binding to one must still resolve to a real file. Widen the
    # resolution set to the attach.* family ONLY (⛔ not .*): a typo'd godie-*
    # binding must keep failing against the generated set.
    ids |= {json.load(open(os.path.join(VFX, f)))["id"]
            for f in os.listdir(VFX)
            if f.startswith("attach.") and f.endswith(".json")}
    for arr in amb["bindings"].values():
        for b in arr:
            assert b["vfx"] in ids, b
    print(f"PASS particles: {len(docs)} generated docs well-formed, "
          f"ambient bindings resolve")

    rc = check_emitter_radius_reading()
    return rc


# ---------------------------------------------------------------------------
# emitter radius: the reading, its binary proof, and whether content matches
# ---------------------------------------------------------------------------

# The sword that settles the argument. See extract_particles.emission_disc_radius.
# These are BINARY facts, re-read from the .mdx on every run — if a future parser
# change makes them stop being true, the reading they justify is no longer
# justified and this must fail loudly rather than be quietly edited.
SWORD_MDX = "1hswd_01.mdx"
SWORD_EMITTER = "Particle_2"


def _geoset0_bounds(data: bytes):
    """First GEOS vertex AABB, straight from VRTX. No mdx.py dependency."""
    pos = 4
    while pos + 8 <= len(data):
        tag = data[pos:pos + 4]
        size = struct.unpack_from("<I", data, pos + 4)[0]
        body = pos + 8
        if tag == b"GEOS":
            p = body + 4  # skip the geoset's inclusive size
            assert data[p:p + 4] == b"VRTX", data[p:p + 4]
            n = struct.unpack_from("<I", data, p + 4)[0]
            vs = [struct.unpack_from("<3f", data, p + 8 + 12 * i) for i in range(n)]
            return (min(v[0] for v in vs), max(v[0] for v in vs))
        pos = body + size
    return None


def _model_bbox_span(data: bytes) -> float:
    """Largest axis of the model's own authored MODL extent (0 if not authored).

    MODL body: name[80], animFileName[260], boundsRadius f32, min f32[3],
    max f32[3], blendTime u32."""
    pos = 4
    while pos + 8 <= len(data):
        tag = data[pos:pos + 4]
        size = struct.unpack_from("<I", data, pos + 4)[0]
        if tag == b"MODL":
            v = struct.unpack_from("<7f", data, pos + 8 + 80 + 260)
            spans = [v[4] - v[1], v[5] - v[2], v[6] - v[3]]
            return max(spans) if min(spans) > 0 else 0.0
        pos = pos + 8 + size
    return 0.0


def check_emitter_radius_reading() -> int:
    """Three checks, in escalating scope.

    1. PROOF — re-derive from the binary that PRE2 Width/Length are FULL side
       lengths (spawn is +/- half about the node), not radii.
    2. CONTRACT — the TS runtime path must still compute the same thing.
    3. CONTENT — are the shipped docs actually on the corrected reading?

    (3) used to be non-fatal — a REGENERATION PENDING banner — because the
    corpus was knowingly stale and content/vfx/** belonged to another lane.
    2026-08-02 regenerated it in place, so the exemption expired with it and
    this now FAILS. A warning that is expected to appear is not a signal; the
    only reason it was survivable was that the thing it warned about was known,
    and it stopped being known the moment it was fixed.
    """
    # -- 1. proof, from the bytes ------------------------------------------
    data = open(os.path.join(RAW, SWORD_MDX), "rb").read()
    m = parse_particles(data)
    em = next(e for e in m.emitters2 if e.name == SWORD_EMITTER)
    lo, hi = _geoset0_bounds(data)
    mesh_len = hi - lo
    pivot_x = em.pivot[0]
    assert abs(em.width - 3.30) < 0.01 and abs(em.length - 50.0) < 0.01, em
    assert abs(lo - -14.28) < 0.01 and abs(hi - 67.67) < 0.01, (lo, hi)
    assert abs(pivot_x - 40.40) < 0.01, pivot_x
    full_lo, full_hi = pivot_x - em.length / 2, pivot_x + em.length / 2
    half_lo, half_hi = pivot_x - em.length, pivot_x + em.length
    # full-extent reading: the glint strip sits ON the blade
    assert lo < full_lo and full_hi < hi, (full_lo, full_hi, lo, hi)
    # half-extent reading: it shoots 22.7 units off the TIP into thin air, runs
    # back past the crossguard onto the grip, and is itself longer (100.0) than
    # the entire sword (81.95) — i.e. it cannot be what the artist authored.
    assert half_hi > hi, (half_hi, hi)
    assert half_lo < 10.0, half_lo  # back past the crossguard, onto the grip
    assert 2 * em.length > mesh_len, (2 * em.length, mesh_len)
    print(f"PASS radius proof: {SWORD_MDX}/{SWORD_EMITTER} Length={em.length} on a "
          f"{mesh_len:.2f}-unit mesh, pivot x={pivot_x:.2f} -> full-extent strip "
          f"[{full_lo:.2f},{full_hi:.2f}] fits the blade; half-extent strip "
          f"[{half_lo:.2f},{half_hi:.2f}] escapes the model")

    # corpus form of the same argument
    viol_full = viol_half = 0
    for f in sorted(os.listdir(RAW)):
        if not f.lower().endswith(".mdx"):
            continue
        d = open(os.path.join(RAW, f), "rb").read()
        span = _model_bbox_span(d)
        if span <= 0:
            continue
        for e in parse_particles(d).emitters2:
            w = max(e.width, e.length)
            if w <= 0:
                continue
            viol_full += 1 if w > span else 0
            viol_half += 1 if 2 * w > span else 0
    assert viol_full == 0, viol_full
    assert viol_half > 0, "corpus no longer discriminates the two readings"
    print(f"PASS radius proof: corpus-wide, {viol_full} emitters escape their own "
          f"model bbox under the full-extent reading vs {viol_half} under the "
          f"half-extent reading")

    # -- 2. cross-language contract ----------------------------------------
    # Python (offline extractor) and TS (runtime W3xEmitterRig) both turn the
    # same PRE2 block into a vfx@1 `emitter.radius`. They MUST agree. There is
    # no import that can enforce that across languages, so this greps.
    ts = os.path.join(REPO, "apps", "client", "src", "render", "vfx", "w3xEmitter.ts")
    src = open(ts).read()
    need = "(Math.max(finite(em.width), finite(em.length)) / 2) * scale"
    assert need in src, (
        f"{ts} no longer computes the emission radius as {need!r}. "
        "It and extract_particles.emission_disc_radius are the SAME reading of "
        "the same bytes — change both or neither.")
    print("PASS radius contract: w3xEmitter.ts and emission_disc_radius agree")
    print("     (stronger, runs both languages on all 228 emitters: "
          "python3 test/emitter_radius_crosscheck.py)")

    # -- 3. is shipped content on the corrected reading? --------------------
    scale_by_source = {}
    if os.path.isfile(os.path.join(OUT, "models_report.json")):
        for e in json.load(open(os.path.join(OUT, "models_report.json"))):
            if e.get("source") and e.get("scale_factor"):
                scale_by_source[e["source"].lower()] = float(e["scale_factor"])
    # `agnostic` = docs where the corrected and the buggy formula happen to
    # produce the same number (e.g. Length == 2*Width). They prove nothing about
    # which formula generated them, so they must not be counted as evidence
    # either way — counting them as "fresh" is what made the first version of
    # this check scream HALF-REGENERATED at a corpus that is uniformly stale.
    fresh = stale = unknown = agnostic = 0
    stale_ids = []
    for f in sorted(os.listdir(RAW)):
        if not f.lower().endswith(".mdx"):
            continue
        stem = slug(f[:-4])
        scale = scale_by_source.get(f.lower(), DEFAULT_SCALE)
        for i, e in enumerate(parse_particles(
                open(os.path.join(RAW, f), "rb").read()).emitters2):
            p = os.path.join(VFX, f"godie-{stem}-p{i}.json")
            if not os.path.isfile(p):
                continue
            have = json.load(open(p))["emitter"]["radius"]
            want = emission_disc_radius(e.width, e.length, scale)
            was = round(max(0.05, e.width * scale), 3)  # the pre-2026-07-24 bug
            if abs(want - was) < 1e-6:
                agnostic += 1 if abs(have - want) < 1e-6 else 0
                unknown += 0 if abs(have - want) < 1e-6 else 1
            elif abs(have - want) < 1e-6:
                fresh += 1
            elif abs(have - was) < 1e-6:
                stale += 1
                stale_ids.append(f"godie-{stem}-p{i}")
            else:
                unknown += 1
    total = fresh + stale + unknown + agnostic
    assert unknown == 0, (
        f"{unknown} of {total} vfx docs match NEITHER the corrected radius "
        "formula nor the known-buggy one — content/vfx has been hand-edited or "
        "generated by something else. Investigate before regenerating.")
    if stale and fresh:
        raise AssertionError(
            f"content/vfx is HALF-regenerated: {fresh} docs on the corrected "
            f"emitter radius, {stale} still on the 2x-too-large one. A partial "
            "regeneration is worse than either state — rerun "
            "`python3 tools/w3x-import/extract_particles.py` over the whole set.")
    assert not stale, (
        f"{stale}/{total} content/vfx/godie-*-p*.json are STALE: they carry the "
        f"pre-2026-07-24 emitter radius (width*scale, PRE2 `Length` ignored) "
        f"while this extractor computes max(width,length)/2*scale "
        f"({agnostic} more are formula-agnostic and prove nothing either way). "
        "First stale ids: " + ", ".join(stale_ids[:5]) + ". "
        "Fix by regenerating, NOT by relaxing this check:\n"
        "    python3 tools/w3x-import/extract_particles.py && pnpm content:build")
    print(f"PASS radius content: all {fresh} discriminating shipped vfx docs "
          f"are on the corrected emitter radius ({agnostic} agnostic)")

    # -- 4. ribbon@1: the #37 tuning is reproducible, not a frozen artifact ---
    rc = check_ribbon_trail_budget()
    return rc


def check_ribbon_trail_budget() -> int:
    """The 54 shipped ribbon@1 docs == a fresh extraction, budget applied.

    Why this is the guard that was missing. Before 2026-08-02 the #37 刀光殘影
    tuning existed ONLY as edited values inside those 54 files, and the only
    thing protecting it was extract_particles' hand-tune rule, which at the time
    was `tuned = shipped != fresh`: "a doc that differs from a fresh extraction
    was hand-tuned, keep it". That rule cannot tell a hand-tune from a doc that
    went stale — both differ — so once the extractor's ribbon output moved for
    any reason, the guard would have gone on "protecting" a doc nobody could
    regenerate.

    Now the transform lives in ribbon_trail_budget(), so the claim is checkable:
    re-extract and the result must EQUAL what ships. If a future parser change
    moves the raw ribbon numbers, this fails and names the field — a signal that
    rule structurally could not produce. (That rule is itself gone: see
    extract_particles.classify_doc, which reads vfx-provenance.json and so can
    answer "stale or hand-tuned?" instead of guessing.)

    Whole-document equality on purpose (failure form 7): asserting only the
    three tuned fields would pass while texture / anchorBone / blendMode rotted.
    """
    from extract_particles import build_ribbon_doc, TextureResolver  # noqa: E402

    scale_by_source = {}
    if os.path.isfile(os.path.join(OUT, "models_report.json")):
        for e in json.load(open(os.path.join(OUT, "models_report.json"))):
            if e.get("source") and e.get("scale_factor"):
                scale_by_source[e["source"].lower()] = float(e["scale_factor"])
    tex = TextureResolver(True)  # dry_run: resolve names, copy nothing
    checked = 0
    for f in sorted(os.listdir(RAW)):
        if not f.lower().endswith(".mdx"):
            continue
        stem = slug(f[:-4])
        scale = scale_by_source.get(f.lower(), DEFAULT_SCALE)
        m = parse_particles(open(os.path.join(RAW, f), "rb").read())
        for i, rb in enumerate(m.ribbons):
            doc_id = f"godie-{stem}-r{i}"
            p = os.path.join(VFX, doc_id + ".json")
            if not os.path.isfile(p):
                continue
            fresh = build_ribbon_doc(doc_id, rb, m, scale, tex, [])
            assert json.load(open(p)) == fresh, (
                f"{doc_id} is not what extract_particles produces. Either the "
                "doc drifted, or the ribbon extraction changed and the #37 "
                "budget in ribbon_trail_budget() no longer reproduces what "
                "ships. Do NOT loosen this: re-derive the tuning, then "
                "regenerate.")
            checked += 1
    assert checked >= 50, checked
    print(f"PASS ribbon budget: all {checked} shipped ribbon@1 docs are "
          "reproduced exactly by extract_particles (#37 tuning included)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
