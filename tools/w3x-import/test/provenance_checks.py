#!/usr/bin/env python3
"""`classify_doc` / `emit_doc` must tell 過期 from 手調 — GH#110's second half.

WHY THIS FILE EXISTS

The extractor used to decide "is this doc hand-tuned?" with

    tuned = json.load(open(shipped_path)) != doc

which is not an answer to that question. A shipped doc differs from a fresh
extraction for two OPPOSITE reasons — someone edited it (keep!) or the tool was
corrected and the data was never regenerated (overwrite!) — and that predicate
resolves both to "keep". So the guard written to protect #37's hand-tuned ribbon
trails spent nine days protecting the 2x-too-large radius bug instead.

The replacement reads a third document, `vfx-provenance.json`, which records the
hash of the bytes THE TOOL WROTE. Everything below asserts on BOTH directions,
because a classifier that only ever says "keep" passes any one-directional test:

    stale (untouched since generation, tool moved)  -> overwrite
    hand-tuned (bytes on disk are not the tool's)   -> keep

These call the SHIPPED functions on real files in a temp tree — not a
re-implementation of the rule, and not a grep for the rule's source text
(failure forms 5 and 6). `extract_particles.VFX_DIR` is repointed at the temp
tree because that global is how emit_doc finds the shipped doc; everything else
is the production path.

Run:  python3 test/provenance_checks.py     (exit 0 = pass; wired into vitest by
                                             test/shippedVfxIsCurrent.test.ts)
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import extract_particles as ep  # noqa: E402

FAILS: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"{'PASS' if ok else 'FAIL'} {label}" + (f": {detail}" if detail else ""))
    if not ok:
        FAILS.append(label)


def write(path: str, text: str) -> None:
    with open(path, "w") as f:
        f.write(text)


def main() -> int:
    tmp = tempfile.mkdtemp(prefix="ggd-provenance-")
    shipped_dir = os.path.join(tmp, "shipped")
    staged_dir = os.path.join(tmp, "staged")
    os.makedirs(shipped_dir)
    os.makedirs(staged_dir)
    real_vfx_dir = ep.VFX_DIR
    ep.VFX_DIR = shipped_dir  # emit_doc resolves the shipped doc through this

    try:
        # The two documents every case is built from: what the tool used to
        # produce, and what it produces today (a corrected radius).
        old_doc = {"id": "d", "schema": "vfx@1", "emitter": {"radius": 0.556}}
        new_doc = {"id": "d", "schema": "vfx@1", "emitter": {"radius": 0.278}}
        old_text, new_text = ep.doc_text(old_doc), ep.doc_text(new_doc)

        # -- (1) STALE: on disk == what the tool wrote last time, tool moved ---
        p = os.path.join(shipped_dir, "stale.json")
        write(p, old_text)
        w, why = ep.classify_doc(p, new_text, ep.sha256_text(old_text), "keep")
        check("stale doc is overwritable", (w, why) == (True, "stale"), f"{w}/{why}")

        # -- (2) HAND-TUNED: on disk != what the tool wrote last time ----------
        # Same starting file, same fresh text — the ONLY difference from (1) is
        # the recorded hash. If the classifier ignored provenance, (1) and (2)
        # would be forced to the same answer, which is the old bug exactly.
        w, why = ep.classify_doc(p, new_text, ep.sha256_text(new_text), "keep")
        check("hand-tuned doc is kept", (w, why) == (False, "hand-tuned"), f"{w}/{why}")

        # -- (3) the two are genuinely distinguished --------------------------
        a = ep.classify_doc(p, new_text, ep.sha256_text(old_text), "keep")
        b = ep.classify_doc(p, new_text, ep.sha256_text(new_text), "keep")
        check("stale and hand-tuned get OPPOSITE verdicts", a[0] is True and b[0] is False,
              f"{a} vs {b}")

        # -- (4) unknown provenance: a decision, so it is a flag --------------
        w_keep, why_keep = ep.classify_doc(p, new_text, None, "keep")
        w_over, _ = ep.classify_doc(p, new_text, None, "overwrite")
        check("no provenance entry -> kept by default",
              (w_keep, why_keep) == (False, "unknown-provenance"), f"{w_keep}/{why_keep}")
        check("--unknown-provenance=overwrite flips it", w_over is True, str(w_over))

        # -- (5) the boring cases still work ----------------------------------
        write(p, new_text)
        w, why = ep.classify_doc(p, new_text, ep.sha256_text(old_text), "keep")
        check("byte-identical doc is 'reproduced'", (w, why) == (True, "reproduced"), why)
        w, why = ep.classify_doc(os.path.join(shipped_dir, "nope.json"), new_text, None, "keep")
        check("missing doc is 'new'", (w, why) == (True, "new"), why)

        # -- (6) emit_doc actually leaves the right bytes on disk -------------
        # Classification is only half of it; failure form 3 says a correct
        # decision that never reaches the file system is not a feature.
        write(os.path.join(shipped_dir, "keepme.json"), old_text)
        fresh_h: dict[str, str] = {}
        cls: dict[str, list[str]] = {}
        ep.emit_doc("keepme", new_doc, os.path.join(shipped_dir, "keepme.json"),
                    {"keepme": ep.sha256_text(new_text)}, "keep", False, "", False,
                    fresh_h, cls)
        with open(os.path.join(shipped_dir, "keepme.json")) as f:
            after = f.read()
        check("in-place run does NOT rewrite a hand-tuned doc", after == old_text)

        write(os.path.join(shipped_dir, "rotten.json"), old_text)
        ep.emit_doc("rotten", new_doc, os.path.join(shipped_dir, "rotten.json"),
                    {"rotten": ep.sha256_text(old_text)}, "keep", False, "", False,
                    fresh_h, cls)
        with open(os.path.join(shipped_dir, "rotten.json")) as f:
            after = f.read()
        check("in-place run DOES rewrite a stale doc", after == new_text)

        # -- (7) the side-car records the GENERATED bytes, never the kept ones -
        # If a kept hand-tune were recorded by its on-disk hash, the next run
        # would see shipped == recorded, call it stale, and revert it. That is a
        # two-run silent revert, and it is the subtlest way this design can fail.
        check("kept doc is recorded by its GENERATED hash",
              fresh_h.get("keepme") == ep.sha256_text(new_text),
              str(fresh_h.get("keepme"))[:12])
        w2, why2 = ep.classify_doc(os.path.join(shipped_dir, "keepme.json"), new_text,
                                   fresh_h["keepme"], "keep")
        check("so a SECOND run still keeps it (no two-run revert)",
              (w2, why2) == (False, "hand-tuned"), f"{w2}/{why2}")

        # -- (8) --overwrite-tuned is a real escape hatch ----------------------
        write(os.path.join(shipped_dir, "forced.json"), old_text)
        ep.emit_doc("forced", new_doc, os.path.join(shipped_dir, "forced.json"),
                    {"forced": ep.sha256_text(new_text)}, "keep", True, "", False,
                    fresh_h, cls)
        with open(os.path.join(shipped_dir, "forced.json")) as f:
            after = f.read()
        check("--overwrite-tuned rewrites a hand-tuned doc", after == new_text)

        # -- (9) --out-dir PREVIEWS the keep instead of silently rewriting -----
        # This is trap (b) from GH#110: with --out-dir the old code saw an empty
        # staging tree, called nothing tuned, and rewrote every ribbon — so the
        # review path was the one path with the safety net off. Staging must
        # show what an in-place run would leave behind.
        write(os.path.join(shipped_dir, "staged.json"), old_text)
        ep.emit_doc("staged", new_doc, os.path.join(staged_dir, "staged.json"),
                    {"staged": ep.sha256_text(new_text)}, "keep", False, staged_dir,
                    False, fresh_h, cls)
        with open(os.path.join(staged_dir, "staged.json")) as f:
            after = f.read()
        check("--out-dir stages the KEPT doc, not a silent overwrite",
              after == old_text, after.replace("\n", " ")[:60])

        # -- (10) the fingerprint moves when the extractor moves ---------------
        fp = ep.tool_fingerprint()
        check("tool fingerprint is a 16-hex digest of the real sources",
              len(fp) == 16 and all(c in "0123456789abcdef" for c in fp), fp)
    finally:
        ep.VFX_DIR = real_vfx_dir
        shutil.rmtree(tmp, ignore_errors=True)

    if FAILS:
        print(f"\n{len(FAILS)} FAILED: {', '.join(FAILS)}")
        return 1
    print("\nall provenance checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
