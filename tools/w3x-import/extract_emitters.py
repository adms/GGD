#!/usr/bin/env python3
"""Emitter archaeology: every particle/ribbon emitter in every imported model,
as data, with the parameters a renderer actually needs.

WHY THIS EXISTS
---------------
A WC3 orb / locust swarm / "particle effect" is a PARTICLE EMITTER plus an
ATTACHMENT, not a mesh. mdx -> glb therefore bakes no geometry for those assets
and yields a ~1 KB shell (task #98). The fix needs the emitter parameters, and
the only place they exist is the binary MDX. This tool reads them out.

It is a DATASET producer, not a content writer. It writes only under
`tools/w3x-import/out/emitters/`. Binding these to abilities, choosing
textures, and authoring `content/vfx/*.json` belong to other lanes; this one
supplies the ground truth they cite.

RELATIONSHIP TO extract_particles.py
------------------------------------
`extract_particles.py` converts PRE2/RIBB into shippable `vfx@1` docs, lossily
and opinionatedly (colour stops collapsed to three, textures substituted with
CC0 sprites, animation tracks dropped, negative values folded to magnitude).
This tool is the lossless counterpart: raw WC3 values first, conversions second
and clearly labelled. When the two disagree, THIS file is the source of truth
about what the map contains and that file is the truth about what ships.

It also covers three things `extract_particles.py` does not:
  * it reads `out/GoDieEX22s-src/raw` (the UNPROTECTED source map, 132 models),
    not `out/GoDieEX22s/raw` (the obfuscated export, 129 models — it is missing
    HeroSamanosukeAkechi / MusicCast / SephBoom outright, and case-folds others)
  * it keeps every animated KP2*/KR* track. Several emitters put their whole
    expression there and read as inert or zero-sized from the fixed block alone
  * it records geometry alongside emitters, so "pure emitter asset" and
    "mesh whose particle layer silently vanished" are separable

Outputs (all under out/emitters/):
  EMITTERS.json    per-model records: geometry + every emitter, raw + converted
  MODEL_REFS.json  every model-valued field in the object data, classified
  EMITTERS.md      human-readable summary + the honest coverage counts

Usage:  python3 extract_emitters.py [--src DIR] [--out DIR]
"""

from __future__ import annotations

import json
import math
import os
import struct
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from w3xlib.mdx import parse_mdx  # noqa: E402
from w3xlib.objdata import all_entries, parse_object_file  # noqa: E402
from w3xlib.particles import parse_particles  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_SRC = os.path.join(HERE, "out", "GoDieEX22s-src")
GLB_DIR = os.path.join(HERE, "out", "GoDieEX22s", "glb")
MODELS_REPORT = os.path.join(HERE, "out", "GoDieEX22s", "models_report.json")
DEFAULT_OUT = os.path.join(HERE, "out", "emitters")

# The mesh exporter's fallback when models_report.json has no per-model entry
# (w3xlib/models.py DEFAULT_SCALE, kept in sync by value).
MESH_DEFAULT_SCALE = 1.0 / 36.0
# The gameplay-distance factor the ability port uses (600 WC3 range = 11 units).
WORLD_UNIT_SCALE = 11.0 / 600.0

# PRE2 filterMode
P2_BLEND = {0: "blend", 1: "additive", 2: "modulate", 3: "modulate2x",
            4: "alphaKey"}
# MTLS layer filterMode (ribbons take their blend from their material)
MAT_BLEND = {0: "none", 1: "transparent", 2: "blend", 3: "additive",
             4: "addAlpha", 5: "modulate", 6: "modulate2x"}
HEAD_OR_TAIL = {0: "head", 1: "tail", 2: "both"}

# MDX node flags. 0x8000/0x10000 are OVERLOADED: on a v1 emitter (PREM) they
# mean usesMDL/usesTGA; on everything else — including PRE2 — they mean
# unshaded/sortPrimitivesFarZ. Getting this backwards on a PRE2 turns "ignore
# scene lighting" into "spawn a model per particle".
NODE_FLAGS = [
    (0x1, "dontInheritTranslation"), (0x2, "dontInheritRotation"),
    (0x4, "dontInheritScaling"), (0x8, "billboarded"),
    (0x10, "billboardLockX"), (0x20, "billboardLockY"),
    (0x40, "billboardLockZ"), (0x80, "cameraAnchored"),
    (0x100, "isBone"), (0x200, "isLight"), (0x400, "isEventObject"),
    (0x800, "isAttachment"), (0x1000, "isParticleEmitter"),
    (0x2000, "isCollisionShape"), (0x4000, "isRibbonEmitter"),
    (0x8000, "unshaded"), (0x10000, "sortPrimitivesFarZ"),
    (0x20000, "lineEmitter"), (0x40000, "unfogged"),
    (0x80000, "modelSpace"), (0x100000, "xYQuad"),
]

# Object-data fields whose value is a MODEL path (icons and path textures are
# deliberately excluded — `aart`/`arar`/`auar`/`uico`/`iico`/`fart`/`ussi` are
# .blp command buttons, `upat` is a pathing .tga).
MODEL_FIELDS = {
    "war3map.w3a": {
        "atat": "ability.targetArt", "amat": "ability.missileArt",
        "acat": "ability.casterArt", "asat": "ability.specialArt",
        "aeat": "ability.effectArt", "aaea": "ability.areaEffectArt",
    },
    "war3map.w3u": {
        "umdl": "unit.model", "uspa": "unit.specialArt",
        "ua1m": "unit.attack1Missile", "ua2m": "unit.attack2Missile",
    },
    "war3map.w3h": {
        "ftat": "buff.targetArt", "fsat": "buff.specialArt",
        "feat": "buff.effectArt",
    },
}
LIGHTNING_FIELDS = {"war3map.w3a": {"alig": "ability.lightning"},
                    "war3map.w3h": {"flig": "buff.lightning"}}
