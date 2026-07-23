#!/usr/bin/env python3
"""LATE PASS — point every content doc at the icon file that now exists.

`batch.py` can set the `icon` field as it renders, but a full ability run is
~90 minutes of dribbled single-key edits into content/, which collides with the
other agents editing the same directory. So the batch runs with
`--no-write-icon-field` and this script does ONE pass at the end:

  for every doc in champions / items / abilities that has no `icon` field, if
  content/assets/icons/<family>/<id>.webp exists, re-read the doc FROM DISK and
  write the field back, preserving 2-space / ensure_ascii=False formatting.

The re-read is the point: whatever another agent wrote while the GPU was busy
is preserved, because the only thing added is the one key.

  .venv/bin/python local/wire_icon_fields.py [--dry-run] [--family abilities]
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys
from collections import OrderedDict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
CONTENT = os.path.join(ROOT, "content")
FAMILIES = ("champions", "items", "abilities")
ICON_EXT = ".webp"


def wire(family: str, dry_run: bool) -> tuple[int, int, int]:
    wired = have = orphan = 0
    for path in sorted(glob.glob(os.path.join(CONTENT, family, "*.json"))):
        if os.path.basename(path).startswith("_"):
            continue
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh, object_pairs_hook=OrderedDict)
        doc_id = doc.get("id")
        if not doc_id:
            continue
        if doc.get("icon"):
            have += 1
            continue
        rel = f"assets/icons/{family}/{doc_id}{ICON_EXT}"
        if not os.path.exists(os.path.join(CONTENT, rel)):
            orphan += 1
            continue
        if dry_run:
            wired += 1
            continue
        # re-read immediately before writing: content/ is contended
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh, object_pairs_hook=OrderedDict)
        if doc.get("icon"):
            have += 1
            continue
        new = OrderedDict()
        for k, v in doc.items():
            new[k] = v
            if k == "name":
                new["icon"] = rel
        if "icon" not in new:
            new["icon"] = rel
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(new, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        os.replace(tmp, path)
        wired += 1
    return wired, have, orphan


def main() -> None:
    ap = argparse.ArgumentParser(description="late icon-field wiring pass")
    ap.add_argument("--family", choices=list(FAMILIES) + ["all"], default="all")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    fams = FAMILIES if args.family == "all" else (args.family,)
    total = 0
    for fam in fams:
        wired, have, orphan = wire(fam, args.dry_run)
        total += wired
        print(f"{fam:10s} {'would wire' if args.dry_run else 'wired'} {wired:4d}"
              f"  already had {have:4d}  still no file {orphan:4d}")
    print(f"total {'would wire' if args.dry_run else 'wired'}: {total}")
    if not args.dry_run and total:
        print("NEXT: pnpm content:build  (re-derives contentVersion / the ?h= key)")


if __name__ == "__main__":
    main()
