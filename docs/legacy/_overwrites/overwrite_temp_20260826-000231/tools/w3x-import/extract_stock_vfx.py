#!/usr/bin/env python3
"""Extract the emitters of BLIZZARD-STOCK effect models into shippable vfx docs.

GH#439. `extract_particles.py` covers the 132 models the MAP author imported —
those .mdx bytes live in the map archive, so they converted to glb and their
PRE2 blocks became `content/vfx/godie-*.json`. The models the map merely
REFERENCED by their retail path never entered this repo at all, and the biggest
of them is the most-used effect in the whole game:

    Abilities\\Spells\\Orc\\WarStomp\\WarStompCaster.mdx   150 reference points,
                                                          66 shipped abilities

so 66 casts of 「動地跺」 draw a procedural dust ring that shares nothing with
the original.

WHY THIS IS NOT THE COPYRIGHT PROBLEM IT LOOKS LIKE
---------------------------------------------------
⛔ This tool does NOT ship any Blizzard byte. What it writes is a `vfx@1` doc:
lifetimes, colour stops, sizes, speeds, blend mode — NUMBERS read out of the
retail model on the developer's own machine — plus a CC0 Kenney sprite chosen by
`extract_particles.kenney_substitute`, the SAME deterministic substitution the
282 map-extracted docs already use. Nothing here is a texture, a mesh or an
animation clip, so the output is `content/`-shippable and reaches the live site
through the ordinary `content/` bind-mount, unlike `data/blizzard-overlay/`
(git-ignored, runtime mount only — see content/assets/blizzard-local/README.md).

THE WORKLIST IS DERIVED, NOT TYPED OUT
--------------------------------------
⛔ There is no hand-written list of models in this file. The worklist comes from
`out/vfx-census/MODEL_USAGE.json` (built by `build_vfx_census.py`): every model
that is `form: "blizzard-stock"`, that a FAMILY prototype already claims, and
that clears `--min-refs` OR that the owner's own MDL scan named
(`stock_vfx_owner_named.json`, GH#699). So the day the census promotes another
stock model into a family, re-running this picks it up — ⛔ nobody edits a table.

⚠️ The owner-named channel deliberately relaxes ONLY the ref floor, never the
family requirement: `stockEmitterIds()` derives its ids from
`W3X_ART_FAMILIES[f].models`, so a model no family claims can never be reached
and extracting it would ship content nothing can play.

WHICH EMITTERS SHIP, AND IN WHAT ORDER (--emitter-order)
--------------------------------------------------------
The runtime asks for `p00 … p{MAX_STOCK_EMITTERS_PER_MODEL-1}` — a FIXED window,
3 wide today. A model with more PRE2 blocks than that has its tail silently
dropped at play time, so WHICH emitter lands on `p00` decides what the player
sees. `MarkOfChaosTarget` (PRE2×6) is the first model where that matters.

  visual (default)  drop the emitters that provably cannot change a pixel, then
                    number what is left by descending visual weight. The window
                    lands on the emitters that carry the effect.
  file              verbatim pre-GH#699 behaviour: every emitter, file order.
                    This is the rollback.

⭐ The PRE2 file index and emitter name of every shipped doc are recorded in the
side-car (`docs[].pre2Index` / `.emitter`), and so is every dropped emitter with
its reason — reordering must not cost provenance. ⛔ Do not read `p00` as "the
first PRE2 in the file"; read the side-car.

Usage:
  python3 tools/w3x-import/extract_stock_vfx.py [--dry-run] [--min-refs=N]
                                                [--out-dir=DIR] [--check]
                                                [--emitter-order=visual|file]

  --check    regenerate into a temp tree and diff against the shipped docs;
             exit 1 on any drift. Read-only — safe to run from a guard.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)

from w3xlib.mpq import W3XArchive  # noqa: E402
from w3xlib.particles import parse_particles  # noqa: E402
import extract_particles as ep  # noqa: E402

MODEL_USAGE = os.path.join(HERE, "out", "vfx-census", "MODEL_USAGE.json")
VFX_DIR = os.path.join(REPO, "content", "vfx")
PROVENANCE = os.path.join(HERE, "out", "stock-vfx", "STOCK_VFX.json")
#: GH#699 — the owner's own MDL scan. Data, with a refutable reason per row.
OWNER_NAMED = os.path.join(HERE, "stock_vfx_owner_named.json")

#: Doc-id prefix. `fx.w3x.*` is the family the runtime already resolves; `stock`
#: separates these from the map-archive `fx.w3x.<family>.<model>` docs so the
#: two provenances never look alike in a bundle listing.
ID_PREFIX = "fx.w3x.stock"

#: Reference-count floor, and the ONLY knob that decides how far this reaches.
#:
#: ⭐ 100 is what GH#439 asked for and nothing more: it admits exactly
#: `warstompcaster` (150 refs) + `thunderclapcaster` (123), i.e. both models the
#: `shockwaveRing` prototype names — 66 abilities, one family.
#:
#: ⚠️ It is NOT a "how many are worth it" guess, it is a BLAST-RADIUS gate.
#: The runtime rule (`w3xAbilityArt.stockEmitterIds`) is deliberately uniform —
#: every family plays the emitters of the models it declares — so the extraction
#: floor is the only thing standing between one family and twenty-one. Measured
#: at 40: `burst` picked up 3 extra emitters on EVERY cast (a real visual and
#: budget change nobody asked for; `VfxSystem.boundLayers.test.ts` went red and
#: was RIGHT to). Lowering it is an owner-visible decision, not a tidy-up —
#: run `--min-refs=40 --dry-run` to see exactly which families would change.
DEFAULT_MIN_REFS = 100

#: The retail archives, oldest first so the newest wins — the same priority
#: `extract_stock_sfx.py` uses. They live at the MAIN checkout root; a git
#: worktree does not carry them.
ARCHIVES = ("war3.mpq", "War3x.mpq", "War3xLocal.mpq", "War3Patch.mpq")


# ---------------------------------------------------------------------------
# GH#699 — "can this doc ever change a pixel?", decided BEFORE it ships
# ---------------------------------------------------------------------------
#
# ⭐ These three lines are the SAME numbers `vfxDocsBirthVisibility.test.ts`
# scans the shipped tree with. That guard is the backstop; this is the source
# side, so a stock model with an impossible emitter never produces the doc in
# the first place (第一·五守則: ⛔ 不放任何無效說明).
PEAK_ALPHA_MIN = 0.05     # peak alpha at or below this = transparent all life
BLACK_RGB_MAX = 0.02      # additive/modulate with no colour = adding zero
#
# ⭐ THE FOURTH RULE, WHICH THE SHIPPED-TREE GUARD DOES NOT HAVE YET: modulate
# stacked all-WHITE is the exact mirror of additive stacked all-black, and it is
# provable rather than a judgement call. Babylon's `BLENDMODE_MULTIPLY` is
# `(DST_COLOR, ONE_MINUS_SRC_ALPHA)`:
#
#     out = src.rgb·dst.rgb + dst.rgb·(1 − src.a)
#         = dst.rgb·( tex.rgb·colour.rgb + 1 − tex.a )
#
# Every substituted particle sprite in `content/assets/textures/particles/` is a
# greyscale-plus-alpha PNG whose RGB TRACKS ITS ALPHA (measured: palette entries
# run (50,50,50)@a=26, (218,218,218)@a=202 …), i.e. tex.rgb ≈ tex.a = t. With a
# white doc colour that collapses to
#
#     out = dst.rgb·( t + 1 − t ) = dst.rgb          ← identity, every pixel
#
# so the emitter is not "subtle", it is byte-for-byte nothing. WC3 got away with
# it because `Clouds8x8Mod.blp` carries its shape in ALPHA and modulate there
# darkens through it; our substitution cannot reproduce that, and inventing a
# tint to make it visible would be authoring, not extraction.
WHITE_RGB_MIN = 0.98


def _stops(doc: dict) -> list:
    """Effective colour gradient — `colorStops` OVERRIDES `color` (schema wording)."""
    if doc.get("colorStops"):
        return [s[1] for s in doc["colorStops"]]
    c = doc["color"]
    return [c["start"], c["end"]]


def _sizes(doc: dict) -> list:
    if doc.get("sizeStops"):
        return [s[1] for s in doc["sizeStops"]]
    return [doc["size"]["start"], doc["size"]["end"]]


def invisibility_reasons(doc: dict) -> list[str]:
    """Why this `vfx@1` doc can NEVER draw a pixel. Empty = it has a chance.

    ⛔ Conservative on purpose: it answers "impossible", never "ugly"."""
    colors, sizes = _stops(doc), _sizes(doc)
    out: list[str] = []
    peak_a = max(c[3] for c in colors)
    if peak_a <= PEAK_ALPHA_MIN:
        out.append(f"peak alpha {peak_a} <= {PEAK_ALPHA_MIN} — transparent for its whole life")
    peak_s = max(sizes)
    if peak_s <= 0:
        out.append(f"peak size {peak_s} — the particle has no area")
    blend = doc.get("blendMode")
    if blend in ("additive", "modulate"):
        peak_rgb = max(max(c[0], c[1], c[2]) for c in colors)
        if peak_rgb < BLACK_RGB_MAX:
            out.append(f"{blend} stacked all-black (peak max(R,G,B) {peak_rgb}) — adding zero")
    if blend == "modulate":
        floor_rgb = min(min(c[0], c[1], c[2]) for c in colors)
        if floor_rgb >= WHITE_RGB_MIN:
            out.append(
                f"modulate stacked all-white (min(R,G,B) {floor_rgb} >= {WHITE_RGB_MIN}) — "
                "MULTIPLY by 1 is the identity on every pixel (see WHITE_RGB_MIN)"
            )
    return out


def visual_weight(doc: dict) -> float:
    """Ordering key for the runtime's fixed `p00..p02` window. Bigger = louder.

    ⚠️ `peak alpha × peak size` and nothing else. It is a COARSE ordering key,
    ⛔ not a fidelity claim and ⛔ not a budget number — its only job is to stop
    the window landing on a haze while a 7-unit shockwave ring sits at p04.
    Ties keep file order, so the key is total and the output deterministic."""
    return max(c[3] for c in _stops(doc)) * max(_sizes(doc))


def owner_named_stems() -> dict:
    """-> {stem: reason}. GH#699; see `stock_vfx_owner_named.json` for the why."""
    with open(OWNER_NAMED) as f:
        return {m["stem"]: m["reason"] for m in json.load(f)["models"]}