LEVELED = {"war3map.w3a": True, "war3map.w3u": False, "war3map.w3h": False}

# Which UNIT bone the art hangs off. Half of "where does this emitter go" lives
# here, not in the model: the mdx says which of ITS nodes an emitter is parented
# to, and this says which of the TARGET UNIT's attachment points the whole model
# is hung on. `atar`/`udty`/`umvt`/`utar` look similar and are NOT attachments
# (targets-allowed / death type / move type), so this is a whitelist.
#
# NOTE: `right,hand` is ONE attachment point spelled as two tokens. Never split
# these on commas — that is the M6 trap in docs/legacy/_vfx-fidelity-w3x.md.
ATTACH_FIELDS = {
    "war3map.w3a": {
        "acap": ("ability.casterArt", "caster"),
        "aspt": ("ability.specialArt", "special"),
        "ata0": ("ability.targetArt", "target0"),
        "ata1": ("ability.targetArt", "target1"),
        "ata2": ("ability.targetArt", "target2"),
        "ata3": ("ability.targetArt", "target3"),
        "ata4": ("ability.targetArt", "target4"),
        "ata5": ("ability.targetArt", "target5"),
    },
    "war3map.w3h": {
        "fspt": ("buff.specialArt", "special"),
        "feft": ("buff.effectArt", "effect"),
        "fta0": ("buff.targetArt", "target0"),
        "fta1": ("buff.targetArt", "target1"),
        "fta2": ("buff.targetArt", "target2"),
        "fta3": ("buff.targetArt", "target3"),
        "fta4": ("buff.targetArt", "target4"),
        "fta5": ("buff.targetArt", "target5"),
    },
}
# attachment COUNT fields (how many copies of the target art to hang)
COUNT_FIELDS = {"war3map.w3a": {"atac": "ability.targetArt",
                                "acac": "ability.casterArt"},
                "war3map.w3h": {"ftac": "buff.targetArt"}}


def r(x, n=4):
    v = round(float(x), n)
    return 0.0 if v == 0 else v


def slug(name: str) -> str:
    import re
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "model"


def decode_flags(flags: int, v1_emitter: bool = False) -> dict:
    out = {"raw": flags, "hex": f"0x{flags:X}"}
    for bit, nm in NODE_FLAGS:
        if flags & bit:
            if v1_emitter and bit == 0x8000:
                nm = "emitterUsesMDL"
            elif v1_emitter and bit == 0x10000:
                nm = "emitterUsesTGA"
            out[nm] = True
    return out


def track_json(tr) -> dict:
    return {
        "interp": {0: "none", 1: "linear", 2: "hermite", 3: "bezier"}.get(
            tr.interp, str(tr.interp)),
        "globalSeq": tr.global_seq,
        "keys": [[int(f), r(v, 4)] for f, v in tr.keys],
    }


# ---------------------------------------------------------------------------
# model-value classification
# ---------------------------------------------------------------------------


def classify_model_value(value: str, imported_index: dict[str, str]) -> list[dict]:
    """Split a model-valued object-data field and classify each entry.

    The four forms the map actually uses (see docs/legacy/_vfx-fidelity-w3x.md):
      * a path containing `\\`  -> stock Blizzard asset, NOT in this repo
      * a bare `name.mdx|.mdl`  -> imported into the map; the file lives at
        raw/<name>, and CASE MUST BE FOLDED (the map writes `Darkraor.mdl` in
        one field and ships `Darkraor.mdx`; `AWING.MDX` vs `AWING.mdx`)
      * exactly 4 characters    -> a Lightning.slk id (a beam, no model at all)
      * blank / `none.mdl` / `" .mdl"` -> DELIBERATELY INVISIBLE. This is a real
        WC3 idiom for a gameplay-only carrier. Do not "fix" it into something
        visible.
    A field may hold a comma-separated list (5 dragons as one area art), so this
    returns a list.
    """
    raw = value if isinstance(value, str) else ""
    out: list[dict] = []
    parts = [p for p in raw.split(",")] if raw else [""]
    for part in parts:
        v = part.strip()
        rec: dict = {"value": part}
        low = v.lower()
        norm = v.replace("/", "\\")
        base = norm.rsplit("\\", 1)[-1]
        # `war3mapImported\` is the World Editor's IMPORT folder. A value under
        # it contains a backslash but is a MAP asset, not a Blizzard one — the
        # naive "backslash means stock" rule writes it off as unavailable. The
        # extractor flattens the separator, so the file lands in raw/ as
        # `war3mapImported__<name>`.
        in_import_dir = low.startswith("war3mapimported\\") or \
            low.startswith("war3mapimported/")
        if v == "" or low in ("none.mdl", "none.mdx", ".mdl", ".mdx", "none"):
            rec["form"] = "invisible"
            rec["reason"] = "blank" if v == "" else "none-sentinel"
        elif base.lower() in ("none.mdl", "none.mdx") or not base.strip(". "):
            rec["form"] = "invisible"
            rec["reason"] = "none-sentinel"
        elif ("\\" in norm) and not in_import_dir:
            rec["form"] = "blizzard-stock"
            rec["path"] = v
            rec["basename"] = base
        elif low.endswith((".mdx", ".mdl")):
            rec["form"] = "map-imported"
            rec["basename"] = base
            if in_import_dir:
                rec["importFolder"] = "war3mapImported"
            # Try the flattened whole path first, then the bare basename. The
            # map spells the SAME asset `.mdl` here and `.mdx` there, and in
            # mixed case, so both keys are extension-stripped and case-folded.
            keys = [os.path.splitext(norm.replace("\\", "__"))[0].lower(),
                    os.path.splitext(base)[0].lower()]
            hit = next((imported_index[k] for k in keys if k in imported_index),
                       None)
            if hit:
                rec["file"] = hit
                rec["stem"] = slug(os.path.splitext(hit)[0])
                if os.path.splitext(base)[1].lower() != os.path.splitext(hit)[1].lower():
                    rec["extensionMismatch"] = True
                if base != hit:
                    rec["caseMismatch"] = True
            else:
                rec["form"] = "map-imported-missing"
        elif len(v) == 4:
            rec["form"] = "lightning-id"
            rec["lightningId"] = v
        else:
            rec["form"] = "unknown"
        out.append(rec)
    return out


