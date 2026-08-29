#!/usr/bin/env python3
"""Task #59 — census of GEOSET-ALPHA visibility data lost in mdx→glb.

WC3 MDX animates per-geoset visibility with GEOSET ANIMATION alpha tracks
(``GEOA``/``KGAO``). glTF has NO visibility animation channel, so
w3xlib/gltf.py skips GEOA entirely — every models_report entry records
``skipped MDX chunks: ...GEOA...``. A geoset WC3 showed for a single sequence
therefore ships as permanently-on, motionless geometry.

This tool quantifies the damage. For each raw MDX with a shipped .glb it:

  1. parses SEQS + GEOS + GEOA + MTLS + TEXS (stdlib only, no deps),
  2. matches the shipped glb's primitives back onto MDX geosets by vertex
     count and order (the importer's guard and task #17's strip both remove
     whole geosets, so the surviving prims are an in-order subsequence),
  3. samples each surviving geoset's KGAO alpha across every sequence, and
  4. flags a geoset as a STUCK EFFECT when it is fully transparent in every
     Stand*/Walk* sequence — i.e. WC3 hid it during the states the player
     spends ~all their time in, yet it renders always.

Usage:  python3 geoset_alpha_report.py [--json out.json] [--all]
        --all also lists prop/vfx models (default: champions first, then props)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
RAW = os.path.join(HERE, "out", "GoDieEX22s", "raw")
GLB = os.path.join(REPO, "content", "assets", "models", "imported")
CHAMPIONS = os.path.join(REPO, "content", "champions")


# ---------------------------------------------------------------------------
# MDX chunk parsing (stdlib)
# ---------------------------------------------------------------------------

def slug(name: str) -> str:  # same rule as w3xlib.models.slug
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "model"


def chunks(d: bytes) -> dict[str, list[tuple[int, int]]]:
    off, out = 4, {}
    while off < len(d) - 8:
        tag = d[off:off + 4]
        if not re.match(rb"^[A-Z0-9]{4}$", tag):
            break
        sz = struct.unpack_from("<I", d, off + 4)[0]
        out.setdefault(tag.decode(), []).append((off + 8, sz))
        off += 8 + sz
    return out


def cstr(b: bytes) -> str:
    return b.split(b"\0")[0].decode("utf-8", "replace")


def parse_seqs(d, off, sz):
    out = []
    for i in range(sz // 132):
        o = off + i * 132
        start, end = struct.unpack_from("<II", d, o + 80)
        out.append(dict(i=i, name=cstr(d[o:o + 80]), start=start, end=end))
    return out


def _track(d, o, ncomp):
    if d[o:o + 4] != b"KGAO":
        return o, None
    nkeys, interp, gseq = struct.unpack_from("<IIi", d, o + 4)
    o2, keys = o + 16, []
    for _ in range(nkeys):
        frame = struct.unpack_from("<i", d, o2)[0]
        o2 += 4
        vals = struct.unpack_from("<%df" % ncomp, d, o2)
        o2 += 4 * ncomp
        if interp > 1:            # hermite/bezier carry inTan + outTan
            o2 += 8 * ncomp
        keys.append((frame, vals[0] if ncomp == 1 else vals))
    return o2, dict(interp=interp, gseq=gseq, keys=keys)


def parse_geoa(d, off, sz):
    """GEOA entry: u32 size, f32 STATIC alpha, u32 flags, f32[3] color, u32 geosetId, [KGAO].

    ``static_alpha`` (offset +4) is the value WC3 uses for any sequence whose
    interval holds no key of its own -- see :func:`alpha_in_seq`. The original
    parser discarded it, which is half of why form-gated geosets were invisible
    to this census (GH#742).
    """
    end, o, out = off + sz, off, []
    while o < end:
        nb = struct.unpack_from("<I", d, o)[0]
        static_alpha = struct.unpack_from("<f", d, o + 4)[0]
        gid = struct.unpack_from("<I", d, o + 24)[0]
        o2, tracks = o + 28, {}
        while o2 < o + nb:
            o3, t = _track(d, o2, 1)
            if t is None:
                break
            tracks["KGAO"] = t
            o2 = o3
        out.append(dict(geoset=gid, static_alpha=static_alpha, tracks=tracks))
        o += nb
    return out


def parse_geos(d, off, sz):
    """Per-geoset vertex count, triangle count, material id and bbox."""
    end, o, out = off + sz, off, []
    seq = [(b"NRMS", 12), (b"PTYP", 4), (b"PCNT", 4), (b"PVTX", 2), (b"GNDX", 1),
           (b"MTGC", 4), (b"MATS", 4)]
    while o < end:
        nb = struct.unpack_from("<I", d, o)[0]
        p = o + 4
        assert d[p:p + 4] == b"VRTX"
        nv = struct.unpack_from("<I", d, p + 4)[0]
        vp = p + 8
        verts = [struct.unpack_from("<3f", d, vp + 12 * i) for i in range(nv)]
        p = vp + 12 * nv
        ntris = 0
        for tag, esz in seq:
            assert d[p:p + 4] == tag, (tag, d[p:p + 4])
            n = struct.unpack_from("<I", d, p + 4)[0]
            if tag == b"PVTX":
                ntris = n // 3
            p += 8 + esz * n
        matid = struct.unpack_from("<I", d, p)[0]
        mins = [min(v[k] for v in verts) for k in range(3)] if nv else [0.0] * 3
        maxs = [max(v[k] for v in verts) for k in range(3)] if nv else [0.0] * 3
        out.append(dict(nverts=nv, ntris=ntris, material=matid, mins=mins, maxs=maxs))
        o += nb
    return out


def parse_mtls(d, off, sz):
    end, o, out = off + sz, off, []
    while o < end:
        nb = struct.unpack_from("<I", d, o)[0]
        p = o + 12
        assert d[p:p + 4] == b"LAYS"
        nlay = struct.unpack_from("<I", d, p + 4)[0]
        p += 8
        lays = []
        for _ in range(nlay):
            lnb = struct.unpack_from("<I", d, p)[0]
            filt, _lf, tex = struct.unpack_from("<III", d, p + 4)
            lays.append(dict(filter=filt, tex=tex))
            p += lnb
        out.append(dict(layers=lays))
        o += nb
    return out


def parse_texs(d, off, sz):
    return [dict(replaceable=struct.unpack_from("<I", d, off + i * 268)[0],
                 path=cstr(d[off + i * 268 + 4:off + i * 268 + 260]))
            for i in range(sz // 268)]


# ---------------------------------------------------------------------------
# glb side
# ---------------------------------------------------------------------------

def glb_prim_vertex_counts(path: str) -> list[int]:
    with open(path, "rb") as fh:
        d = fh.read()
    off = 12
    g = None
    while off < len(d):
        clen, ctype = struct.unpack_from("<II", d, off)
        off += 8
        if ctype == 0x4E4F534A:
            g = json.loads(d[off:off + clen].decode("utf-8"))
            break
        off += clen
    if g is None:
        return []
    acc = g["accessors"]
    return [acc[p["attributes"]["POSITION"]]["count"]
            for m in g.get("meshes", []) for p in m["primitives"]]


def alpha_at(track, frame: float) -> float:
    """Sample a KGAO track with WC3 semantics (interp 0 == step/hold)."""
    keys = sorted(track["keys"])
    if not keys:
        return 1.0
    if frame <= keys[0][0]:
        return keys[0][1]
    if frame >= keys[-1][0]:
        return keys[-1][1]
    prev = keys[0]
    for k in keys:
        if k[0] > frame:
            if track["interp"] == 0:
                return prev[1]
            t = (frame - prev[0]) / max(1, k[0] - prev[0])
            return prev[1] + t * (k[1] - prev[1])
        prev = k
    return prev[1]


ALTERNATE_RE = re.compile(r"alternate", re.IGNORECASE)


def alpha_in_seq(track, static_alpha: float, seq) -> float:
    """Peak KGAO alpha this geoset reaches INSIDE one sequence's own interval.

    ── Why this exists, and why :func:`alpha_at` could not answer it (GH#742) ──
    MDX sequences are intervals carved out of ONE global frame timeline, and a
    WC3 animator says "geoset G is off during sequence S" by writing a single
    step key (``interp == 0``) at ``S.start``. A sequence the animator never
    touched carries NO key of its own and falls back to the GEOA chunk's static
    alpha -- it is NOT governed by a key that belongs to some other sequence.

    ``alpha_at`` sampled the track GLOBALLY and clamped out-of-range frames to
    the nearest end key (``frame <= keys[0][0] -> keys[0][1]``). For a geoset
    keyed in only ONE sequence family that clamp leaks the other family's value
    across the whole timeline, so BOTH families read 0.0 and the geoset is
    written off as "always-off: nothing conditional" (:func:`analyse` skips it).

    Measured on ``HeroIchigo.mdx`` -- geoset1 (540v) is keyed 0.0 at the start
    of all 9 ``*alternate`` sequences and nowhere else, geoset2 (739v) is keyed
    0.0 at the start of all 10 base sequences and nowhere else. They are the two
    halves of a 卍解 transform: one body per form, static alpha 1.0 everywhere
    else. The clamp reported both as always-off, so 黑崎一護's ``stuck`` list
    came back EMPTY while the shipped glb drew both bodies at once.

    ⚠️ A censor that cannot see a defect reports the same empty list as a clean
    model -- 壞掉跟正常長得一模一樣. That is the bug being fixed here, not the
    model.
    """
    keys = sorted(k for k in track["keys"] if seq["start"] <= k[0] <= seq["end"])
    if not keys:
        return static_alpha

    def at(frame: float) -> float:
        prev = None
        for f, v in keys:
            if f > frame:
                if prev is None:
                    return static_alpha
                if track["interp"] == 0:
                    return prev[1]
                span = max(1, f - prev[0])
                return prev[1] + (frame - prev[0]) / span * (v - prev[1])
            prev = (f, v)
        return prev[1] if prev is not None else static_alpha

    frames = [seq["start"], seq["end"], (seq["start"] + seq["end"]) // 2]
    frames += [f for f, _ in keys]
    return max(at(f) for f in frames)


def split_families(seqs) -> tuple[list, list]:
    """(base, alternate) sequences. WC3 spells a transform's second form by
    duplicating every sequence with an ``alternate`` suffix."""
    alt = [s for s in seqs if ALTERNATE_RE.search(s["name"])]
    return [s for s in seqs if not ALTERNATE_RE.search(s["name"])], alt


def champion_models() -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for fn in sorted(os.listdir(CHAMPIONS)):
        if not fn.endswith(".json") or fn.startswith("_"):
            continue
        with open(os.path.join(CHAMPIONS, fn), encoding="utf-8") as fh:
            doc = json.load(fh)
        mk = doc.get("modelKey", "")
        if mk.startswith("imported."):
            out.setdefault(mk[len("imported."):] + ".glb", []).append(
                {"id": doc.get("id", fn[:-5]), "name": doc.get("name", fn)})
    return out


def analyse() -> list[dict]:
    champs = champion_models()
    rows = []
    for fn in sorted(os.listdir(RAW)):
        if not fn.lower().endswith(".mdx"):
            continue
        stem = slug(os.path.splitext(fn)[0])
        gpath = os.path.join(GLB, stem + ".glb")
        if not os.path.exists(gpath):
            continue
        with open(os.path.join(RAW, fn), "rb") as fh:
            d = fh.read()
        ch = chunks(d)
        row = dict(glb=stem + ".glb", mdx=fn,
                   is_champion=(stem + ".glb") in champs,
                   champions=[c["name"] for c in champs.get(stem + ".glb", [])],
                   champion_ids=[c["id"] for c in champs.get(stem + ".glb", [])],
                   has_geoa="GEOA" in ch, stuck=[], forms=[],
                   has_alternate_family=False)
        if not all(k in ch for k in ("SEQS", "GEOS", "GEOA")):
            rows.append(row)
            continue
        seqs = parse_seqs(d, *ch["SEQS"][0])
        geos = parse_geos(d, *ch["GEOS"][0])
        geoa = {g["geoset"]: g for g in parse_geoa(d, *ch["GEOA"][0])}
        mtls = parse_mtls(d, *ch["MTLS"][0]) if "MTLS" in ch else []
        texs = parse_texs(d, *ch["TEXS"][0]) if "TEXS" in ch else []

        # shipped prims are an in-order subsequence of the geosets
        shipped, gi = [], 0
        for n in glb_prim_vertex_counts(gpath):
            while gi < len(geos) and geos[gi]["nverts"] != n:
                gi += 1
            if gi < len(geos):
                shipped.append(gi)
                gi += 1
        row["ngeosets"] = len(geos)
        row["nshipped"] = len(shipped)

        base_seqs, alt_seqs = split_families(seqs)
        row["has_alternate_family"] = bool(alt_seqs) and bool(base_seqs)
        split = {"base": [], "alternate": [], "both": []}

        def describe(gidx):
            """texture string for a geoset's material (shared by both verdicts)."""
            g = geos[gidx]
            if not (0 <= g["material"] < len(mtls)):
                return ""
            return "|".join(sorted({
                texs[l["tex"]]["path"] or "replaceable%d" % texs[l["tex"]]["replaceable"]
                for l in mtls[g["material"]]["layers"] if 0 <= l["tex"] < len(texs)}))

        for prim_i, gidx in enumerate(shipped):
            ga = geoa.get(gidx)
            g = geos[gidx]
            tr = ga["tracks"].get("KGAO") if ga else None
            if tr is None:
                # no visibility track at all -> drawn in every sequence
                if row["has_alternate_family"]:
                    split["both"].append(prim_i)
                continue
            static_alpha = ga.get("static_alpha", 1.0)
            vis, hid = [], []
            for s in seqs:
                shown = alpha_in_seq(tr, static_alpha, s) > 0.01
                (vis if shown else hid).append(s["name"])

            # ── verdict A: FORM-EXCLUSIVE (GH#742) ─────────────────────────
            # Visible in one sequence family and hidden in the whole other one
            # ⇒ WC3 swapped this geoset out on transform. glTF has no
            # visibility channel, so it ships drawn in BOTH forms: the champion
            # wears two bodies at once.
            if row["has_alternate_family"]:
                hid_set = set(hid)
                base_on = any(s["name"] not in hid_set for s in base_seqs)
                alt_on = any(s["name"] not in hid_set for s in alt_seqs)
                if base_on != alt_on:
                    form = "base" if base_on else "alternate"
                    split[form].append(prim_i)
                    row["forms"].append(dict(
                        prim=prim_i, geoset=gidx, verts=g["nverts"], tris=g["ntris"],
                        material=g["material"], texture=describe(gidx), form=form,
                        halfwidth_wc3=round(max(abs(g["mins"][0]), abs(g["maxs"][0]),
                                                abs(g["mins"][1]), abs(g["maxs"][1])), 1),
                    ))
                    continue    # a form body is NOT also a "stuck effect"
                if base_on and alt_on:
                    split["both"].append(prim_i)

            # ── verdict B: STUCK EFFECT (task #59, unchanged rule) ─────────
            if not vis or not hid:
                continue        # always-on or always-off: nothing conditional
            # ⚠️ CASE-INSENSITIVE ON PURPOSE. WC3 sequence names are free text and
            # this pack spells them both ways ("Walk"/"stand - 1"/"stand ready").
            # While the buggy global sampler was in place this line was mostly
            # unreachable, so the typo-level bug never showed; with alpha_in_seq
            # returning honest per-sequence answers it does. Measured: Darkraor's
            # 152v BODY geoset (visible in all ten "stand - N", hidden only in the
            # three "Death" sequences) was reported as a stuck EFFECT because
            # `resting` came back empty and the guard short-circuited.
            resting = [s["name"] for s in seqs
                       if s["name"].lower().startswith(("stand", "walk"))]
            if resting and not all(n in hid for n in resting):
                continue        # visible while standing/walking anyway
            row["stuck"].append(dict(
                prim=prim_i, geoset=gidx, verts=g["nverts"], tris=g["ntris"],
                texture=describe(gidx), visible_in=vis,
                halfwidth_wc3=round(max(abs(g["mins"][0]), abs(g["maxs"][0]),
                                        abs(g["mins"][1]), abs(g["maxs"][1])), 1),
            ))
        if row["forms"]:
            row["form_split"] = {k: sorted(v) for k, v in split.items()}
        rows.append(row)
    return rows


LOD_SUFFIXES = ("", "-mid", "-small")


def build_fixture(rows) -> dict:
    """The FORM-SPLIT answer, plus enough shipped-glb facts to detect drift.

    Primitive INDICES are what `model@1.hiddenPrimitives` speaks, and a
    re-extraction can renumber them (see the hiddenPrimitives doc comment: a
    wrong index either misses, or hides the body and the champion vanishes).
    So the fixture records the vertex count sitting at each index in EVERY
    shipped LOD tier -- the guard re-reads the real .glb bytes and compares.
    """
    models = {}
    for r in rows:
        if not r.get("forms"):
            continue
        tiers = {}
        stem = r["glb"][:-4]
        for suf in LOD_SUFFIXES:
            path = os.path.join(GLB, stem + suf + ".glb")
            if os.path.exists(path):
                tiers[stem + suf + ".glb"] = glb_prim_vertex_counts(path)
        models[r["glb"]] = dict(
            mdx=r["mdx"], champion_ids=r.get("champion_ids", []),
            champions=r["champions"], forms=r["form_split"],
            geosets={str(f["prim"]): dict(geoset=f["geoset"], verts=f["verts"],
                                          material=f["material"], form=f["form"])
                     for f in r["forms"]},
            lod_prim_vertex_counts=tiers,
        )
    return {
        "_note": ("GH#742 — geosets WC3 swapped out on transform. glTF has no "
                  "visibility channel, so every one of these ships DRAWN IN BOTH "
                  "FORMS. Regenerate: python3 tools/w3x-import/geoset_alpha_report.py "
                  "--fixture tools/w3x-import/geoset_form_gating.fixture.json"),
        "models": models,
    }


def selftest(rows) -> int:
    """Two-direction calibration (CLAUDE.md: a one-sided ruler goes silent
    exactly when it matters). A censor that answers "nothing found" for both a
    known-positive and a known-negative is not measuring anything."""
    by = {r["glb"]: r for r in rows}
    fails = []

    # (+) known POSITIVE: 黑崎一護 carries two mutually-exclusive bodies.
    ich = by.get("heroichigo.glb")
    if not ich or not ich.get("forms"):
        fails.append("heroichigo.glb: form split NOT detected — the sampler is "
                     "blind again (this is the GH#742 regression)")
    else:
        got = {k: sorted(v) for k, v in ich["form_split"].items()}
        want = {"base": [1, 3], "alternate": [2], "both": [0, 4]}
        if got != want:
            fails.append(f"heroichigo.glb: split {got} != measured KGAO truth {want}")

    # (−) known NEGATIVE: a model with no alternate family must never be split.
    neg = [r["glb"] for r in rows
           if r.get("forms") and not r.get("has_alternate_family")]
    if neg:
        fails.append(f"form split reported for models with no alternate family: {neg}")

    # (−) known NEGATIVE: the three shipped strip JOBS must keep their verdicts.
    for name in ("heromusashimiyamoto.glb", "herohehi.glb", "linkstik.glb"):
        r = by.get(name)
        if r and r.get("forms"):
            fails.append(f"{name}: shipped strip JOB model must not be form-split")

    for f in fails:
        print(f"CALIBRATION FAIL: {f}", file=sys.stderr)
    print(f"calibration: {'FAIL' if fails else 'ok'} "
          f"({len(fails)} problem(s)); positive=heroichigo, "
          f"negatives={len(rows) - 1} models", file=sys.stderr)
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json")
    ap.add_argument("--fixture", help="write the GH#742 form-gating fixture")
    ap.add_argument("--check", action="store_true",
                    help="regenerate the fixture and byte-compare (exit 1 if stale)")
    ap.add_argument("--selftest", action="store_true",
                    help="two-direction calibration of this censor")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()

    rows = analyse()

    if args.selftest:
        return selftest(rows)

    if args.fixture or args.check:
        path = args.fixture or os.path.join(HERE, "geoset_form_gating.fixture.json")
        blob = json.dumps(build_fixture(rows), indent=1, ensure_ascii=False) + "\n"
        if args.check:
            have = open(path, encoding="utf-8").read() if os.path.exists(path) else ""
            if have != blob:
                print(f"STALE: {path} — rerun with --fixture", file=sys.stderr)
                return 1
            print(f"fresh: {path}", file=sys.stderr)
            return 0
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(blob)
        print(f"wrote {path}", file=sys.stderr)
        return 0
    hits = [r for r in rows if r["stuck"]]
    champ_hits = [r for r in hits if r["is_champion"]]

    print(f"imported models scanned ............ {len(rows)}")
    print(f"  carrying GEOA (lost alpha data) .. {sum(1 for r in rows if r['has_geoa'])}")
    print(f"  STILL shipping a stuck effect .... {len(hits)}")
    print(f"    of which CHAMPION (player-sees) {len(champ_hits)}")
    print()
    for r in (hits if args.all else champ_hits + [x for x in hits if not x["is_champion"]]):
        tag = "CHAMPION" if r["is_champion"] else "prop/vfx"
        who = ("  " + " / ".join(r["champions"])) if r["champions"] else ""
        print(f"{r['glb']:<28} {tag}{who}")
        for s in r["stuck"]:
            print(f"    prim[{s['prim']}] = geoset[{s['geoset']}]  "
                  f"{s['verts']}v/{s['tris']}tri  halfwidth {s['halfwidth_wc3']} WC3u  "
                  f"tex={s['texture']}")
            print(f"        WC3 showed it ONLY in: {', '.join(s['visible_in'])}")
        print()

    if args.json:
        with open(args.json, "w", encoding="utf-8") as fh:
            json.dump(rows, fh, indent=1, ensure_ascii=False)
        print(f"wrote {args.json}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