def repo_with_archives() -> str:
    """Walk up until `war3.mpq` is found (worktrees do not carry the MPQs)."""
    d = REPO
    while True:
        if os.path.exists(os.path.join(d, ARCHIVES[0])):
            return d
        parent = os.path.dirname(d)
        if parent == d:
            raise SystemExit(f"war3.mpq not found at or above {REPO}")
        d = parent


def worklist(min_refs: int, notes: list[str] | None = None) -> list[dict]:
    """Stock models a family prototype claims, ranked by reference count.

    Two admission channels, ONE gate they both still have to pass:
      · refCount >= min_refs           — the blast-radius floor (see above)
      · stem in owner_named_stems()    — GH#699, the owner's own MDL scan
    ⛔ Neither channel waives `family`: a model no prototype claims has no
    reachable doc id, so extracting it would ship unplayable content."""
    with open(MODEL_USAGE) as f:
        census = json.load(f)
    named = owner_named_stems()
    rows: list[dict] = []
    for m in census["models"].values():
        if m.get("form") != "blizzard-stock":
            continue
        if m["stem"] in named and not m.get("family"):
            # Recorded, not hidden: the owner named it and it is STILL out,
            # which is a fact about the family table, not about this tool.
            if notes is not None:
                notes.append(
                    f"{m['stem']}: owner-named but no family claims it — "
                    "no doc id can reach it (give it a family in w3xArtFamilies.ts first)"
                )
            continue
        if not m.get("family"):
            continue
        if m.get("refCount", 0) >= min_refs:
            m = {**m, "admittedBy": "min-refs"}
        elif m["stem"] in named:
            m = {**m, "admittedBy": "owner-named", "ownerReason": named[m["stem"]]}
        else:
            continue
        rows.append(m)
    # ⛔ census stems that the owner named but that are not stock at all / not in
    # the census would vanish silently; say so instead.
    if notes is not None:
        seen = {m["stem"] for m in census["models"].values()}
        for stem in named:
            if stem not in seen:
                notes.append(f"{stem}: owner-named but absent from the census — typo?")
    rows.sort(key=lambda m: (-m["refCount"], m["stem"]))
    return rows