def scan_object_refs(src_raw: str, imported_index: dict[str, str]) -> dict:
    """Every model-valued and lightning-valued field in the object data."""
    refs: list[dict] = []
    files_seen: list[str] = []
    for fname, codes in MODEL_FIELDS.items():
        path = os.path.join(src_raw, fname)
        if not os.path.isfile(path):
            continue
        files_seen.append(fname)
        parsed = parse_object_file(open(path, "rb").read(), LEVELED[fname])
        for entry in all_entries(parsed):
            for mod in entry.mods:
                if mod.code not in codes or mod.var_type != 3:
                    continue
                for part in classify_model_value(str(mod.value), imported_index):
                    refs.append({
                        "objectId": entry.obj_id, "baseId": entry.base_id,
                        "file": fname, "code": mod.code,
                        "field": codes[mod.code], "level": mod.level, **part,
                    })
    for fname, codes in LIGHTNING_FIELDS.items():
        path = os.path.join(src_raw, fname)
        if not os.path.isfile(path):
            continue
        parsed = parse_object_file(open(path, "rb").read(), LEVELED[fname])
        for entry in all_entries(parsed):
            for mod in entry.mods:
                if mod.code not in codes or mod.var_type != 3:
                    continue
                for part in str(mod.value).split(","):
                    v = part.strip()
                    refs.append({
                        "objectId": entry.obj_id, "baseId": entry.base_id,
                        "file": fname, "code": mod.code,
                        "field": codes[mod.code], "level": mod.level,
                        "value": part,
                        "form": "lightning-id" if v else "invisible",
                        **({"lightningId": v} if v else {"reason": "blank"}),
                    })
    # attachment points + counts, keyed so a consumer can join art -> bone
    attach: dict[str, dict] = {}
    for fname in set(list(ATTACH_FIELDS) + list(COUNT_FIELDS)):
        path = os.path.join(src_raw, fname)
        if not os.path.isfile(path):
            continue
        parsed = parse_object_file(open(path, "rb").read(), LEVELED[fname])
        for entry in all_entries(parsed):
            slot = attach.setdefault(entry.obj_id, {"objectId": entry.obj_id,
                                                    "baseId": entry.base_id,
                                                    "points": [], "counts": {}})
            for mod in entry.mods:
                fld = ATTACH_FIELDS.get(fname, {}).get(mod.code)
                if fld and mod.var_type == 3 and str(mod.value).strip():
                    slot["points"].append({
                        "code": mod.code, "field": fld[0], "slot": fld[1],
                        # kept WHOLE — "right,hand" is one point, not two
                        "attachPoint": str(mod.value).strip(),
                        "level": mod.level})
                cf = COUNT_FIELDS.get(fname, {}).get(mod.code)
                if cf and mod.var_type == 0:
                    slot["counts"][cf] = mod.value
    attach = {k: v for k, v in attach.items() if v["points"] or v["counts"]}
    return {"files": files_seen, "refs": refs, "attachments": attach}


# ---------------------------------------------------------------------------
# extra chunks parse_particles does not cover
# ---------------------------------------------------------------------------

_LITE_FIXED = struct.Struct("<I 2f 3f f 3f f")  # type, attStart/End, color,
                                                # intensity, ambColor, ambIntensity


def parse_extras(data: bytes) -> dict:
    """GLBS (global sequence durations) and LITE (light objects).

    Global sequences matter because a KP2*/KRVS track can be bound to one
    instead of the model timeline; a consumer that assumes the model timeline
    will play those at the wrong rate. Lights matter because several "orb"
    assets are a light plus an emitter and no mesh at all.
    """
    out: dict = {"globalSequences": [], "lights": [], "premChunks": 0,
                 "premEmitters": 0, "chunks": {}}
    pos = 4
    n = len(data)
    while pos + 8 <= n:
        tag = data[pos:pos + 4].decode("latin-1")
        size = struct.unpack_from("<I", data, pos + 4)[0]
        bs, be = pos + 8, min(pos + 8 + size, n)
        out["chunks"][tag] = out["chunks"].get(tag, 0) + 1
        if tag == "GLBS":
            for off in range(bs, be, 4):
                out["globalSequences"].append(
                    struct.unpack_from("<I", data, off)[0])
        elif tag == "PREM":
            out["premChunks"] += 1
            # ParticleEmitter (v1). Every one of these in this map is an EMPTY
            # chunk (size 0) — a declaration the exporter always writes. Counted
            # rather than assumed so a future map cannot silently lose them.
            p = bs
            while p + 4 <= be:
                incl = struct.unpack_from("<I", data, p)[0]
                if incl < 8:
                    break
                out["premEmitters"] += 1
                p += incl
        elif tag == "LITE":
            p = bs
            while p + 4 <= be:
                incl = struct.unpack_from("<I", data, p)[0]
                if incl < 8:
                    break
                try:
                    nincl = struct.unpack_from("<I", data, p + 4)[0]
                    nm = data[p + 8:p + 88].split(b"\x00", 1)[0].decode("latin-1")
                    oid, pid, fl = struct.unpack_from("<iii", data, p + 88)
                    v = _LITE_FIXED.unpack_from(data, p + 4 + nincl)
                    out["lights"].append({
                        "name": nm, "objectId": oid, "parentId": pid,
                        "flags": fl,
                        "type": {0: "omni", 1: "directional", 2: "ambient"}.get(
                            v[0], v[0]),
                        "attenuationStart": r(v[1]), "attenuationEnd": r(v[2]),
                        "color": [r(v[3]), r(v[4]), r(v[5])],
                        "intensity": r(v[6]),
                        "ambientColor": [r(v[7]), r(v[8]), r(v[9])],
                        "ambientIntensity": r(v[10]),
                    })
                except struct.error:
                    break
                p += incl
        pos = bs + size
    return out


