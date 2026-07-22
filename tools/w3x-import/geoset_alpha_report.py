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
    end, o, out = off + sz, off, []
    while o < end:
        nb = struct.unpack_from("<I", d, o)[0]
        gid = struct.unpack_from("<I", d, o + 24)[0]
        o2, tracks = o + 28, {}
        while o2 < o + nb:
            o3, t = _track(d, o2, 1)
            if t is None:
                break
            tracks["KGAO"] = t
            o2 = o3
        out.append(dict(geoset=gid, tracks=tracks))
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


def champion_models() -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for fn in sorted(os.listdir(CHAMPIONS)):
        if not fn.endswith(".json") or fn.startswith("_"):
            continue
        with open(os.path.join(CHAMPIONS, fn), encoding="utf-8") as fh:
            doc = json.load(fh)
        mk = doc.get("modelKey", "")
        if mk.startswith("imported."):
            out.setdefault(mk[len("imported."):] + ".glb", []).append(doc.get("name", fn))
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
                   champions=champs.get(stem + ".glb", []),
                   has_geoa="GEOA" in ch, stuck=[])
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

        for prim_i, gidx in enumerate(shipped):
            ga = geoa.get(gidx)
            if not ga or "KGAO" not in ga["tracks"]:
                continue
            tr = ga["tracks"]["KGAO"]
            vis, hid = [], []
            for s in seqs:
                frames = [s["start"], s["end"], (s["start"] + s["end"]) // 2]
                frames += [f for f, _ in tr["keys"] if s["start"] <= f <= s["end"]]
                (vis if max(alpha_at(tr, f) for f in frames) > 0.01 else hid).append(s["name"])
            if not vis or not hid:
                continue        # always-on or always-off: nothing conditional
            resting = [s["name"] for s in seqs if s["name"].startswith(("Stand", "Walk"))]
            if resting and not all(n in hid for n in resting):
                continue        # visible while standing/walking anyway
            g = geos[gidx]
            tex = ""
            if 0 <= g["material"] < len(mtls):
                tex = "|".join(sorted({
                    texs[l["tex"]]["path"] or "replaceable%d" % texs[l["tex"]]["replaceable"]
                    for l in mtls[g["material"]]["layers"] if 0 <= l["tex"] < len(texs)}))
            row["stuck"].append(dict(
                prim=prim_i, geoset=gidx, verts=g["nverts"], tris=g["ntris"],
                texture=tex, visible_in=vis,
                halfwidth_wc3=round(max(abs(g["mins"][0]), abs(g["maxs"][0]),
                                        abs(g["mins"][1]), abs(g["maxs"][1])), 1),
            ))
        rows.append(row)
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()

    rows = analyse()
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