def read_model(root: str, wc3_path: str) -> tuple[bytes, str]:
    """-> (mdx bytes, archive name). The census records `.mdl`; MPQs hold `.mdx`."""
    base = wc3_path.replace("/", "\\")
    cands = [base]
    if base.lower().endswith(".mdl"):
        cands.insert(0, base[:-4] + ".mdx")
    for arc in ARCHIVES:
        p = os.path.join(root, arc)
        if not os.path.exists(p):
            continue
        a = W3XArchive(p)
        try:
            for c in cands:
                if a.has_file(c):
                    return a.read_file(c), arc
        finally:
            a.close()
    raise KeyError(wc3_path)


def build_docs(row: dict, blob: bytes, tex: "ep.TextureResolver", notes: list[str],
               order: str = "visual") -> tuple[list[dict], list[dict], list[dict]]:
    """-> (docs, mapping, dropped). One `vfx@1` doc per SHIPPABLE PRE2.

    `order="file"` is the pre-GH#699 behaviour verbatim: every emitter, file
    order, ids = the PRE2 index. `order="visual"` drops the emitters
    `invisibility_reasons` proves cannot draw, then renumbers what is left by
    descending `visual_weight` — see the module docstring for WHY the numbering
    is what decides the picture."""
    model = parse_particles(blob)
    built: list[tuple[int, str, dict]] = []
    for i, em in enumerate(model.emitters2):
        # ⚠️ built under a PROVENANCE label, ⛔ not the shipping id — the
        # shipping `p{NN}` is assigned after the ordering below. Using `p{i}`
        # here would put a lie in every note `build_p2_doc` emits: those notes
        # would name the slot that PRE2 #i eventually ISN'T (「emissionRate 0,
        # used KP2E peak 40」 on `…p00` when p00 came from PRE2 #4). The label
        # never ships — `doc["id"]` is overwritten below in both orders.
        doc_id = f"{ID_PREFIX}.{row['stem']}.pre2#{i}"
        # DEFAULT_SCALE is the factor the glb exporter bakes into every
        # non-hero mesh; a stock effect model has no entry in models_report,
        # so it is the only defensible answer (and the one `extract_particles`
        # itself falls back to).
        # `build_p2_doc` returns (doc, ambient). The second half says "this
        # emitter is a persistent aura", which only matters to the ambient
        # binder — a CAST plays for `durationSec` either way.
        doc, _ambient = ep.build_p2_doc(doc_id, em, model, ep.DEFAULT_SCALE, tex, False, notes)
        built.append((i, em.name, doc))

    if order == "file":
        docs = [d for _, _, d in built]
        mapping = [{"id": d["id"], "pre2Index": i, "emitter": n,
                    "weight": round(visual_weight(d), 4)} for i, n, d in built]
        return docs, mapping, []

    keep: list[tuple[int, str, dict]] = []
    dropped: list[dict] = []
    for i, name, doc in built:
        reasons = invisibility_reasons(doc)
        if reasons:
            dropped.append({"pre2Index": i, "emitter": name, "reasons": reasons})
            notes.append(f"{row['stem']} PRE2#{i} ({name}): dropped — {'; '.join(reasons)}")
        else:
            keep.append((i, name, doc))
    # descending weight, ties keep file order -> total order -> deterministic
    keep.sort(key=lambda t: (-visual_weight(t[2]), t[0]))
    docs, mapping = [], []
    for slot, (i, name, doc) in enumerate(keep):
        doc["id"] = f"{ID_PREFIX}.{row['stem']}.p{slot:02d}"
        docs.append(doc)
        mapping.append({"id": doc["id"], "pre2Index": i, "emitter": name,
                        "weight": round(visual_weight(doc), 4)})
    return docs, mapping, dropped