# ---------------------------------------------------------------------------
# emitter records
# ---------------------------------------------------------------------------


def anchor_info(model, parent_id: int) -> dict:
    """Where the emitter hangs, and the whole chain up to the model root.

    `parentId == -1` is NOT missing data — it means the emitter is parented to
    the model root, which is where most effect models put them. The chain
    matters because the emitter's world offset is its own pivot plus every
    pivot above it; a consumer that reads `pivot` alone places nested emitters
    at the wrong point.
    """
    if parent_id is None or parent_id < 0:
        return {"anchorNode": None, "anchorNodeKind": None,
                "anchorIsModelRoot": True, "anchorChain": []}
    chain: list[dict] = []
    seen: set[int] = set()
    pid = parent_id
    while pid is not None and pid >= 0 and pid not in seen:
        seen.add(pid)
        nd = model.nodes.get(pid)
        if nd is None:
            chain.append({"objectId": pid, "name": None, "kind": "unresolved"})
            break
        pivot = (model.pivots[pid] if 0 <= pid < len(model.pivots)
                 else (0.0, 0.0, 0.0))
        chain.append({"objectId": pid, "name": nd.name or None, "kind": nd.kind,
                      "pivot": [r(c) for c in pivot]})
        pid = nd.parent_id
    head = chain[0] if chain else {}
    return {
        "anchorNode": head.get("name"),
        "anchorNodeKind": head.get("kind"),
        "anchorIsModelRoot": False,
        "anchorChain": chain,
    }


def emitter_record(idx, em, model, stem, scale, notes) -> dict:
    tex = model.texture_for(em.texture_id)
    anchor = anchor_info(model, em.parent_id)
    life = float(em.lifespan)
    var = float(em.variation)

    # Every quantity WC3 stores in world units, converted with the SAME factor
    # the glb exporter baked into this model's mesh — so particles land on the
    # mesh they hang off. `speed`/`gravity` are units-per-second, `length`,
    # `width` and `segmentScaling` are lengths; all take the same linear factor.
    rec = {
        "index": idx,
        "docId": f"godie-{stem}-p{idx}",  # joins to content/vfx/<id>.json
        "kind": "particleEmitter2",
        "name": em.name,
        "objectId": em.object_id,
        "parentId": em.parent_id,
        **anchor,
        "pivot": [r(c) for c in em.pivot],
        "flags": decode_flags(em.flags),
        # every emitter in this map consumes its declared inclusiveSize exactly;
        # a non-empty value here means the struct layout did not fit
        "byteExact": not em.parse_note,
        "raw": {
            "speed": r(em.speed), "variation": r(var),
            "latitudeDeg": r(em.latitude), "gravity": r(em.gravity),
            "lifespanSec": r(life), "emissionRatePerSec": r(em.emission_rate),
            "length": r(em.length), "width": r(em.width),
            "filterMode": em.filter_mode,
            "rows": em.rows, "cols": em.cols,
            "headOrTail": em.head_or_tail, "tailLength": r(em.tail_length),
            "timeMiddle": r(em.time),
            "segmentColor": [[r(c) for c in seg] for seg in em.segment_color],
            "segmentAlpha": list(em.segment_alpha),
            "segmentScaling": [r(s) for s in em.segment_scaling],
            "headInterval": list(em.head_interval),
            "headDecayInterval": list(em.head_decay_interval),
            "tailInterval": list(em.tail_interval),
            "tailDecayInterval": list(em.tail_decay_interval),
            "textureId": em.texture_id, "squirt": em.squirt,
            "priorityPlane": em.priority_plane,
            "replaceableId": em.replaceable_id,
        },
        "blendMode": P2_BLEND.get(em.filter_mode, f"unknown{em.filter_mode}"),
        "particleOrientation": HEAD_OR_TAIL.get(em.head_or_tail,
                                                str(em.head_or_tail)),
        "spriteSheet": ({"rows": em.rows, "cols": em.cols,
                         "cells": em.rows * em.cols}
                        if em.rows > 1 or em.cols > 1 else None),
        "texture": {
            "textureId": em.texture_id,
            "wc3Path": tex.path if tex else "",
            "basename": (tex.path.replace("/", "\\").rsplit("\\", 1)[-1]
                         if tex and tex.path else ""),
            "replaceableId": (em.replaceable_id or
                              (tex.replaceable_id if tex else 0)),
            "resolved": bool(tex and tex.path),
        },
        "emission": {
            "mode": "burst" if em.squirt else "continuous",
            # WC3 emits `emissionRate` particles per second while the emitter is
            # visible; `squirt` makes it release that count in one frame when
            # visibility flips on, which is why a burst emitter's rate is a
            # COUNT and a continuous emitter's rate is a RATE.
            "ratePerSec": r(em.emission_rate) if not em.squirt else None,
            "burstCount": r(em.emission_rate) if em.squirt else None,
        },
        "converted": {
            "scaleFactor": r(scale, 6),
            "speedMin": r(abs(em.speed) * max(0.0, 1.0 - abs(var)) * scale),
            "speedMax": r(abs(em.speed) * (1.0 + abs(var)) * scale),
            "gravityY": r(-em.gravity * scale),
            # PRE2 Width/Length are FULL side lengths of the emission rectangle
            # (spawn is uniform over ±half about the node), so these are full
            # extents and the bounding disc is max(w,l)/2. They shipped as
            # `emitterHalfWidth`/`emitterHalfLength` until 2026-08-02 — names
            # that claimed a half-extent while holding a full one, i.e. off by
            # exactly the 2x this repo already fixed once in content
            # (extract_particles.emission_disc_radius, w3xEmitter.ts
            # `halfExtent`). Third reading of the same bytes, third chance to
            # mislead; renamed so the survey agrees with the pipeline.
            "emitterFullLength": r(em.length * scale),
            "emitterFullWidth": r(em.width * scale),
            "emitterDiscRadius": r(max(em.width, em.length) / 2.0 * scale),
            "coneAngleDeg": r(min(180.0, max(0.0, em.latitude))),
            "sizeStops": [[0.0, r(em.segment_scaling[0] * scale)],
                          [r(em.time if 0 < em.time < 1 else 0.5, 3),
                           r(em.segment_scaling[1] * scale)],
                          [1.0, r(em.segment_scaling[2] * scale)]],
            "colorStops": [
                [t, [r(c[0]), r(c[1]), r(c[2]), r(a / 255.0)]]
                for t, c, a in zip(
                    (0.0, r(em.time if 0 < em.time < 1 else 0.5, 3), 1.0),
                    em.segment_color, em.segment_alpha)
            ],
            "tailLength": r(em.tail_length * scale),
        },
        "tracks": {k: track_json(v) for k, v in sorted(em.tracks.items())},
        "trackTags": em.track_tags,
    }

    # Honest per-emitter warnings. These are the cases where reading the fixed
    # block alone gives a WRONG renderer, not merely an approximate one.
    warn = []
    if em.speed < 0:
        warn.append("negative speed (inward emission) — direction is part of "
                    "the effect, do not fold to magnitude")
    if em.emission_rate < 0:
        warn.append(f"negative emissionRate {r(em.emission_rate)}")
    if em.emission_rate == 0 and "KP2E" not in em.tracks:
        warn.append("emissionRate 0 and no KP2E track — emits nothing")
    if em.emission_rate == 0 and "KP2E" in em.tracks:
        warn.append("emissionRate 0 in the fixed block; the real rate is the "
                    "KP2E track (peak "
                    f"{r(em.tracks['KP2E'].max_value)})")
    if em.width == 0 and em.length == 0 and (
            "KP2W" in em.tracks or "KP2N" in em.tracks):
        warn.append("zero emitter size in the fixed block; the whole shape is "
                    "in the KP2W/KP2N tracks")
    if life <= 0:
        warn.append("lifespan 0 — particles die on the frame they spawn")
    if em.latitude > 180:
        warn.append(f"latitude {r(em.latitude)}deg exceeds a hemisphere — an "
                    "authoring artefact (this map's author fills unused fields "
                    "with 555/900); WC3 renders it as full spread. Clamp to 180.")
    if not (tex and tex.path) and not em.replaceable_id:
        warn.append("no texture resolved (textureId "
                    f"{em.texture_id} of {len(model.textures)})")
    if em.tracks.keys() - {"KP2V"}:
        warn.append("animated tracks present: "
                    + ",".join(sorted(em.tracks.keys() - {'KP2V'}))
                    + " — a static emitter cannot reproduce these")
    if warn:
        rec["warnings"] = warn
        notes.extend(f"{rec['docId']}: {w}" for w in warn)
    return rec


