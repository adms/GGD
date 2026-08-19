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
that clears `--min-refs`. So the day the census promotes another stock model
into a family, re-running this picks it up — ⛔ nobody edits a table.

Usage:
  python3 tools/w3x-import/extract_stock_vfx.py [--dry-run] [--min-refs=N]
                                                [--out-dir=DIR] [--check]

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


def worklist(min_refs: int) -> list[dict]:
    """Stock models a family prototype claims, ranked by reference count."""
    with open(MODEL_USAGE) as f:
        census = json.load(f)
    rows = [
        m
        for m in census["models"].values()
        if m.get("form") == "blizzard-stock" and m.get("family") and m.get("refCount", 0) >= min_refs
    ]
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


def build_docs(row: dict, blob: bytes, tex: "ep.TextureResolver", notes: list[str]) -> list[dict]:
    """One `vfx@1` doc per PRE2 on this model, in file order."""
    model = parse_particles(blob)
    out: list[dict] = []
    for i, em in enumerate(model.emitters2):
        doc_id = f"{ID_PREFIX}.{row['stem']}.p{i:02d}"
        # DEFAULT_SCALE is the factor the glb exporter bakes into every
        # non-hero mesh; a stock effect model has no entry in models_report,
        # so it is the only defensible answer (and the one `extract_particles`
        # itself falls back to).
        # `build_p2_doc` returns (doc, ambient). The second half says "this
        # emitter is a persistent aura", which only matters to the ambient
        # binder — a CAST plays for `durationSec` either way.
        doc, _ambient = ep.build_p2_doc(doc_id, em, model, ep.DEFAULT_SCALE, tex, False, notes)
        out.append(doc)
    return out


def run(out_root: str, min_refs: int, dry_run: bool) -> dict:
    root = repo_with_archives()
    vfx_out = os.path.join(out_root, "vfx")
    tex = ep.TextureResolver(
        dry_run, os.path.join(out_root, "assets", "textures", "particles", "wc3")
    )
    notes: list[str] = []
    manifest: list[dict] = []
    written = 0
    for row in worklist(min_refs):
        try:
            blob, arc = read_model(root, row["paths"][0])
        except KeyError:
            notes.append(f"{row['stem']}: not found in any retail archive — skipped")
            continue
        docs = build_docs(row, blob, tex, notes)
        if not docs:
            # A mesh-only stock model (no PRE2) has nothing this tool can port.
            # Recorded, not hidden: silence here would read as "extracted fine".
            notes.append(f"{row['stem']}: no PRE2 emitters — nothing to extract")
        for doc in docs:
            if not dry_run:
                os.makedirs(vfx_out, exist_ok=True)
                with open(os.path.join(vfx_out, doc["id"] + ".json"), "w") as f:
                    f.write(ep.doc_text(doc))
            written += 1
        manifest.append(
            {
                "stem": row["stem"],
                "family": row["family"],
                "wc3Path": row["paths"][0],
                "archive": arc,
                "refCount": row["refCount"],
                "mdxBytes": len(blob),
                "docs": [d["id"] for d in docs],
            }
        )
    report = {
        "schema": "ggd-stock-vfx@1",
        "task": "GH#439",
        "generatedBy": "tools/w3x-import/extract_stock_vfx.py",
        "minRefs": min_refs,
        "textureSubstitutions": dict(tex.substitutions),
        "models": manifest,
        "notes": notes,
    }
    if not dry_run:
        os.makedirs(os.path.dirname(PROVENANCE), exist_ok=True)
        with open(PROVENANCE, "w") as f:
            f.write(json.dumps(report, indent=2) + "\n")
    return report


def check(min_refs: int) -> int:
    """Regenerate into a temp tree; exit non-zero if any shipped doc differs."""
    tmp = tempfile.mkdtemp(prefix="ggd-stock-vfx-")
    try:
        report = run(tmp, min_refs, dry_run=False)
        drift: list[str] = []
        for m in report["models"]:
            for doc_id in m["docs"]:
                fresh = os.path.join(tmp, "vfx", doc_id + ".json")
                shipped = os.path.join(VFX_DIR, doc_id + ".json")
                if not os.path.exists(shipped):
                    drift.append(f"{doc_id}: MISSING from content/vfx/")
                elif open(fresh).read() != open(shipped).read():
                    drift.append(f"{doc_id}: differs from a fresh extraction")
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
    for a in args:
        if a.startswith("--min-refs="):
            min_refs = int(a.split("=", 1)[1])
        elif a.startswith("--out-dir="):
            out_root = a.split("=", 1)[1]
    if "--check" in args:
        return check(min_refs)
    report = run(out_root, min_refs, dry_run)
    for m in report["models"]:
        print(f"{m['stem']:24s} {m['family']:16s} refs={m['refCount']:4d} -> {len(m['docs'])} doc(s)")
    for n in report["notes"]:
        print("note:", n)
    print(f"{'(dry run) ' if dry_run else ''}models={len(report['models'])} "
          f"docs={sum(len(m['docs']) for m in report['models'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