def write_doc(path: str, text: str) -> None:
    """🔒 產物隔離區：寫入點自解鎖（`writeProduct()` 的 python 版）。

    `content/vfx/` has no sync-io owner today, so nothing chmods it to 444 —
    ⛔ but a generator that only works while its outputs happen to be writable
    is one registration away from failing with EACCES, and that failure would
    read as "the extractor is broken"."""
    try:
        os.chmod(path, 0o644)
    except OSError:
        pass  # missing / read-only fs / someone else's file — let write() speak
    with open(path, "w") as f:
        f.write(text)


def run(out_root: str, min_refs: int, dry_run: bool, order: str = "visual") -> dict:
    root = repo_with_archives()
    vfx_out = os.path.join(out_root, "vfx")
    tex = ep.TextureResolver(
        dry_run, os.path.join(out_root, "assets", "textures", "particles", "wc3")
    )
    notes: list[str] = []
    manifest: list[dict] = []
    written = 0
    for row in worklist(min_refs, notes):
        try:
            blob, arc = read_model(root, row["paths"][0])
        except KeyError:
            notes.append(f"{row['stem']}: not found in any retail archive — skipped")
            continue
        docs, mapping, dropped = build_docs(row, blob, tex, notes, order)
        if not docs:
            # A mesh-only stock model (no PRE2) has nothing this tool can port.
            # Recorded, not hidden: silence here would read as "extracted fine".
            notes.append(f"{row['stem']}: no shippable PRE2 emitters — nothing to extract")
        for doc in docs:
            if not dry_run:
                os.makedirs(vfx_out, exist_ok=True)
                write_doc(os.path.join(vfx_out, doc["id"] + ".json"), ep.doc_text(doc))
            written += 1
        manifest.append(
            {
                "stem": row["stem"],
                "family": row["family"],
                "wc3Path": row["paths"][0],
                "archive": arc,
                "refCount": row["refCount"],
                "admittedBy": row.get("admittedBy", "min-refs"),
                **({"ownerReason": row["ownerReason"]} if "ownerReason" in row else {}),
                "mdxBytes": len(blob),
                "pre2Count": len(mapping) + len(dropped),
                "docs": [d["id"] for d in docs],
                # ⭐ reordering must not cost provenance — this is where "which
                # PRE2 is p00" is actually answered. ⛔ Do not infer it from the id.
                "emitterMap": mapping,
                "droppedEmitters": dropped,
            }
        )
    report = {
        "schema": "ggd-stock-vfx@1",
        "task": "GH#439 + GH#699",
        "generatedBy": "tools/w3x-import/extract_stock_vfx.py",
        "minRefs": min_refs,
        "emitterOrder": order,
        "textureSubstitutions": dict(tex.substitutions),
        "models": manifest,
        "notes": notes,
    }
    if not dry_run:
        os.makedirs(os.path.dirname(PROVENANCE), exist_ok=True)
        with open(PROVENANCE, "w") as f:
            f.write(json.dumps(report, indent=2) + "\n")
    return report


