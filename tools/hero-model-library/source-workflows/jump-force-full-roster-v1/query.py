#!/usr/bin/env python3
"""Query the generated JUMP FORCE 63-character plan by ID, name or batch."""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query", nargs="?", default="")
    parser.add_argument("--batch", type=int)
    parser.add_argument("--plan", type=Path, default=Path("materials/hero-model-library/source-inventories/jump-force-full-roster-v1/plan.json"))
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    needle = args.query.casefold()
    rows = [
        row for row in plan["characters"]
        if (args.batch is None or row["batch"] == args.batch)
        and (not needle or needle in row["nativeCharacterId"].casefold() or needle in row["characterName"].casefold())
    ]
    if args.json:
        print(json.dumps({"count": len(rows), "characters": rows}, ensure_ascii=False, indent=2))
    else:
        for row in rows:
            counts = ", ".join(f"{key}={value['packageCount']}" for key, value in row["assetClasses"].items())
            print(f"batch {row['batch']:02d}  {row['nativeCharacterId']}  {row['characterName']}  {counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