def ribbon_record(idx, rb, model, stem, scale, notes) -> dict:
    anchor = anchor_info(model, rb.parent_id)
    tex_path, layer_fm, rid = "", None, 0
    if 0 <= rb.material_id < len(model.materials):
        for layer in model.materials[rb.material_id]:
            t = model.texture_for(layer.texture_id)
            if t is not None:
                layer_fm, tex_path, rid = layer.filter_mode, t.path, t.replaceable_id
                break
    rec = {
        "index": idx,
        "docId": f"godie-{stem}-r{idx}",
        "kind": "ribbonEmitter",
        "name": rb.name,
        "objectId": rb.object_id,
        "parentId": rb.parent_id,
        **anchor,
        "pivot": [r(c) for c in rb.pivot],
        "flags": decode_flags(rb.flags),
        "byteExact": not rb.parse_note,
        "raw": {
            "heightAbove": r(rb.height_above), "heightBelow": r(rb.height_below),
            "alpha": r(rb.alpha), "color": [r(c) for c in rb.color],
            "lifespanSec": r(rb.lifespan), "textureSlot": rb.texture_slot,
            "emissionRatePerSec": rb.emission_rate,
            "rows": rb.rows, "cols": rb.cols,
            "materialId": rb.material_id, "gravity": r(rb.gravity),
        },
        "blendMode": MAT_BLEND.get(layer_fm, "unknown") if layer_fm is not None
        else "unresolved",
        "texture": {"wc3Path": tex_path,
                    "basename": tex_path.replace("/", "\\").rsplit("\\", 1)[-1]
                    if tex_path else "",
                    "replaceableId": rid, "resolved": bool(tex_path)},
        "converted": {
            "scaleFactor": r(scale, 6),
            "widthAbove": r(rb.height_above * scale),
            "widthBelow": r(rb.height_below * scale),
            "gravityY": r(-rb.gravity * scale),
            "lifespanSec": r(rb.lifespan),
            "color": [r(rb.color[0]), r(rb.color[1]), r(rb.color[2]),
                      r(rb.alpha)],
        },
        "tracks": {k: track_json(v) for k, v in sorted(rb.tracks.items())},
        "trackTags": rb.track_tags,
    }
    warn = []
    if rb.material_id < 0 or rb.material_id >= len(model.materials):
        warn.append(f"materialId {rb.material_id} out of range "
                    f"({len(model.materials)} materials) — blend/texture unknown")
    if rb.lifespan <= 0:
        warn.append("lifespan 0 — the trail has no length")
    if not tex_path and not rid:
        warn.append("no texture resolved")
    if warn:
        rec["warnings"] = warn
        notes.extend(f"{rec['docId']}: {w}" for w in warn)
    return rec


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------