def check(min_refs: int, order: str = "visual") -> int:
    """Regenerate into a temp tree; exit non-zero if any shipped doc differs."""
    tmp = tempfile.mkdtemp(prefix="ggd-stock-vfx-")
    try:
        report = run(tmp, min_refs, dry_run=False, order=order)
        drift: list[str] = []
        expected: set[str] = set()
        for m in report["models"]:
            for doc_id in m["docs"]:
                expected.add(doc_id)
                fresh = os.path.join(tmp, "vfx", doc_id + ".json")
                shipped = os.path.join(VFX_DIR, doc_id + ".json")
                if not os.path.exists(shipped):
                    drift.append(f"{doc_id}: MISSING from content/vfx/")
                elif open(fresh).read() != open(shipped).read():
                    drift.append(f"{doc_id}: differs from a fresh extraction")
        # ⭐ the other direction. Without this, an emitter that STOPS being
        # extracted (dropped as invisible, renumbered, a family withdrawn)
        # leaves its doc shipped for ever and every gate stays green — the
        # orphan is still in the bundle and the runtime still plays it.
        for f in sorted(os.listdir(VFX_DIR)):
            if not f.startswith(ID_PREFIX + ".") or not f.endswith(".json"):
                continue
            doc_id = f[:-5]
            if doc_id not in expected:
                drift.append(f"{doc_id}: ORPHAN in content/vfx/ — no longer extracted")
        for line in drift:
            print("DRIFT:", line)
        return 1 if drift else 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main() -> int:
    args = sys.argv[1:]
    min_refs = DEFAULT_MIN_REFS
    out_root = os.path.join(REPO, "content")
    dry_run = "--dry-run" in args
    order = "visual"
    for a in args:
        if a.startswith("--min-refs="):
            min_refs = int(a.split("=", 1)[1])
        elif a.startswith("--out-dir="):
            out_root = a.split("=", 1)[1]
        elif a.startswith("--emitter-order="):
            order = a.split("=", 1)[1]
            if order not in ("visual", "file"):
                raise SystemExit(f"--emitter-order must be visual|file, got {order!r}")
    if "--check" in args:
        return check(min_refs, order)
    report = run(out_root, min_refs, dry_run, order)
    for m in report["models"]:
        print(f"{m['stem']:24s} {m['family']:16s} refs={m['refCount']:4d} "
              f"[{m['admittedBy']}] PRE2={m['pre2Count']} -> {len(m['docs'])} doc(s)")
        for e in m["emitterMap"]:
            print(f"    {e['id']:44s} <- PRE2#{e['pre2Index']} {e['emitter']} w={e['weight']}")
    for n in report["notes"]:
        print("note:", n)
    print(f"{'(dry run) ' if dry_run else ''}order={order} models={len(report['models'])} "
          f"docs={sum(len(m['docs']) for m in report['models'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
