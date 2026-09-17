#!/usr/bin/env python3
"""Query acquired community/MOD model, motion, VFX and prop reserves."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
INDEX = ROOT / "materials/hero-model-library/source-inventories/community-unused-assets-v1/inventory.json"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("term", nargs="?", default="")
    parser.add_argument("--kind", choices=("model", "motion", "vfx", "prop"))
    parser.add_argument("--stage", choices=("acquired", "extracted", "converted", "validated", "registered", "selectable", "deployed", "unused"), default="unused")
    parser.add_argument("--components", action="store_true")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    data = json.loads(INDEX.read_text())
    rows = data["components" if args.components else "sources"]
    key = {
        "selectable": "runtimeSelectable", "deployed": "productionDeployed",
        "unused": "unusedForRuntime",
    }.get(args.stage, args.stage)
    selected = []
    for row in rows:
        stage_source = row if args.components else row["pipeline"]
        if stage_source.get(key) is not True:
            continue
        if args.kind and args.kind not in row.get("assetKinds", []):
            continue
        haystack = json.dumps(row, ensure_ascii=False).casefold()
        if args.term.casefold() not in haystack:
            continue
        selected.append(row)
    if args.json:
        print(json.dumps(selected, ensure_ascii=False, indent=2))
    else:
        for row in selected:
            print("\t".join(str(row.get(k, "")) for k in (("id", "sourceId", "nameZh", "assetKinds", "readiness") if args.components else ("sourceId", "target", "sourceFamily", "assetKinds", "readiness"))))


if __name__ == "__main__":
    main()