def main() -> int:
    args = sys.argv[1:]
    src = DEFAULT_SRC
    out_dir = DEFAULT_OUT
    if "--src" in args:
        src = os.path.abspath(args[args.index("--src") + 1])
    if "--out" in args:
        out_dir = os.path.abspath(args[args.index("--out") + 1])
    raw_dir = os.path.join(src, "raw")
    if not os.path.isdir(raw_dir):
        print(f"no raw dir at {raw_dir}", file=sys.stderr)
        return 1
    os.makedirs(out_dir, exist_ok=True)

    mesh_scale: dict[str, float] = {}
    model_kind: dict[str, str] = {}
    glb_size: dict[str, int] = {}
    if os.path.isfile(MODELS_REPORT):
        for e in json.load(open(MODELS_REPORT)):
            s = (e.get("source") or "").lower()
            if not s:
                continue
            if e.get("scale_factor"):
                mesh_scale[s] = float(e["scale_factor"])
            model_kind[s] = e.get("kind", "")
            if e.get("glb_size"):
                glb_size[s] = int(e["glb_size"])

    files = sorted(f for f in os.listdir(raw_dir)
                   if f.lower().endswith((".mdx", ".mdl")))
    # stem (case-folded, extension-stripped) -> actual filename. The map refers
    # to the same asset by both .mdl and .mdx and in mixed case.
    imported_index = {os.path.splitext(f)[0].lower(): f for f in files}

    notes: list[str] = []
    models: list[dict] = []
    parse_failures: list[dict] = []

    for fname in files:
        path = os.path.join(raw_dir, fname)
        data = open(path, "rb").read()
        stem = slug(os.path.splitext(fname)[0])
        low = fname.lower()
        scale = mesh_scale.get(low)
        scale_source = "models_report.json"
        if scale is None:
            scale = MESH_DEFAULT_SCALE
            scale_source = "fallback (models.py DEFAULT_SCALE)"
            notes.append(f"{fname}: no models_report entry — mesh scale "
                         f"defaulted to {r(MESH_DEFAULT_SCALE, 5)}")

        rec: dict = {
            "file": fname, "stem": stem, "bytes": len(data),
            "meshScaleFactor": r(scale, 6), "meshScaleSource": scale_source,
            "glbBytes": glb_size.get(low), "modelKind": model_kind.get(low),
        }

        if data[:4] != b"MDLX":
            rec["parseStatus"] = "not-mdx-binary"
            parse_failures.append({"file": fname, "reason": "magic != MDLX"})
            models.append(rec)
            continue

        try:
            pm = parse_particles(data)
        except Exception as ex:  # noqa: BLE001
            rec["parseStatus"] = "emitter-parse-failed"
            rec["parseError"] = repr(ex)
            parse_failures.append({"file": fname, "stage": "particles",
                                   "reason": repr(ex)})
            models.append(rec)
            continue

        rec["modelName"] = pm.name
        rec["version"] = pm.version
        rec["parseStatus"] = "ok"
        if pm.notes:
            rec["parserNotes"] = pm.notes
            notes.extend(f"{fname}: {n}" for n in pm.notes)

        # geometry (does the asset ALSO have a mesh?)
        try:
            gm = parse_mdx(data)
            tris = sum(len(g.faces) // 3 for g in gm.geosets)
            verts = sum(len(g.vertices) for g in gm.geosets)
            rec["geometry"] = {
                "geosets": len(gm.geosets), "triangles": tris,
                "vertices": verts, "hasGeometry": tris > 0,
                "parsed": True,
            }
            rec["sequences"] = [
                {"name": s.name, "startMs": s.start, "endMs": s.end,
                 "nonLooping": s.non_looping} for s in gm.sequences]
        except Exception as ex:  # noqa: BLE001
            rec["geometry"] = {"parsed": False, "error": repr(ex)}
            notes.append(f"{fname}: geometry parse failed: {ex!r}")

        extras = parse_extras(data)
        rec["chunks"] = extras["chunks"]
        rec["globalSequences"] = extras["globalSequences"]
        if extras["lights"]:
            rec["lights"] = extras["lights"]
        rec["particleEmitterV1"] = {
            "chunks": extras["premChunks"], "emitters": extras["premEmitters"]}

        # ATCH nodes: where this model itself hangs when WC3 attaches it to a
        # unit. The ability's `Casterattach`/`Targetattach` names one of these.
        rec["attachmentPoints"] = [
            {"name": nd.name, "objectId": nd.object_id,
             "pivot": [r(c) for c in (pm.pivots[nd.object_id]
                                      if 0 <= nd.object_id < len(pm.pivots)
                                      else (0.0, 0.0, 0.0))]}
            for nd in pm.nodes.values() if nd.kind == "attachment"]

        rec["textures"] = [
            {"index": i, "wc3Path": t.path, "replaceableId": t.replaceable_id,
             "basename": t.path.replace("/", "\\").rsplit("\\", 1)[-1]}
            for i, t in enumerate(pm.textures)]

        rec["emitters"] = [emitter_record(i, em, pm, stem, scale, notes)
                           for i, em in enumerate(pm.emitters2)]
        rec["ribbons"] = [ribbon_record(i, rb, pm, stem, scale, notes)
                          for i, rb in enumerate(pm.ribbons)]
        rec["events"] = [{"name": ev.name.strip(), "objectId": ev.object_id,
                          "parentId": ev.parent_id,
                          "anchorNode": (pm.nodes[ev.parent_id].name
                                         if ev.parent_id in pm.nodes else None),
                          "timesMs": ev.times}
                         for ev in pm.events]

        n_em = len(rec["emitters"]) + len(rec["ribbons"])
        has_geo = rec.get("geometry", {}).get("hasGeometry", False)
        tri = rec.get("geometry", {}).get("triangles", 0)
        if n_em == 0 and has_geo:
            rec["assetClass"] = "mesh-only"
        elif n_em and not has_geo:
            rec["assetClass"] = "pure-emitter"
        elif n_em and has_geo:
            # "hybrid" understates the case where the mesh is a token 4-tri
            # billboard and the emitters are the entire asset.
            rec["assetClass"] = ("emitter-dominant-hybrid" if tri <= 48
                                 else "mesh-and-emitter-hybrid")
        else:
            rec["assetClass"] = "no-geometry-no-emitter"
        models.append(rec)

    # ---- object-data references ------------------------------------------
    obj = scan_object_refs(raw_dir, imported_index)
    refs = obj["refs"]
    by_stem: dict[str, list[dict]] = defaultdict(list)
    for ref in refs:
        if ref.get("form") == "map-imported" and ref.get("stem"):
            by_stem[ref["stem"]].append(ref)
    for m in models:
        users = by_stem.get(m["stem"], [])
        m["referencedBy"] = [
            {"objectId": u["objectId"], "field": u["field"], "code": u["code"],
             "level": u["level"], "value": u["value"]} for u in users]
        m["referenceCount"] = len(users)

    form_counts = Counter(x.get("form") for x in refs)
    field_form = Counter((x["field"], x.get("form")) for x in refs)

    # ---- honest census ----------------------------------------------------
    ok = [m for m in models if m.get("parseStatus") == "ok"]
    with_em = [m for m in ok if m.get("emitters") or m.get("ribbons")]
    pure = [m for m in with_em if m["assetClass"] == "pure-emitter"]
    edom = [m for m in with_em if m["assetClass"] == "emitter-dominant-hybrid"]
    hybrid = [m for m in with_em if m["assetClass"] == "mesh-and-emitter-hybrid"]
    n_p2 = sum(len(m.get("emitters", [])) for m in ok)
    n_rb = sum(len(m.get("ribbons", [])) for m in ok)
    n_warn_p2 = sum(1 for m in ok for e in m.get("emitters", [])
                    if e.get("warnings"))
    n_tracked = sum(1 for m in ok for e in m.get("emitters", [])
                    if e.get("tracks", {}).keys() - {"KP2V"})
    n_notex = sum(1 for m in ok for e in m.get("emitters", [])
                  if not e["texture"]["resolved"] and
                  not e["texture"]["replaceableId"])
    map_tex = Counter()
    for m in ok:
        for e in m.get("emitters", []):
            b = e["texture"]["basename"]
            if b:
                map_tex[b] += 1

    summary = {
        "source": os.path.relpath(src, HERE),
        "modelsScanned": len(files),
        "modelsParsed": len(ok),
        "modelsFailed": len(parse_failures),
        "modelsWithEmitters": len(with_em),
        "particleEmitters2": n_p2,
        "ribbonEmitters": n_rb,
        "particleEmittersV1": sum(m.get("particleEmitterV1", {}).get("emitters", 0)
                                  for m in ok),
        "premChunksDeclaredButEmpty": sum(
            1 for m in ok
            if m.get("particleEmitterV1", {}).get("chunks", 0)
            and not m.get("particleEmitterV1", {}).get("emitters", 0)),
        "assetClasses": Counter(m["assetClass"] for m in ok),
        "pureEmitterModels": sorted(m["file"] for m in pure),
        "emitterDominantHybrids": sorted(m["file"] for m in edom),
        "meshAndEmitterHybrids": len(hybrid),
        # decode proof: every emitter must consume exactly the bytes its
        # inclusiveSize declares. Anything less than 100% means a bad struct.
        "emittersDecodedByteExact": sum(
            1 for m in ok for e in m.get("emitters", []) + m.get("ribbons", [])
            if e.get("byteExact")),
        "emittersWithLeftoverBytes": sum(
            1 for m in ok for e in m.get("emitters", []) + m.get("ribbons", [])
            if not e.get("byteExact")),
        "emittersWithWarnings": n_warn_p2,
        "emittersWithAnimationTracks": n_tracked,
        "emittersWithUnresolvedTexture": n_notex,
        "distinctEmitterTextures": len(map_tex),
        "modelRefForms": dict(form_counts),
        "meshScaleFactorDefault": r(MESH_DEFAULT_SCALE, 6),
        "worldUnitScale": r(WORLD_UNIT_SCALE, 6),
    }

    dataset = {
        "schema": "w3x-emitters@1",
        "summary": {k: (dict(v) if isinstance(v, Counter) else v)
                    for k, v in summary.items()},
        "scaleContract": {
            "meshScaleFactor": "per-model, from models_report.json — the SAME "
                               "factor the glb exporter baked into the mesh. "
                               "Use it for emitters attached to that model so "
                               "particles land on the geometry they hang off.",
            "worldUnitScale": "11/600 — the ability port's distance factor "
                              "(600 WC3 range = 11 GGD units). Use it for "
                              "emitters spawned in world space (area art, "
                              "ground effects), NOT for model-attached ones.",
            "warning": "the repo carries three competing WC3->GGD factors "
                       "(1/36 mesh default, 11/600 distance, 1/85 in "
                       "gen_ex_content.py). `raw` is the only unambiguous "
                       "field; convert deliberately.",
        },
        "models": models,
        "parseFailures": parse_failures,
        "notes": notes,
    }
    with open(os.path.join(out_dir, "EMITTERS.json"), "w") as f:
        json.dump(dataset, f, indent=1, ensure_ascii=False)
        f.write("\n")

    with open(os.path.join(out_dir, "MODEL_REFS.json"), "w") as f:
        json.dump({
            "schema": "w3x-model-refs@1",
            "filesScanned": obj["files"],
            "formCounts": dict(form_counts),
            "byField": {f"{fld}|{form}": c
                        for (fld, form), c in sorted(field_form.items())},
            "importedModelsReferenced": len([s for s in by_stem]),
            "importedModelsUnreferenced": sorted(
                m["file"] for m in ok if m["referenceCount"] == 0),
            "refs": refs,
            "attachments": obj["attachments"],
        }, f, indent=1, ensure_ascii=False)
        f.write("\n")

    # ---- markdown summary -------------------------------------------------
    md: list[str] = []
    A = md.append
    A("# Imported-model emitter dataset")
    A("")
    A(f"Source: `{os.path.relpath(src, HERE)}/raw` — "
      f"{summary['modelsScanned']} imported models, "
      f"{summary['modelsFailed']} parse failures.")
    A("")
    A("Machine-readable: `EMITTERS.json` (per model, per emitter, raw + "
      "converted) and `MODEL_REFS.json` (every model-valued object-data field, "
      "classified).")
    A("")
    A("## Census")
    A("")
    A("| | count |")
    A("|---|---:|")
    A(f"| models scanned | {summary['modelsScanned']} |")
    A(f"| models parsed without error | {summary['modelsParsed']} |")
    A(f"| models carrying at least one emitter | {summary['modelsWithEmitters']} |")
    A(f"| PRE2 particle emitters | {summary['particleEmitters2']} |")
    A(f"| RIBB ribbon emitters | {summary['ribbonEmitters']} |")
    A(f"| PREM (v1) emitters | {summary['particleEmittersV1']} |")
    A(f"| models declaring an EMPTY PREM chunk | "
      f"{summary['premChunksDeclaredButEmpty']} |")
    A(f"| **emitters decoded byte-exactly** (consumed their full declared "
      f"inclusiveSize) | **{summary['emittersDecodedByteExact']} / "
      f"{n_p2 + n_rb}** |")
    A(f"| emitters with leftover bytes (layout suspect) | "
      f"{summary['emittersWithLeftoverBytes']} |")
    A(f"| emitters carrying animation tracks beyond visibility | "
      f"{summary['emittersWithAnimationTracks']} |")
    A(f"| emitters with a parse/authoring warning | "
      f"{summary['emittersWithWarnings']} |")
    A(f"| emitters whose texture did not resolve | "
      f"{summary['emittersWithUnresolvedTexture']} |")
    A("")
    A("### Asset classes")
    A("")
    A("| class | models | meaning |")
    A("|---|---:|---|")
    cls_help = {
        "pure-emitter": "zero geometry — the emitters ARE the asset; the glb "
                        "is an empty shell",
        "emitter-dominant-hybrid": "<=48 triangles — a token billboard; the "
                                   "emitters are effectively the whole asset",
        "mesh-and-emitter-hybrid": "real mesh AND emitters — converts to a "
                                   "plausible-looking glb with the particle "
                                   "layer silently missing",
        "mesh-only": "no emitters; the glb is complete",
        "no-geometry-no-emitter": "neither — an invisible carrier or a "
                                  "collision-only stub",
    }
    for cls, cnt in sorted(summary["assetClasses"].items(), key=lambda x: -x[1]):
        A(f"| `{cls}` | {cnt} | {cls_help.get(cls, '')} |")
    A("")
    A("### Pure-emitter models (glb is an empty shell)")
    A("")
    A(", ".join(f"`{x}`" for x in summary["pureEmitterModels"]) or "_none_")
    A("")
    A("### Emitter-dominant hybrids (mesh is a token billboard)")
    A("")
    A(", ".join(f"`{x}`" for x in summary["emitterDominantHybrids"]) or "_none_")
    A("")
    A("## Model-value forms in the object data")
    A("")
    A("| form | fields | meaning |")
    A("|---|---:|---|")
    form_help = {
        "blizzard-stock": "path contains `\\` — a Blizzard asset, NOT in this "
                          "repo (licensing, not conversion)",
        "map-imported": "bare `name.mdx|.mdl` — file is in `raw/`, matched "
                        "case- and extension-insensitively",
        "map-imported-missing": "bare model name with no file in `raw/`",
        "lightning-id": "4 chars — a `Lightning.slk` beam id, there is no model",
        "invisible": "blank / `none.mdl` — DELIBERATELY invisible, a real WC3 "
                     "idiom. Do not make these visible.",
        "unknown": "did not match any known form",
    }
    for form, cnt in sorted(form_counts.items(), key=lambda x: -x[1]):
        A(f"| `{form}` | {cnt} | {form_help.get(form, '')} |")
    A("")
    A("## Per-model detail")
    A("")
    A("| model | class | geosets/tris | PRE2 | RIBB | tracked | lights | "
      "refs | glb bytes |")
    A("|---|---|---|---:|---:|---:|---:|---:|---:|")
    for m in sorted(ok, key=lambda x: (-(len(x.get("emitters", []))
                                         + len(x.get("ribbons", []))),
                                       x["file"])):
        if not (m.get("emitters") or m.get("ribbons")):
            continue
        g = m.get("geometry", {})
        tracked = sum(1 for e in m.get("emitters", [])
                      if e.get("tracks", {}).keys() - {"KP2V"})
        A(f"| `{m['file']}` | {m['assetClass']} | "
          f"{g.get('geosets', '?')}/{g.get('triangles', '?')} | "
          f"{len(m.get('emitters', []))} | {len(m.get('ribbons', []))} | "
          f"{tracked} | {len(m.get('lights', []))} | {m['referenceCount']} | "
          f"{m.get('glbBytes') if m.get('glbBytes') is not None else '—'} |")
    A("")
    A("## Emitter textures actually named by the map")
    A("")
    A("| texture | emitters |")
    A("|---|---:|")
    for name, cnt in map_tex.most_common():
        A(f"| `{name}` | {cnt} |")
    A("")
    if notes:
        A("## Notes")
        A("")
        for n in notes:
            A(f"- {n}")
        A("")
    with open(os.path.join(out_dir, "EMITTERS.md"), "w") as f:
        f.write("\n".join(md))

    print(f"models {summary['modelsScanned']} "
          f"(parsed {summary['modelsParsed']}, failed {summary['modelsFailed']})")
    print(f"PRE2 {n_p2}  RIBB {n_rb}  PREM(v1) {summary['particleEmittersV1']}")
    print(f"asset classes: {dict(summary['assetClasses'])}")
    print(f"model-ref forms: {dict(form_counts)}")
    print(f"-> {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
