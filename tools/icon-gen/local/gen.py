#!/usr/bin/env python3
"""One-shot local icon render — the proof, and the manual-spot-check tool.

    # from a real content doc (derives the subject with src/prompt.py, exactly
    # like the batch runner would):
    .venv/bin/python local/gen.py --doc abilities/godie-e001.q --out /tmp/q.png

    # from a subject clause (skips derivation, keeps the pinned PREFIX+NEGATIVE):
    .venv/bin/python local/gen.py --subject "a coiling dragon; accent hue is jade" --out /tmp/d.png

    # from a fully-formed prompt string (whatever the platform would have sent):
    .venv/bin/python local/gen.py --prompt "<full prompt incl. 'Negative: ...'>" --out /tmp/x.png

Renders on-device (Apple-Silicon MPS) with the model from ICON_GEN_MODEL. The
PREFIX/NEGATIVE and the doc->subject derivation are REUSED from ../src/prompt.py,
so a local render is prompted identically to the paid path.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")
sys.path.insert(0, SRC)
sys.path.insert(0, HERE)

import pipeline  # noqa: E402
from prompt import build_prompt, derive  # noqa: E402


def load_doc(spec: str) -> tuple[str, dict]:
    """`family/id` -> (family, doc) read from content/<family>/<id>.json."""
    family, _, doc_id = spec.partition("/")
    if not family or not doc_id:
        sys.exit(f"gen: --doc must be 'family/id', got {spec!r}")
    root = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
    path = os.path.join(root, "content", family, f"{doc_id}.json")
    if not os.path.exists(path):
        sys.exit(f"gen: no such doc {path}")
    with open(path, encoding="utf-8") as fh:
        return family, json.load(fh)


def main() -> None:
    ap = argparse.ArgumentParser(description="render one icon locally (proof + spot-check)")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--doc", help="content doc as 'family/id' (subject derived via prompt.py)")
    g.add_argument("--subject", help="a subject clause; wrapped in the pinned PREFIX/NEGATIVE")
    # GH#457: composition follows the FAMILY — only champions may draw a character.
    # `--doc` reads the family off the doc itself; a bare `--subject` cannot, so it
    # defaults to the no-character branch (the safe majority) unless told otherwise.
    ap.add_argument("--family", default="", choices=["", "champions", "abilities",
                                                     "items", "augments"],
                    help="composition family for --subject (default: no-character)")
    g.add_argument("--prompt", help="a complete prompt string (as the platform would send)")
    ap.add_argument("--out", required=True, help="output icon path (.webp)")
    ap.add_argument("--size", type=int, default=128, help="output edge in px (default 128)")
    ap.add_argument("--steps", type=int, default=24)
    ap.add_argument("--guidance", type=float, default=7.0)
    ap.add_argument("--seed", type=int, default=None)
    args = ap.parse_args()

    if args.doc:
        family, doc = load_doc(args.doc)
        subject, signal, conf = derive(doc, family)
        full = build_prompt(subject, family)
        print(f"gen: doc {args.doc}  [{signal}/{conf}]\n     subject: {subject}")
    elif args.subject:
        full = build_prompt(args.subject, args.family)
    else:
        full = args.prompt

    pos, neg = pipeline.split_prompt(full)
    print(f"gen: model      {os.environ.get('ICON_GEN_MODEL', pipeline.DEFAULT_MODEL)}")
    print(f"gen: positive   {pos[:160]}{'...' if len(pos) > 160 else ''}")
    print(f"gen: negative   {neg[:120]}{'...' if len(neg) > 120 else ''}")

    t0 = time.time()
    print("gen: loading pipeline + rendering (first run also downloads the model)...")
    img = pipeline.generate(pos, neg, size=args.size, steps=args.steps,
                            guidance=args.guidance, seed=args.seed)
    dt = time.time() - t0

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    # Shipped format is WebP (tools/icon-gen/convert-webp.mjs); these icons
    # are opaque, so RGB keeps the alpha channel from costing bytes.
    if args.out.lower().endswith(".webp"):
        img.convert("RGB").save(args.out, "WEBP", quality=90, method=6)
    else:
        img.save(args.out, "PNG", optimize=True)
    nbytes = os.path.getsize(args.out)
    print(f"gen: wrote {args.out}  {img.size[0]}x{img.size[1]}  {nbytes} bytes  in {dt:.1f}s")
    # Cheap non-blank sanity check: a solid/failed image has ~1 colour.
    extrema = img.convert("RGB").getextrema()
    spread = sum(hi - lo for lo, hi in extrema)
    print(f"gen: colour spread {spread} (0 == blank; a real image is in the hundreds)")
    if spread < 30:
        sys.exit("gen: WARNING image looks blank/solid — check the model load")


if __name__ == "__main__":
    main()
